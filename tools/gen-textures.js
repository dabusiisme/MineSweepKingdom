/**
 * 贴图生成器
 * 用无头 Chrome 跑 tools/texture-draw.html 里的绘制逻辑，导出 PNG 到 assets/resources/textures/。
 * 改配色 / 尺寸只需要动 texture-draw.html，然后执行：
 *     node tools/gen-textures.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PAGE = path.join(__dirname, "texture-draw.html");
const DUMP = path.join(require("os").tmpdir(), "msk-textures-dump.html");
const OUT_DIR = path.join(ROOT, "assets", "resources", "textures");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) {
  console.error("找不到 Chrome，请修改脚本里的 CHROME 路径");
  process.exit(1);
}

console.log("正在渲染贴图…");
const dumped = execFileSync(CHROME, [
  "--headless", "--disable-gpu", "--dump-dom", PAGE,
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
fs.writeFileSync(DUMP, dumped);

const raw = dumped;
const m = raw.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.error("找不到输出节点"); process.exit(1); }

const unescape = (s) => s
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

const meta = JSON.parse(unescape(m[1]));
fs.mkdirSync(OUT_DIR, { recursive: true });

// 解析 PNG 的 IHDR，校验写出的文件是合法 PNG 且尺寸正确
function readPngSize(buf) {
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") throw new Error("不是合法 PNG 签名");
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("缺少 IHDR");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

let ok = 0;
for (const [name, info] of Object.entries(meta)) {
  const b64 = info.data.replace(/^data:image\/png;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  const size = readPngSize(buf);
  if (size.w !== info.w || size.h !== info.h) {
    throw new Error(`${name}: 尺寸不符 ${size.w}x${size.h} != ${info.w}x${info.h}`);
  }
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, buf);
  console.log(`✓ ${name}.png  ${size.w}x${size.h}  ${(buf.length / 1024).toFixed(1)} KB`);
  ok++;
}
console.log(`\n共写出 ${ok} 个 PNG 到 ${OUT_DIR}`);
