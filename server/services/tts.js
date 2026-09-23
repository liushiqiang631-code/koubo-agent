// ============ TTS 语音合成服务 ============
// 引擎链：Edge TTS（微软神经语音，免费、自然，Python edge-tts 库驱动）→ Windows SAPI（离线兜底）
// 停顿实现：逐句合成 + PCM 静音拼接，三档停顿真实生效；词级时间戳用于字幕对齐。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MEDIA_DIR, TMP_DIR } from '../config.js';
import { getAudioDuration } from './render.js';

const execFileAsync = promisify(execFile);

// ---- 声音目录（与数字人一一对应）----
export const VOICES = [
  { id: 'xiaoxuan', name: '晓萱 · 温柔女声', edge: 'zh-CN-XiaoxiaoNeural', sapiHint: 'female', gender: '女', styles: ['平稳', '开心', '严肃', '活泼'], desc: '温柔亲和，适合知识分享与品牌介绍' },
  { id: 'haoran', name: '浩然 · 专业男声', edge: 'zh-CN-YunyangNeural', sapiHint: 'male', gender: '男', styles: ['平稳', '严肃'], desc: '新闻播音质感，适合商务与资讯' },
  { id: 'siyu', name: '思雨 · 亲切女声', edge: 'zh-CN-XiaoyiNeural', sapiHint: 'female', gender: '女', styles: ['平稳', '开心', '活泼'], desc: '甜美活泼，适合生活种草内容' },
  { id: 'kaiwen', name: '凯文 · 活力男声', edge: 'zh-CN-YunxiNeural', sapiHint: 'male', gender: '男', styles: ['平稳', '开心', '活泼'], desc: '阳光年轻，适合科技与潮流话题' },
  { id: 'luna', name: 'Luna · 时尚女声', edge: 'zh-CN-XiaomoNeural', sapiHint: 'female', gender: '女', styles: ['平稳', '开心', '严肃'], desc: '气质沉稳，适合时尚与情感表达' },
  { id: 'yunjie', name: '云杰 · 磁性男声', edge: 'zh-CN-YunjianNeural', sapiHint: 'male', gender: '男', styles: ['平稳', '严肃'], desc: '成熟磁性，适合纪录片式解说' },
  { id: 'anqi', name: '安琪 · 优雅女声', edge: 'zh-CN-XiaoxiaoMultilingualNeural', sapiHint: 'female', gender: '女', styles: ['平稳', '开心'], desc: '支持多语言，适合跨境内容' },
  { id: 'zimo', name: '子墨 · 青春男声', edge: 'zh-CN-YunxiaNeural', sapiHint: 'male', gender: '男', styles: ['平稳', '活泼'], desc: '少年感声线，适合校园与故事' },
];

export function findVoice(id) {
  return VOICES.find(v => v.id === id) || VOICES[0];
}

// 情绪 → 基频/语速近似（edge-tts 库暂不支持 express-as style，用 prosody 实现听感差异）
const EMOTION_MAP = {
  '平稳': { rate: 0, pitch: 0 },
  '开心': { rate: 4, pitch: 15 },
  '严肃': { rate: -4, pitch: -8 },
  '活泼': { rate: 8, pitch: 20 },
};
const PAUSE_MS = { '较短': 180, '适中': 380, '较长': 620 };

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?；;\n])/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function runPythonEdge(sentence, { voiceName, ratePct, pitchHz }, outMp3, outWords) {
  const py = process.env.PYTHON || 'python';
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tts_edge.py');
  const args = [script,
    '--text', sentence, '--voice', voiceName,
    '--rate', `${ratePct >= 0 ? '+' : ''}${ratePct}%`,
    '--pitch', `${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz`,
    '--out-audio', outMp3, '--out-words', outWords];
  await execFileAsync(py, args, { timeout: 90000, windowsHide: true });
}

// ---- Edge 引擎：逐句合成 + PCM 拼接 ----
async function edgeSynthesize(text, opts, workDir) {
  const voice = findVoice(opts.voiceId);
  const em = EMOTION_MAP[opts.emotion] || EMOTION_MAP['平稳'];
  const ratePct = Math.round((opts.speed - 1) * 100) + em.rate;
  const pitchHz = em.pitch;
  const pauseSec = (PAUSE_MS[opts.pause] ?? 380) / 1000;
  const sentences = splitSentences(text);
  if (!sentences.length) throw new Error('文本为空');

  const allWords = [];
  const pcmPartsRaw = [];
  let cursor = 0;

  for (let i = 0; i < sentences.length; i++) {
    const mp3 = path.join(workDir, `s${i}.mp3`);
    const wav = path.join(workDir, `s${i}.wav`);
    const wordsF = path.join(workDir, `s${i}.json`);
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        await runPythonEdge(sentences[i], { voiceName: voice.edge, ratePct, pitchHz }, mp3, wordsF);
        ok = fs.existsSync(mp3) && fs.statSync(mp3).size > 800;
      } catch (err) {
        if (attempt === 1) throw new Error(`Edge TTS 合成失败(句${i + 1}): ${err.message.slice(0, 120)}`);
      }
    }
    // mp3 → 24kHz 16bit mono PCM wav
    await execFileAsync('ffmpeg', ['-y', '-i', mp3, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { windowsHide: true });
    const words = JSON.parse(fs.readFileSync(wordsF, 'utf-8'));
    for (const w of words) allWords.push({ text: w.text, start: w.start + cursor, end: w.end + cursor });
    const buf = fs.readFileSync(wav);
    pcmPartsRaw.push(buf);
    cursor += await getAudioDuration(wav);
    if (i < sentences.length - 1) cursor += pauseSec;
  }

  // 拼接：解析每个 wav 的 data chunk（ffmpeg 头部长度可变），手写标准 44 字节 RIFF 头
  const parseDataChunk = (buf) => {
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === 'data') return buf.subarray(off + 8, off + 8 + size);
      off += 8 + size + (size % 2);
    }
    throw new Error('wav 中未找到 data chunk');
  };
  const pcmParts = pcmPartsRaw.map(parseDataChunk);
  const mkHeader = (dataLen) => {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0, 'ascii');
    h.writeUInt32LE(36 + dataLen, 4);
    h.write('WAVE', 8, 'ascii');
    h.write('fmt ', 12, 'ascii');
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);   // PCM
    h.writeUInt16LE(1, 22);   // mono
    h.writeUInt32LE(24000, 24);
    h.writeUInt32LE(48000, 28); // byte rate
    h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34);
    h.write('data', 36, 'ascii');
    h.writeUInt32LE(dataLen, 40);
    return h;
  };
  const silence = Buffer.alloc(Math.round(24000 * 2 * pauseSec));
  const pcmList = [];
  pcmParts.forEach((pcm, i) => {
    pcmList.push(pcm);
    if (i < pcmParts.length - 1) pcmList.push(silence);
  });
  const totalLen = pcmList.reduce((s, b) => s + b.length, 0);
  const final = Buffer.concat([mkHeader(totalLen), ...pcmList]);
  const outFile = path.join(workDir, 'final.wav');
  fs.writeFileSync(outFile, final);
  const durationSec = await getAudioDuration(outFile);
  return { file: outFile, words: allWords, engine: 'edge', durationSec };
}

// ---- Windows SAPI 离线兜底 ----
async function sapiListVoices() {
  const script = 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }';
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script], { timeout: 30000, windowsHide: true });
    return stdout.split('\r\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function sapiSynthesize(text, opts, outWav) {
  const installed = await sapiListVoices();
  const zhVoice = installed.find(v => /Huihui|Yaoyao|Kangkang|Yao-|Hao-|zh/i.test(v)) || installed[0];
  if (!zhVoice) throw new Error('SAPI 失败：未找到系统语音');
  const rate = Math.max(-10, Math.min(10, Math.round((opts.speed - 1) * 7)));
  const pause = PAUSE_MS[opts.pause] ?? 380;
  const lines = splitSentences(text).map(s => s.replace(/'/g, "''"));
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoice('${zhVoice.replace(/'/g, "''")}') } catch {}
$s.Rate = ${rate}
$s.SetOutputToWaveFile('${outWav.replace(/'/g, "''")}')
$pb = New-Object System.Speech.Synthesis.PromptBuilder
${lines.map(s => `$pb.AppendText('${s}')\n$pb.AppendBreak([System.TimeSpan]::FromMilliseconds(${pause}))`).join('\n')}
$s.Speak($pb)
$s.Dispose()`;
  const tmpPs1 = path.join(os.tmpdir(), `sapi_${Date.now()}.ps1`);
  // PowerShell 5 按 ANSI 读取无 BOM 脚本，必须写 UTF-8 BOM 才能正确处理中文
  fs.writeFileSync(tmpPs1, '\uFEFF' + script, 'utf-8');
  try {
    await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs1], { timeout: 180000, windowsHide: true });
  } finally {
    fs.rmSync(tmpPs1, { force: true });
  }
  if (!fs.existsSync(outWav) || fs.statSync(outWav).size < 1000) throw new Error('SAPI 合成失败：未生成音频');
  const dur = await getAudioDuration(outWav);
  // SAPI 无时间戳：按句长比例估算词时间轴
  const chars = text.replace(/\s/g, '').length;
  const sentences = splitSentences(text);
  let cur = 0.1;
  const words = sentences.map(s => {
    const d = Math.max(0.4, (s.replace(/\s/g, '').length / chars) * (dur - 0.2));
    const w = { text: s, start: cur, end: cur + d };
    cur += d;
    return w;
  });
  return { words, dur };
}

// ---- 对外主入口 ----
export async function synthesize(text, { voiceId = 'xiaoxuan', speed = 1, emotion = '平稳', pause = '适中', outDir = MEDIA_DIR, baseName } = {}) {
  findVoice(voiceId);
  const id = baseName || `tts_${Date.now().toString(36)}`;
  const settings = (await import('../db.js')).get().settings;
  const forceEdge = settings?.tts?.engine === 'edge';
  const workDir = fs.mkdtempSync(path.join(TMP_DIR, 'tts_'));

  try {
    const r = await edgeSynthesize(text, { voiceId, speed, emotion, pause }, workDir);
    const finalPath = path.join(outDir, `${id}.wav`);
    fs.copyFileSync(r.file, finalPath);
    return { file: finalPath, words: r.words, engine: 'edge', durationSec: r.durationSec };
  } catch (err) {
    console.warn('[tts] Edge 合成失败，回退 SAPI:', err.message);
    if (forceEdge) throw err;
    const wavPath = path.join(outDir, `${id}.wav`);
    const { words, dur } = await sapiSynthesize(text, { voiceId, speed, emotion, pause }, wavPath);
    return { file: wavPath, words, engine: 'sapi', durationSec: dur };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export async function preview(text, opts = {}) {
  // 懒清理：删掉 30 分钟前的试听缓存，避免文件累积
  const dir = opts.outDir || MEDIA_DIR;
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('preview_')) continue;
      const p = path.join(dir, f);
      if (now - fs.statSync(p).mtimeMs > 30 * 60 * 1000) fs.rmSync(p, { force: true });
    }
  } catch { /* ignore */ }
  return synthesize(text, opts);
}

// CLI 自检：node tts.js --selftest
if (process.argv[1] && process.argv[1].endsWith('tts.js') && process.argv.includes('--selftest')) {
  const text = '你好，我是你的口播智能体。今天我们来聊聊，如何用人工智能提升表达效率。';
  console.log('[selftest] 开始 Edge TTS 合成…');
  console.time('合成耗时');
  synthesize(text, { voiceId: 'xiaoxuan', speed: 1, emotion: '开心', baseName: 'selftest' })
    .then(r => {
      console.timeEnd('合成耗时');
      console.log('[selftest] OK', JSON.stringify({ engine: r.engine, file: r.file, durationSec: r.durationSec, words: r.words?.length }));
      process.exit(0);
    })
    .catch(e => { console.error('[selftest] FAIL', e.message); process.exit(1); });
}
