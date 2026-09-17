/**
 * 音效生成器
 * 用 Node 合成 wav 到 assets/resources/audio/，不需要任何外部依赖，也不需要浏览器。
 * 改音色只需要动下面的 SOUNDS，然后执行：
 *     node tools/gen-audio.js
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.resolve(__dirname, "..", "assets", "resources", "audio");
const SR = 44100;

// ---------- 波形 ----------
const osc = {
  sine:     (t, f) => Math.sin(2 * Math.PI * f * t),
  square:   (t, f) => (Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1),
  triangle: (t, f) => 2 * Math.abs(2 * ((t * f) % 1) - 1) - 1,
  sawtooth: (t, f) => 2 * ((t * f) % 1) - 1,
};

/** 复刻 Web Audio 里的包络：5ms 线性起音，之后指数衰减到 0.001 */
function envelope(t, duration, volume) {
  const attack = 0.005;
  if (t < attack) return volume * (t / attack);
  if (t >= duration) return 0;
  const k = Math.log(0.001 / volume) / (duration - attack);
  return volume * Math.exp(k * (t - attack));
}

function tone(duration, freq, type, volume, startAt = 0, total = null) {
  const len = Math.round((total ?? duration) * SR);
  const out = new Float64Array(len);
  const s0 = Math.round(startAt * SR);
  for (let i = 0; i < len - s0; i++) {
    const t = i / SR;
    if (t >= duration) break;
    out[s0 + i] += osc[type](t, freq) * envelope(t, duration, volume);
  }
  return out;
}

/** 单极点低通，模拟 Web Audio 的 lowpass 800Hz */
function lowpass(buf, fc) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * fc);
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    prev = prev + alpha * (buf[i] - prev);
    buf[i] = prev;
  }
  return buf;
}

function noise(duration, volume) {
  const len = Math.round(duration * SR);
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = (Math.random() * 2 - 1) * (1 - i / len) * volume;
  }
  return lowpass(out, 800);
}

function mix(...bufs) {
  const len = Math.max(...bufs.map((b) => b.length));
  const out = new Float64Array(len);
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}

const seq = (notes, noteDur, type, volume) =>
  mix(...notes.map((f, i) => tone(noteDur, f, type, volume, i * noteDur, notes.length * noteDur)));

// ---------- 音效定义（与 AudioManager 原本的合成参数一致）----------
const SOUNDS = {
  reveal:    () => tone(0.08, 600, "sine", 0.15),
  flag:      () => tone(0.06, 880, "square", 0.10),
  unflag:    () => tone(0.06, 440, "square", 0.10),
  chord:     () => mix(tone(0.10, 700, "triangle", 0.12), tone(0.10, 900, "triangle", 0.10)),
  win:       () => seq([523, 659, 784, 1047], 0.12, "sine", 0.20),
  explosion: () => mix(noise(0.40, 0.30), tone(0.50, 80, "sawtooth", 0.25)),
  click:     () => tone(0.03, 1000, "sine", 0.08),
};

// ---------- WAV 封装 ----------
function toWav(samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    peak = Math.max(peak, Math.abs(v));
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);          // fmt chunk 大小
  header.writeUInt16LE(1, 20);           // PCM
  header.writeUInt16LE(1, 22);           // 单声道
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);      // 字节率
  header.writeUInt16LE(2, 32);           // 块对齐
  header.writeUInt16LE(16, 34);          // 位深
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return { buf: Buffer.concat([header, pcm]), peak };
}

/** 重新读回文件校验头部与数据 */
function verifyWav(file) {
  const b = fs.readFileSync(file);
  if (b.subarray(0, 4).toString() !== "RIFF") throw new Error("缺少 RIFF");
  if (b.subarray(8, 12).toString() !== "WAVE") throw new Error("缺少 WAVE");
  if (b.subarray(12, 16).toString() !== "fmt ") throw new Error("缺少 fmt");
  const channels = b.readUInt16LE(22);
  const sr = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  const dataSize = b.readUInt32LE(40);
  if (dataSize + 44 !== b.length) throw new Error("data 长度与文件不符");
  let sum = 0, peak = 0, n = dataSize / 2;
  for (let i = 0; i < n; i++) {
    const v = b.readInt16LE(44 + i * 2) / 32768;
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  return { channels, sr, bits, sec: n / sr, rms: Math.sqrt(sum / n), peak, size: b.length };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const { buf } = toWav(make());
  const file = path.join(OUT_DIR, `${name}.wav`);
  fs.writeFileSync(file, buf);
  const v = verifyWav(file);
  const silent = v.rms < 0.005 ? "  ⚠️ 几乎无声" : "";
  const clip = v.peak > 0.999 ? "  ⚠️ 削波" : "";
  console.log(
    `✓ ${name}.wav  ${v.sr}Hz ${v.bits}bit ${v.channels}ch  ` +
    `${v.sec.toFixed(2)}s  ${(v.size / 1024).toFixed(1)}KB  rms=${v.rms.toFixed(3)} peak=${v.peak.toFixed(2)}${silent}${clip}`
  );
}
console.log(`\n共写出 ${Object.keys(SOUNDS).length} 个音频到 ${OUT_DIR}`);
