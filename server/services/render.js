// ============ 视频渲染管线（ffmpeg） ============
// 数字人底图（Pillow 绘制）+ 配音 + 词级对齐字幕（PIL 预渲染 PNG → overlay）+ 缓慢推镜 → MP4
// 注：gyan 构建 ffmpeg 的 drawtext/libass 在部分 Windows 环境异常，故字幕走 PNG overlay（渲染更快更稳定）。

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_DIR, TMP_DIR } from '../config.js';
import { renderSceneImage } from './avatars.js';

const execFileAsync = promisify(execFile);
const SCENE_PY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scene.py');

export async function getAudioDuration(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]);
  const d = parseFloat(stdout.trim());
  return Number.isFinite(d) ? d : 0;
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function pyRender(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env.PYTHON || 'python', [SCENE_PY, ...args], { windowsHide: true });
    let err = '';
    proc.stderr.on('data', d => { err += String(d); });
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`Pillow 渲染失败: ${err.slice(-300)}`))));
  });
}

// ---- 字幕分行：把词级时间戳合并为 ≤maxChars 的行 ----
export function buildSubtitleLines(words, { maxChars = 13, gapBreak = 0.45 } = {}) {
  if (!words || !words.length) return [];
  const lines = [];
  let cur = null;
  for (const w of words) {
    if (!w.text || !w.text.trim()) continue;
    const gap = cur ? w.start - cur.end : 0;
    // Edge 词边界不含标点：句号级停顿（间隙大）或达到字数上限即分行
    if (cur && (gap >= gapBreak || cur.text.replace(/\s/g, '').length >= maxChars)) {
      lines.push(cur);
      cur = null;
    }
    if (!cur) cur = { text: '', start: w.start, end: w.end };
    cur.text += w.text;
    cur.end = w.end;
  }
  if (cur) lines.push(cur);
  // 相邻行不重叠（词时间戳与音频存在毫秒级抖动）
  for (let i = 0; i < lines.length - 1; i++) {
    lines[i].end = Math.min(lines[i].end, lines[i + 1].start - 0.06);
  }
  return lines.filter(l => l.text.trim() && l.end > l.start);
}

// ---- 渲染主流程 ----
export async function renderVideo({ project, audioFile, words, onProgress = () => {} }) {
  const aspect = project.aspect === '16:9' ? '16:9' : '9:16';
  const [W, H] = aspect === '16:9' ? [1920, 1080] : [1080, 1920];
  const fps = 30;
  const workDir = fs.mkdtempSync(path.join(TMP_DIR, 'r_'));
  const finalPath = path.join(MEDIA_DIR, `${project.id}.mp4`);
  const coverPath = path.join(MEDIA_DIR, `${project.id}_cover.jpg`);
  const subYExpr = aspect === '16:9' ? 'main_h-240' : 'main_h-430';

  try {
    onProgress({ stage: '画面生成', progress: 0.05 });

    // 1. 底图（内置数字人 / 上传肖像照）
    let avatarOrPath = project.avatarId;
    const { findAvatar, AVATARS } = await import('./avatars.js');
    const avatar = findAvatar(project.avatarId);
    if (avatar) {
      avatarOrPath = avatar;
    } else {
      const { get } = await import('../db.js');
      const asset = get().assets.find(a => a.id === project.avatarId);
      if (asset) avatarOrPath = asset.file;
      else avatarOrPath = AVATARS[0];
    }
    const baseImage = path.join(workDir, 'base.png');
    await renderSceneImage(avatarOrPath, baseImage, aspect);

    onProgress({ stage: '语音合成', progress: 0.15 });
    const audioPath = audioFile;
    const audioDur = (await getAudioDuration(audioPath)) || project.durationSec || 10;
    const totalFrames = Math.max(30, Math.ceil((audioDur + 0.5) * fps));

    // 2. 字幕 PNG（每行一张，时间对齐到词级时间戳）
    const lines = buildSubtitleLines(words, { maxChars: aspect === '16:9' ? 16 : 13 });
    const subs = [];
    for (let i = 0; i < lines.length; i++) {
      const f = path.join(workDir, `sub_${i}.png`);
      await pyRender(['--sub', lines[i].text.trim(), '--out', f]);
      subs.push({ file: f, start: lines[i].start, end: lines[i].end });
    }

    // 水印 PNG
    let wmFile = null;
    if (project.watermark) {
      wmFile = path.join(workDir, 'wm.png');
      await pyRender(['--wm', '@' + String(project.watermark).replace(/^@/, ''), '--out', wmFile]);
    }

    onProgress({ stage: '视频渲染', progress: 0.2 });

    // 3. ffmpeg：单帧推镜 + 字幕/水印 overlay 链
    const inputs = ['-i', baseImage, ...subs.flatMap(s => ['-i', s.file])];
    if (wmFile) inputs.push('-i', wmFile);
    const audioIndex = 1 + subs.length + (wmFile ? 1 : 0);
    inputs.push('-i', audioPath);

    const filters = [
      `[0:v]zoompan=z='1+0.055*on/${totalFrames}'` +
      `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
      `:d=${totalFrames}:s=${W}x${H}:fps=${fps},format=yuv420p[base]`,
    ];
    let prev = 'base';
    subs.forEach((s, i) => {
      const out = `s${i}`;
      filters.push(
        `[${prev}][${i + 1}:v]overlay=(main_w-overlay_w)/2:${subYExpr}` +
        `:enable='between(t,${s.start.toFixed(2)},${s.end.toFixed(2)})'[${out}]`);
      prev = out;
    });
    if (wmFile) {
      const wmIdx = 1 + subs.length;
      filters.push(`[${prev}][${wmIdx}:v]overlay=main_w-overlay_w-46:54[lv]`);
      prev = 'lv';
    }
    inputs.push('-filter_complex', filters.join(';'));

    const args = [
      '-y', ...inputs,
      '-map', `[${prev}]`, '-map', `${audioIndex}:a`,
      '-af', 'apad=pad_dur=0.5',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(project.crf || 23),
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
      '-t', (audioDur + 0.5).toFixed(2),
      '-movflags', '+faststart',
      '-progress', 'pipe:1', '-nostats',
      finalPath,
    ];

    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath(), args, { cwd: workDir });
      let stderrTail = '';
      p.stdout.on('data', (d) => {
        const m = String(d).match(/out_time_us=(\d+)/);
        if (m) {
          const sec = Number(m[1]) / 1e6;
          onProgress({
            stage: '视频渲染',
            progress: 0.2 + Math.min(0.75, (sec / Math.max(audioDur, 1)) * 0.75),
          });
        }
      });
      p.stderr.on('data', (d) => { stderrTail = (stderrTail + String(d)).slice(-3000); });
      p.on('error', reject);
      p.on('close', (code) => {
        if (code === 0 && fs.existsSync(finalPath)) resolve();
        else reject(new Error(`ffmpeg 退出码 ${code}: ${stderrTail.slice(-700)}`));
      });
    });

    onProgress({ stage: '生成封面', progress: 0.97 });
    try {
      await execFileAsync(ffmpegPath(), [
        '-y', '-ss', Math.min(1.5, audioDur / 3).toFixed(2), '-i', finalPath,
        '-frames:v', '1', '-q:v', '3', coverPath,
      ]);
    } catch { /* 封面失败不致命 */ }

    onProgress({ stage: '完成', progress: 1 });
    return { videoFile: finalPath, coverFile: fs.existsSync(coverPath) ? coverPath : null, durationSec: audioDur };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
