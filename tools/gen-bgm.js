/**
 * BGM 生成器
 * 合成一段轻柔的循环背景音乐，输出到 assets/resources/audio/。
 *     node tools/gen-bgm.js
 *
 * 设计：C 大调 4 小节循环，72 BPM。只有三层——铺底和弦垫、稀疏的主旋律、每小节一个低音。
 * 无缝循环的做法：先渲染到「循环长度 + 尾巴」，再把超出循环点的尾巴叠回开头，
 * 这样长释放的音不会被硬切断，接缝处听不出来。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OUT_DIR = path.resolve(__dirname, "..", "assets", "resources", "audio");

// ---------- 音乐参数 ----------
const SR = 44100;
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOP_SEC = BAR * 4;      // 4 小节
const TAIL_SEC = 3;            // 尾巴长度，要盖过最长的释放
const PEAK = 0.62;             // 归一化目标峰值，留足余量别削波
const KEEP_WAV = process.argv.includes("--wav");   // 加 --wav 就同时保留无损 wav

const SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
function hz(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  const midi = (parseInt(m[2], 10) + 1) * 12 + SEMI[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------- 包络 ----------
const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/** 起音-保持-释放，全部用 smoothstep 软过渡 */
function envAR(t, dur, atk, rel) {
  if (t < 0 || t >= dur) return 0;
  if (t < atk) return smooth(t / atk);
  const relStart = dur - rel;
  if (t < relStart) return 1;
  return smooth((dur - t) / rel);
}

/** 拨弦/音乐盒：快起音 + 指数衰减 */
function envPluck(t, dur) {
  if (t < 0 || t >= dur) return 0;
  const atk = 0.015;
  if (t < atk) return t / atk;
  const k = Math.log(1000) / Math.max(0.05, dur - atk);
  return Math.exp(-k * (t - atk));
}

// ---------- 音色 ----------
/** 和弦垫：两个略微失谐的正弦叠加，产生柔和的拍频 */
function padSample(t, f) {
  return Math.sin(2 * Math.PI * f * t) * 0.75
       + Math.sin(2 * Math.PI * f * 1.0025 * t) * 0.55
       + Math.sin(2 * Math.PI * f * 2 * t) * 0.06;
}

/** 音乐盒：基频 + 少量泛音，柔和但有颗粒感 */
function pluckSample(t, f) {
  return Math.sin(2 * Math.PI * f * t)
       + Math.sin(2 * Math.PI * f * 2 * t) * 0.22
       + Math.sin(2 * Math.PI * f * 3 * t) * 0.07;
}

function addVoice(buf, startSec, freq, durSec, vol, sampleFn, envFn) {
  const s0 = Math.round(startSec * SR);
  const n = Math.round(durSec * SR);
  for (let i = 0; i < n; i++) {
    const idx = s0 + i;
    if (idx < 0 || idx >= buf.length) continue;
    const t = i / SR;
    buf[idx] += sampleFn(t, freq) * envFn(t, durSec) * vol;
  }
}

// ---------- 编曲 ----------
// 4 小节：Cmaj7 → Am7 → Fmaj7 → G7，最后一小节停在属和弦，回到开头正好解决到主和弦
const CHORDS = [
  { pad: ["C4", "E4", "G4", "B4"], bass: "C3" },
  { pad: ["A3", "C4", "E4", "G4"], bass: "A2" },
  { pad: ["F3", "A3", "C4", "E4"], bass: "F3" },
  { pad: ["G3", "B3", "D4", "F4"], bass: "G3" },
];

// 主旋律：每小节 2 个音，落在和弦音上，节奏留白多
const MELODY = [
  [["E5", 0], ["D5", 2.0]],
  [["C5", 0], ["E5", 2.5]],
  [["F5", 0], ["E5", 2.0]],
  [["D5", 0], ["B4", 2.5]],
];

function render() {
  const total = LOOP_SEC + TAIL_SEC;
  const buf = new Float64Array(Math.round(total * SR));

  for (let bar = 0; bar < 4; bar++) {
    const t0 = bar * BAR;
    const ch = CHORDS[bar];

    // 和弦垫：略微提前收，让释放落在下一小节
    ch.pad.forEach((n, i) => {
      addVoice(buf, t0, hz(n), BAR + 1.4, 0.085 - i * 0.008, padSample,
        (t, d) => envAR(t, d, 0.9, 1.4));
    });

    // 低音：整小节长音，音量压得很低，只提供厚度
    addVoice(buf, t0, hz(ch.bass), BAR + 1.0, 0.10, padSample,
      (t, d) => envAR(t, d, 0.35, 1.0));

    // 主旋律
    MELODY[bar].forEach(([n, beat]) => {
      addVoice(buf, t0 + beat * BEAT, hz(n), 2.2, 0.13, pluckSample, envPluck);
    });
  }

  // ---- 无缝循环：把超出循环点的尾巴叠回开头 ----
  const loopN = Math.round(LOOP_SEC * SR);
  const out = buf.slice(0, loopN);
  const tailN = buf.length - loopN;
  for (let i = 0; i < tailN; i++) out[i] += buf[loopN + i];

  // 归一化
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? PEAK / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

// ---------- WAV ----------
function toWav(samples, sr) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---------- 质量检查 ----------
function audit(samples, sr) {
  let sum = 0, peak = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  // 接缝平滑度：把「末尾→开头」的跳变和内部平均逐样本跳变比一比
  let stepSum = 0;
  for (let i = 1; i < samples.length; i++) stepSum += Math.abs(samples[i] - samples[i - 1]);
  const avgStep = stepSum / (samples.length - 1);
  const seamJump = Math.abs(samples[0] - samples[samples.length - 1]);
  return {
    sec: samples.length / sr,
    peak: peak,
    rms: Math.sqrt(sum / samples.length),
    seamRatio: seamJump / Math.max(1e-9, avgStep),
  };
}

/** Goertzel：算某个频率上的能量，用来确认音高没写错 */
function goertzel(buf, freq, sr) {
  const coeff = 2 * Math.cos(2 * Math.PI * freq / sr);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const s0 = buf[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / buf.length;
}

// ---------- 主流程 ----------
const samples = render();
const a = audit(samples, SR);
const wavPath = path.join(OUT_DIR, "bgm_home.wav");
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(wavPath, toWav(samples, SR));

console.log(`时长 ${a.sec.toFixed(2)}s  峰值 ${a.peak.toFixed(3)}  RMS ${a.rms.toFixed(3)}`);
console.log(`接缝跳变 / 平均逐样本跳变 = ${a.seamRatio.toFixed(2)}  (接近 1 表示接缝听不出来)`);
console.log(`WAV  ${(fs.statSync(wavPath).size / 1024).toFixed(0)} KB`);

// 音高自检：和弦根音的能量应该明显高于它上方半音的能量
console.log("音高自检（根音能量 / 高半音能量，大于 3 说明音高正确）：");
CHORDS.forEach((ch, i) => {
  const f = hz(ch.bass);
  const r = goertzel(samples, f, SR) / Math.max(1e-9, goertzel(samples, f * Math.pow(2, 1 / 12), SR));
  console.log(`  第${i + 1}小节 ${ch.bass.padEnd(3)} 比值 ${r.toFixed(1)}  ${r > 3 ? "✓" : "✗ 偏低"}`);
});

// 用 ffmpeg 转 mp3（macOS 自带的 afconvert 只能解不能编）
const mp3Path = path.join(OUT_DIR, "bgm_home.mp3");
function has(cmd) {
  try { execFileSync("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] }); return true; }
  catch { return false; }
}
if (has("ffmpeg")) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath,
    "-codec:a", "libmp3lame", "-b:a", "96k", "-ac", "1", mp3Path],
    { stdio: ["ignore", "ignore", "pipe"] });
  const mp3Kb = fs.statSync(mp3Path).size / 1024;
  console.log(`MP3  ${mp3Kb.toFixed(0)} KB  (96kbps 单声道)`);

  // MP3 编码器会补静音帧，循环播放时接缝处可能出现小段空白。
  // 这里把 mp3 解回来数样本数，多出来的部分就是这段 padding。
  const decoded = execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3Path,
    "-f", "s16le", "-ac", "1", "-ar", String(SR), "-"],
    { maxBuffer: 256 * 1024 * 1024 });
  const pad = (decoded.length / 2) - samples.length;
  console.log(`解码回来比原始多 ${pad} 个样本 = ${(pad / SR * 1000).toFixed(0)} ms（循环接缝的空白）`);
  console.log(pad / SR < 0.05
    ? "接缝空白 < 50ms，配合曲子开头本来就轻，基本听不出来"
    : "接缝空白偏大，建议改用 wav 保证无缝");

  if (KEEP_WAV) console.log("已保留 wav（绝对无缝，体积大）");
  else { fs.unlinkSync(wavPath); console.log("已保留 mp3，删掉体积更大的 wav"); }
} else {
  console.log("没找到 ffmpeg，保留 wav（体积较大但绝对无缝）");
}
