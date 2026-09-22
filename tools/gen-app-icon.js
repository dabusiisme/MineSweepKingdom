/**
 * 应用图标生成器
 * 生成 512x512 的「扫雷大王」图标，输出到 design/。
 *     node tools/gen-app-icon.js
 *
 * 配色取自参考图 app-icon.png 的实测值：
 *   背景 中性近黑，主体 奶油白，点缀 暖琥珀。
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "design");
const PAGE = path.join(os.tmpdir(), "msk-icon-draw.html");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const html = `<!doctype html>
<html><head><meta charset="utf-8"></head><body><pre id="out">PENDING</pre>
<script>
const DEFAULT_SIZE = 512;

function roundRect(g, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rad, y);
  g.lineTo(x + w - rad, y);
  g.arcTo(x + w, y, x + w, y + rad, rad);
  g.lineTo(x + w, y + h - rad);
  g.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  g.lineTo(x + rad, y + h);
  g.arcTo(x, y + h, x, y + h - rad, rad);
  g.lineTo(x, y + rad);
  g.arcTo(x, y, x + rad, y, rad);
  g.closePath();
}

// ---- 配色（对照参考图实测）----
const C = {
  bg:        "#16161A",              // 中性近黑
  tile:      "rgba(255,255,255,0.030)",
  glow:      "rgba(255,255,255,0.055)",
  bodyTop:   "#F7EFE0",              // 奶油白（参考 rgb 237,225,203）
  bodyBot:   "#DFCFB2",
  spike:     "#CE9A55",              // 暖琥珀（参考暖色主体 rgb 212,167,85）
  spikeDeep: "#AA4C3F",              // 参考里的砖红点缀
  face:      "#26262D",              // 深色五官
  faceSoft:  "rgba(38,38,45,0.55)",
  warmGlow:  "rgba(188,134,76,0.20)",
};

function background(g, B) {
  g.fillStyle = C.bg;
  g.fillRect(0, 0, B, B);
  const glow = g.createRadialGradient(B * 0.5, B * 0.2, B * 0.04, B * 0.5, B * 0.2, B * 0.8);
  glow.addColorStop(0, C.glow);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, B, B);
}

function drawMine(g, mode, B) {
  const cx = B / 2, cy = B * 0.49;
  // 参考图里奶油白主体只占画面宽度的 ~30%，这里取 35% 保证小尺寸下还看得清
  const R = B * 0.175;
  const withFace = mode !== "simple";

  // 主体后方的暖光，呼应参考图里的琥珀点缀
  const warm = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 2.1);
  warm.addColorStop(0, C.warmGlow);
  warm.addColorStop(1, "rgba(188,134,76,0)");
  g.fillStyle = warm;
  g.fillRect(0, 0, B, B);

  // 八根圆头尖刺（暖琥珀）
  g.strokeStyle = C.spike;
  g.lineWidth = R * 0.185;
  g.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * R * 0.84);
    g.lineTo(cx + Math.cos(a) * R * 1.38, cy + Math.sin(a) * R * 1.38);
    g.stroke();
  }

  // 奶油白球体
  const body = g.createLinearGradient(0, cy - R, 0, cy + R);
  body.addColorStop(0, C.bodyTop);
  body.addColorStop(1, C.bodyBot);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = body;
  g.fill();

  // 左上柔光
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  const hl = g.createRadialGradient(cx - R * 0.34, cy - R * 0.4, R * 0.05, cx - R * 0.34, cy - R * 0.4, R * 0.98);
  hl.addColorStop(0, "rgba(255,255,255,0.55)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(0, 0, B, B);
  g.restore();

  if (withFace) {
    g.fillStyle = C.face;
    const ex = R * 0.33, ey = R * 0.02, er = R * 0.135;
    [-1, 1].forEach(function (s) {
      g.beginPath();
      g.ellipse(cx + s * ex, cy + ey, er, er * 1.3, 0, 0, Math.PI * 2);
      g.fill();
    });
    g.strokeStyle = C.face;
    g.lineWidth = R * 0.08;
    g.lineCap = "round";
    g.beginPath();
    g.arc(cx, cy + R * 0.16, R * 0.31, Math.PI * 0.2, Math.PI * 0.8);
    g.stroke();
  } else {
    // 简洁版：一道暖色弧线代替表情，保持图形有呼吸感
    g.strokeStyle = C.spike;
    g.lineWidth = R * 0.085;
    g.lineCap = "round";
    g.beginPath();
    g.arc(cx, cy, R * 0.6, Math.PI * 0.12, Math.PI * 0.62);
    g.stroke();
  }

  if (mode === "flag") {
    // 右上角插一面小旗，补一点参考图里的砖红
    const px = cx + R * 0.62, py = cy - R * 0.62, ph = R * 0.95;
    g.strokeStyle = C.bodyTop;
    g.lineWidth = R * 0.11;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(px, py + ph * 0.5);
    g.lineTo(px, py - ph * 0.5);
    g.stroke();
    g.beginPath();
    g.moveTo(px - R * 0.16, py + ph * 0.62);
    g.lineTo(px + R * 0.2, py + ph * 0.62);
    g.stroke();
    g.fillStyle = C.spikeDeep;
    g.beginPath();
    g.moveTo(px + R * 0.05, py - ph * 0.5);
    g.lineTo(px + R * 0.72, py - ph * 0.2);
    g.lineTo(px + R * 0.05, py + ph * 0.1);
    g.closePath();
    g.fill();
  }
}

// 直接在目标尺寸上绘制，放大尺寸不会糊
function iconCanvas(mode, size) {
  const B = size || DEFAULT_SIZE;
  const c = document.createElement("canvas");
  c.width = B; c.height = B;
  const g = c.getContext("2d");
  background(g, B);
  drawMine(g, mode, B);
  return c;
}

// 预览图：圆角半径按参考图实测的 15%
function sheetCanvas() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 400;
  const g = c.getContext("2d");
  g.fillStyle = "#F1F4F9";
  g.fillRect(0, 0, c.width, c.height);
  const items = [
    iconCanvas("simple", 240),
    iconCanvas("cartoon", 240),
    iconCanvas("flag", 240),
  ];
  const startX = 108, gap = 148, y = 80;
  items.forEach(function (ic, i) {
    const x = startX + i * (240 + gap);
    g.save();
    roundRect(g, x, y, 240, 240, 240 * 0.15);
    g.clip();
    g.drawImage(ic, x, y);
    g.restore();
  });
  return c;
}

const out = {
  "app-icon-a-simple-512":  iconCanvas("simple", 512).toDataURL("image/png"),
  "app-icon-b-cartoon-512": iconCanvas("cartoon", 512).toDataURL("image/png"),
  "app-icon-c-flag-512":    iconCanvas("flag", 512).toDataURL("image/png"),
  "app-icon-b-cartoon-600": iconCanvas("cartoon", 600).toDataURL("image/png"),
  "app-icon-a-simple-600":  iconCanvas("simple", 600).toDataURL("image/png"),
  "app-icon-c-flag-600":    iconCanvas("flag", 600).toDataURL("image/png"),
  "app-icon-preview-sheet": sheetCanvas().toDataURL("image/png"),
};
document.getElementById("out").textContent = JSON.stringify(out);
</script></body></html>`;

if (!fs.existsSync(CHROME)) {
    console.error("找不到 Chrome，请修改脚本里的 CHROME 路径");
    process.exit(1);
}
fs.writeFileSync(PAGE, html);
console.log("正在渲染图标…");

const dumped = execFileSync(CHROME, ["--headless", "--disable-gpu", "--dump-dom", PAGE], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024,
});

const m = dumped.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.error("渲染失败：拿不到输出节点"); process.exit(1); }
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const images = JSON.parse(unescape(m[1]));

function pngSize(buf) {
    if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("不是合法 PNG");
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, dataUrl] of Object.entries(images)) {
    const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
    const size = pngSize(buf);
    fs.writeFileSync(path.join(OUT_DIR, name + ".png"), buf);
    console.log(`✓ ${name}.png  ${size.w}x${size.h}  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`\n输出目录：${OUT_DIR}`);
