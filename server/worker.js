// ============ 渲染任务队列 ============
// 串行执行（ffmpeg 吃 CPU），任务状态持久化到 db，进度实时更新。

import { get, nextId, save } from './db.js';
import { synthesize } from './services/tts.js';
import { renderVideo } from './services/render.js';
import { MEDIA_DIR } from './config.js';

const queue = [];
let running = false;

// 服务启动时调用：上次运行中中断的任务无法恢复，统一标记失败
export function recoverStaleJobs() {
  const db = get();
  let n = 0;
  for (const p of db.projects) {
    if (p.status === 'queued' || p.status === 'rendering') {
      p.status = 'failed';
      p.lastError = '服务重启导致任务中断，请重新生成';
      p.updatedAt = Date.now();
      n++;
    }
  }
  if (n) {
    save();
    console.log(`[worker] 已重置 ${n} 个因重启中断的任务`);
  }
}

export function enqueueRender(projectId) {
  const db = get();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) throw new Error('项目不存在');
  if (project.status === 'rendering' || project.status === 'queued') throw new Error('任务已在队列中');
  if (!project.script || !project.script.trim()) throw new Error('文案为空，无法生成');

  const job = {
    id: nextId('job'),
    projectId,
    state: 'queued',
    stage: '排队中',
    progress: 0,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  db.jobs.unshift(job);
  if (db.jobs.length > 100) db.jobs.length = 100;
  project.status = 'queued';
  project.jobId = job.id;
  project.lastError = null;
  save();
  queue.push(job);
  process.nextTick(runNext);
  return job;
}

async function runNext() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  const db = get();
  const project = db.projects.find(p => p.id === job.projectId);
  try {
    if (!project) throw new Error('项目已删除');
    job.state = 'running';
    project.status = 'rendering';
    save();

    // 1. TTS
    const onTtsProgress = (u) => {
      job.stage = u.stage; job.progress = u.progress; save();
    };
    const tts = await synthesize(project.script, {
      voiceId: project.voiceId,
      speed: project.speed || 1,
      emotion: project.emotion || '平稳',
      pause: project.pause || '适中',
      outDir: MEDIA_DIR,
      baseName: `${project.id}_audio`,
    });
    onTtsProgress({ stage: '视频渲染', progress: 0.18 });

    // 2. 视频渲染
    const result = await renderVideo({
      project,
      audioFile: tts.file,
      words: tts.words,
      onProgress: (u) => { job.stage = u.stage; job.progress = u.progress; save(); },
    });

    // 3. 成功
    project.status = 'done';
    project.videoFile = result.videoFile;
    project.coverFile = result.coverFile;
    project.audioFile = tts.file;
    project.durationSec = result.durationSec;
    project.engine = tts.engine;
    project.updatedAt = Date.now();
    job.state = 'done'; job.stage = '完成'; job.progress = 1; job.finishedAt = Date.now();
    save();
  } catch (err) {
    console.error('[worker] 渲染失败:', err);
    if (project) {
      project.status = 'failed';
      project.lastError = err.message;
      project.updatedAt = Date.now();
    }
    job.state = 'failed'; job.stage = '失败'; job.error = err.message; job.finishedAt = Date.now();
    save();
  } finally {
    running = false;
    process.nextTick(runNext);
  }
}

export function queueLength() {
  return queue.length + (running ? 1 : 0);
}
