// ============ 口播智能体 · 服务入口 ============
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {
  PORT, MEDIA_DIR, UPLOAD_DIR, FRONTEND_DIST, DEFAULT_SETTINGS,
} from './config.js';
import { get, nextId, save, getSettings } from './db.js';
import { AVATARS, avatarSvg, findAvatar } from './services/avatars.js';
import { VOICES, preview } from './services/tts.js';
import { generateScript, polishScript, TEMPLATES } from './services/llm.js';
import { enqueueRender, queueLength, recoverStaleJobs } from './worker.js';
import { getAudioDuration } from './services/render.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const db = () => get();
getSettings(DEFAULT_SETTINGS);
recoverStaleJobs();

// ---------- 元信息 ----------
app.get('/api/meta', (req, res) => {
  const settings = getSettings(DEFAULT_SETTINGS);
  res.json({
    appName: settings.brand.appName,
    avatars: AVATARS.map(a => ({ id: a.id, name: a.name, desc: a.desc, tags: a.tags, gender: a.gender, voiceName: a.voiceName })),
    voices: VOICES,
    templates: TEMPLATES,
    engine: {
      llmConfigured: Boolean(settings.llm.baseUrl && settings.llm.apiKey && settings.llm.model),
      renderQueue: queueLength(),
    },
  });
});

// ---------- 数字人形象 SVG ----------
app.get('/api/avatars/:id/svg', (req, res) => {
  const a = findAvatar(req.params.id);
  if (!a) {
    // 非内置 id：若是上传的肖像素材则直接返回图片，使前端 <img> 可统一使用
    const asset = db().assets.find(x => x.id === req.params.id && x.type === 'image');
    if (asset) {
      const full = path.join(UPLOAD_DIR, asset.file);
      if (fs.existsSync(full)) return res.sendFile(full);
    }
    return res.status(404).end();
  }
  const size = Math.min(800, Number(req.query.size) || 400);
  res.type('image/svg+xml').send(avatarSvg(a, { size, rounded: Number(req.query.rounded) || 0 }));
});

// ---------- 文案 ----------
app.post('/api/scripts/generate', async (req, res) => {
  const { topic, points, style, durationSec, audience } = req.body || {};
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: '请填写主题' });
  try {
    const result = await generateScript({
      topic: String(topic).trim().slice(0, 200),
      points: String(points || '').slice(0, 500),
      style: String(style || '干货'),
      durationSec: Number(durationSec) || 60,
      audience: String(audience || '').slice(0, 100),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scripts/polish', async (req, res) => {
  const { script, mode } = req.body || {};
  if (!script || !String(script).trim()) return res.status(400).json({ error: '文案为空' });
  try {
    res.json(await polishScript(String(script).slice(0, 5000), mode === '优化' ? '优化' : '润色'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 文案库
app.get('/api/scripts', (req, res) => {
  res.json([...db().scripts].sort((a, b) => b.createdAt - a.createdAt));
});
app.post('/api/scripts', (req, res) => {
  const { title, content, meta } = req.body || {};
  if (!content) return res.status(400).json({ error: '内容为空' });
  const item = { id: nextId('sc'), title: String(title || '未命名文案').slice(0, 80), content: String(content).slice(0, 5000), meta: meta || null, createdAt: Date.now() };
  db().scripts.unshift(item);
  if (db().scripts.length > 300) db().scripts.length = 300;
  save();
  res.json(item);
});
app.delete('/api/scripts/:id', (req, res) => {
  const d = db();
  d.scripts = d.scripts.filter(s => s.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- 项目（作品） ----------
function sanitizeProject(p) {
  const out = { ...p };
  if (out.videoFile) out.videoUrl = '/api/media/' + path.basename(out.videoFile);
  if (out.coverFile) out.coverUrl = '/api/media/' + path.basename(out.coverFile);
  if (out.audioFile) out.audioUrl = '/api/media/' + path.basename(out.audioFile);
  delete out.videoFile; delete out.coverFile; delete out.audioFile;
  return out;
}

app.get('/api/projects', (req, res) => {
  res.json(db().projects.map(sanitizeProject).sort((a, b) => b.updatedAt - a.updatedAt));
});

app.get('/api/projects/:id', (req, res) => {
  const p = db().projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(sanitizeProject(p));
});

app.post('/api/projects', (req, res) => {
  const { title, script, avatarId, voiceId, speed, emotion, pause, aspect } = req.body || {};
  const d = db();
  const project = {
    id: nextId('pj'),
    title: String(title || '未命名作品').slice(0, 80),
    script: String(script || '').slice(0, 5000),
    avatarId: findAvatar(avatarId) ? avatarId : (d.assets.find(a => a.id === avatarId) ? avatarId : 'xiaoxuan'),
    voiceId: VOICES.some(v => v.id === voiceId) ? voiceId : 'xiaoxuan',
    speed: Math.min(1.6, Math.max(0.6, Number(speed) || 1)),
    emotion: ['平稳', '开心', '严肃', '活泼'].includes(emotion) ? emotion : '平稳',
    pause: ['较短', '适中', '较长'].includes(pause) ? pause : '适中',
    aspect: aspect === '16:9' ? '16:9' : (getSettings(DEFAULT_SETTINGS).render.aspect === '16:9' ? '16:9' : '9:16'),
    crf: Number(req.body?.crf) || getSettings(DEFAULT_SETTINGS).render.crf || 23,
    watermark: String(req.body?.watermark ?? getSettings(DEFAULT_SETTINGS).render.watermark ?? '').slice(0, 40),
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  d.projects.unshift(project);
  save();
  res.json(sanitizeProject(project));
});

app.put('/api/projects/:id', (req, res) => {
  const p = db().projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const allow = ['title', 'script', 'avatarId', 'voiceId', 'speed', 'emotion', 'pause', 'aspect', 'watermark'];
  for (const k of allow) {
    if (req.body[k] !== undefined) {
      if (k === 'avatarId' && !findAvatar(req.body[k]) && !db().assets.find(a => a.id === req.body[k])) continue;
      if (k === 'speed') p[k] = Math.min(1.6, Math.max(0.6, Number(req.body[k]) || 1));
      else if (k === 'aspect') p[k] = req.body[k] === '16:9' ? '16:9' : '9:16';
      else p[k] = req.body[k];
    }
  }
  p.updatedAt = Date.now();
  save();
  res.json(sanitizeProject(p));
});

app.delete('/api/projects/:id', (req, res) => {
  const d = db();
  const p = d.projects.find(x => x.id === req.params.id);
  if (p) {
    for (const f of [p.videoFile, p.coverFile, p.audioFile]) {
      try { f && fs.rmSync(f, { force: true }); } catch { /* ignore */ }
    }
    d.projects = d.projects.filter(x => x.id !== p.id);
    save();
  }
  res.json({ ok: true });
});

// ---------- 渲染任务 ----------
app.post('/api/projects/:id/render', (req, res) => {
  try {
    const job = enqueueRender(req.params.id);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db().jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  res.json(job);
});

app.get('/api/jobs', (req, res) => {
  res.json(db().jobs.slice(0, 50));
});

// ---------- 声音试听 ----------
app.post('/api/tts/preview', async (req, res) => {
  const { voiceId, speed, emotion, text } = req.body || {};
  const sample = (String(text || '').trim() || '你好，我是你的专属口播声音，期待与你一起创作精彩内容。').slice(0, 120);
  try {
    const r = await preview(sample, { voiceId, speed: Number(speed) || 1, emotion, outDir: MEDIA_DIR, baseName: `preview_${voiceId}_${Date.now().toString(36)}` });
    res.json({ audioUrl: '/api/media/' + path.basename(r.file), engine: r.engine });
  } catch (err) {
    res.status(500).json({ error: `试听失败: ${err.message}` });
  }
});

// ---------- 素材库 ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10) || '.bin';
      cb(null, `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif|bmp)/.test(file.mimetype) || /audio\/(mpeg|mp3|wav|x-wav|ogg|m4a|mp4)/.test(file.mimetype);
    cb(ok ? null : new Error('仅支持图片或音频文件'), ok);
  },
});

app.get('/api/assets', (req, res) => {
  res.json(db().assets.map(a => ({ ...a, url: '/api/assets-file/' + a.file })).sort((x, y) => y.createdAt - x.createdAt));
});
app.post('/api/assets', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const isImage = /^image\//.test(req.file.mimetype);
  const asset = {
    id: nextId('as'),
    name: String(req.body.name || req.file.originalname || '素材').slice(0, 80),
    type: isImage ? 'image' : 'audio',
    mime: req.file.mimetype,
    file: req.file.filename,
    size: req.file.size,
    createdAt: Date.now(),
  };
  db().assets.unshift(asset);
  save();
  res.json({ ...asset, url: '/api/assets-file/' + asset.file });
});
app.delete('/api/assets/:id', (req, res) => {
  const d = db();
  const a = d.assets.find(x => x.id === req.params.id);
  if (a) {
    try { fs.rmSync(path.join(UPLOAD_DIR, a.file), { force: true }); } catch { /* ignore */ }
    d.assets = d.assets.filter(x => x.id !== a.id);
    save();
  }
  res.json({ ok: true });
});
app.get('/api/assets-file/:file', (req, res) => {
  const f = path.basename(req.params.file);
  const full = path.join(UPLOAD_DIR, f);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.sendFile(full);
});

// ---------- 发布 ----------
app.get('/api/publish/:projectId', async (req, res) => {
  const p = db().projects.find(x => x.id === req.params.projectId);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const tags = buildHashtags(p);
  res.json({
    projectId: p.id,
    title: p.title,
    status: p.status,
    videoUrl: p.videoFile ? '/api/media/' + path.basename(p.videoFile) : null,
    coverUrl: p.coverFile ? '/api/media/' + path.basename(p.coverFile) : null,
    channels: p.publishChannels || {},
    caption: buildCaption(p),
    hashtags: tags,
  });
});

app.post('/api/publish/:projectId', (req, res) => {
  const p = db().projects.find(x => x.id === req.params.projectId);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  const { channel, status } = req.body || {};
  const allowed = ['douyin', 'shipinhao', 'xiaohongshu', 'bilibili', 'kuaishou'];
  if (!allowed.includes(channel)) return res.status(400).json({ error: '未知渠道' });
  p.publishChannels = { ...(p.publishChannels || {}), [channel]: status === 'published' ? 'published' : 'pending' };
  p.updatedAt = Date.now();
  save();
  res.json({ ok: true, channels: p.publishChannels });
});

function buildCaption(p) {
  const first = String(p.script || '').split(/(?<=[。！？!?])/)[0] || p.title;
  return `${first}${first.endsWith('。') ? '' : '…'}`;
}
function buildHashtags(p) {
  const base = ['口播视频', 'AI数字人', '效率工具'];
  const titleWords = String(p.title || '').replace(/[【】\[\]（）()]/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 2);
  return [...titleWords, ...base].map(t => `#${t}`).slice(0, 6);
}

// ---------- 数据统计（全部由真实记录推导，避免计数叠加） ----------
app.get('/api/stats/overview', (req, res) => {
  const d = db();
  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const todayCount = d.projects.filter(p => dayKey(p.createdAt) === today).length;
  const yCount = d.projects.filter(p => dayKey(p.createdAt) === yesterday).length;
  const doneList = d.projects.filter(p => p.status === 'done');
  const totalDur = doneList.reduce((s, p) => s + (p.durationSec || 0), 0);
  const failed = d.jobs.filter(j => j.state === 'failed').length;
  res.json({
    todayGenerated: todayCount,
    todayDelta: todayCount - yCount,
    totalCreated: d.projects.length,
    totalDurationSec: Math.round(totalDur),
    totalVideos: doneList.length,
    successRate: d.jobs.length ? Math.round(((d.jobs.length - failed) / d.jobs.length) * 100) : 100,
    assets: d.assets.length,
    scripts: d.scripts.length,
    queue: queueLength(),
  });
});

app.get('/api/stats/daily', (req, res) => {
  const d = db();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    // 生成文案 = 当天入库的文案；渲染完成 = 当天完成的任务
    const generated = d.scripts.filter(s => new Date(s.createdAt).toISOString().slice(0, 10) === key).length;
    const rendered = d.jobs.filter(j => j.state === 'done' && j.finishedAt && new Date(j.finishedAt).toISOString().slice(0, 10) === key).length;
    days.push({ date: key.slice(5), generated, rendered });
  }
  res.json(days);
});

// ---------- 设置 ----------
app.get('/api/settings', (req, res) => {
  const s = getSettings(DEFAULT_SETTINGS);
  res.json({ ...s, llm: { ...s.llm, apiKey: s.llm.apiKey ? '******' : '' }, hasLlmKey: Boolean(s.llm.apiKey) });
});
app.put('/api/settings', (req, res) => {
  const s = getSettings(DEFAULT_SETTINGS);
  const body = req.body || {};
  if (body.llm) {
    const { apiKey, ...rest } = body.llm;
    s.llm = { ...s.llm, ...rest };
    // 前端回显的 '******' 表示未修改，不覆盖真实 key
    if (typeof apiKey === 'string' && apiKey !== '******') s.llm.apiKey = apiKey;
  }
  if (body.tts) s.tts = { ...s.tts, ...body.tts };
  if (body.render) s.render = { ...s.render, ...body.render };
  if (body.brand) s.brand = { ...s.brand, ...body.brand };
  save();
  res.json({ ok: true });
});

app.post('/api/settings/llm-test', async (req, res) => {
  const s = getSettings(DEFAULT_SETTINGS);
  if (!s.llm.baseUrl || !s.llm.apiKey || !s.llm.model) return res.status(400).json({ error: '请先填写 LLM 接口地址、Key 和模型名' });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(`${s.llm.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.llm.apiKey}` },
      body: JSON.stringify({ model: s.llm.model, messages: [{ role: 'user', content: '回复：连接成功' }], max_tokens: 10 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return res.json({ ok: false, error: `接口返回 ${r.status}` });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ---------- 媒体文件（支持 Range，视频可拖动） ----------
app.get('/api/media/:file', (req, res) => {
  const f = path.basename(req.params.file);
  const full = path.join(MEDIA_DIR, f);
  if (!fs.existsSync(full)) return res.status(404).end();
  const ext = path.extname(f).toLowerCase();
  const types = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png' };
  res.type(types[ext] || 'application/octet-stream');
  res.sendFile(full);
});

// ---------- 前端静态资源 ----------
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST, {
    setHeaders: (res) => {
      // 部分 WebView 对 crossorigin module script 严格执行 CORS 检查
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  }));
  app.get(/^(?!\/api|\/api\/).*/, (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('前端尚未构建：请先运行 npm run build，或开发模式使用 npm run dev:front'));
}

// 错误处理
app.use((err, req, res, next) => {
  console.error('[server]', err.message);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`✅ 口播智能体已启动: http://localhost:${PORT}`);
});
