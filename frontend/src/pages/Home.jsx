import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, avatarImg } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

const MAX_CHARS = 1000;
const CHANNELS = [
  ['douyin', '抖音', '#111318', '抖'],
  ['shipinhao', '视频号', '#5BB95B', '视'],
  ['xiaohongshu', '小红书', '#FE2C55', '红'],
  ['bilibili', 'B站', '#22AEE1', 'B'],
  ['kuaishou', '快手', '#FF5000', '快'],
];
const CATEGORIES = ['全部', '热门', '商务', '知识', '生活', '年轻态', '多语言'];
const STYLES = ['干货', '种草', '故事', '资讯'];

const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`);

// ---------- AI 文案生成弹窗 ----------
function AiScriptModal({ onClose, onApply }) {
  const [form, setForm] = useState({ topic: '', points: '', style: '干货', durationSec: 60, audience: '' });
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const go = async () => {
    if (!form.topic.trim()) return toast('请先填写主题', 'err');
    setBusy(true);
    try {
      const r = await api.post('/api/scripts/generate', form);
      onApply(r.script);
      api.post('/api/scripts', { title: form.topic, content: r.script, meta: r.meta }).catch(() => {});
      toast(r.meta?.engine === 'llm' ? 'AI 文案已生成' : '文案已生成（本地引擎）');
      onClose();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="modal-mask" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>✨ AI 生成文案</h3>
        <div className="form-row">
          <label>视频主题 *</label>
          <input className="input" placeholder="例如：如何做好时间管理 / 新品榨汁杯推荐" value={form.topic} onChange={set('topic')} />
        </div>
        <div className="form-row">
          <label>必须涵盖的要点（选填，用顿号或逗号分隔）</label>
          <input className="input" placeholder="例如：要事优先、番茄工作法、每日复盘" value={form.points} onChange={set('points')} />
        </div>
        <div className="form-row" style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>风格</label>
            <select className="select" value={form.style} onChange={set('style')}>
              {STYLES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>时长</label>
            <select className="select" value={form.durationSec} onChange={e => setForm(f => ({ ...f, durationSec: Number(e.target.value) }))}>
              {[30, 45, 60, 90].map(s => <option key={s} value={s}>{s} 秒</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>受众（选填）</label>
            <input className="input" placeholder="如：职场新人" value={form.audience} onChange={set('audience')} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={go} disabled={busy}>{busy ? '生成中…' : '立即生成'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 模板选择弹窗 ----------
function TemplateModal({ onClose, onPick }) {
  const { meta } = useApp();
  return (
    <div className="modal-mask" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 640 }}>
        <h3>📑 从模板选择</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(meta?.templates || []).map(t => (
            <div key={t.id} className="card mini-card" style={{ boxShadow: '0 2px 10px rgba(28,35,60,.08)', cursor: 'pointer' }}
              onClick={() => { onPick(t); onClose(); }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.name} <span className="tag purple" style={{ marginLeft: 6 }}>{t.style} · {t.durationSec}s</span></div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>{t.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', background: '#f8f9fd', borderRadius: 8, padding: '6px 9px', whiteSpace: 'pre-wrap' }}>{t.sample}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 一键发布弹窗 ----------
function PublishModal({ project, onClose }) {
  const { toast } = useApp();
  const [channels, setChannels] = useState(['douyin']);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api.get(`/api/publish/${project.id}`).then(setInfo).catch(() => {});
  }, [project.id]);
  const toggle = (c) => setChannels(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);
  const copy = async () => {
    if (!info) return;
    const text = `${info.caption}\n\n${info.hashtags.join(' ')}`;
    try { await navigator.clipboard.writeText(text); toast('文案与话题已复制'); } catch { toast('复制失败，请手动复制', 'err'); }
  };
  const go = async () => {
    for (const c of channels) await api.post(`/api/publish/${project.id}`, { channel: c, status: 'pending' });
    toast(`已加入 ${channels.length} 个渠道的发布清单，请在「发布」页下载素材上传`);
    onClose();
  };
  return (
    <div className="modal-mask" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>🚀 一键发布</h3>
        <div className="channel-row" style={{ marginBottom: 18 }}>
          {CHANNELS.map(([id, name, color, ch]) => (
            <div key={id} className={`channel ${channels.includes(id) ? 'on' : ''}`} onClick={() => toggle(id)}>
              <div className="channel-ico" style={{ background: color }}>{ch}</div>
              <span>{name}</span>
            </div>
          ))}
        </div>
        {info && (
          <div style={{ background: '#f8f9fd', borderRadius: 12, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.8 }}>
            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>发布文案</div>
            {info.caption}
            <div style={{ marginTop: 6, color: 'var(--primary)' }}>{info.hashtags.join(' ')}</div>
          </div>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
          说明：平台自动发布需企业开放平台资质，当前为「发布助手」模式——生成文案与话题、勾选渠道后，在发布页下载视频与封面即可快速上传。
        </p>
        <div className="modal-foot">
          <button className="btn" onClick={copy}><Icon name="doc" size={15} />复制文案</button>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={go} disabled={project.status !== 'done'}>
            {project.status === 'done' ? '加入发布清单' : '请先生成视频'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 主页面 ----------
export default function Home() {
  const { meta, projects, reloadProjects, toast, watchJob } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState('全部');
  const [form, setForm] = useState({
    id: null, title: '未命名作品', script: '', avatarId: 'xiaoxuan', voiceId: 'xiaoxuan',
    speed: 1, emotion: '平稳', pause: '适中', aspect: '9:16', status: 'draft', videoUrl: null, coverUrl: null,
  });
  const [showAi, setShowAi] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [showPub, setShowPub] = useState(false);
  const [busy, setBusy] = useState('');
  const [stats, setStats] = useState(null);
  const fileRef = useRef(null);
  const previewRef = useRef(null);

  // 载入最近项目为当前编辑对象；支持从数字人页带入自定义肖像
  useEffect(() => {
    const pend = localStorage.getItem('pendingAvatar');
    if (pend) {
      localStorage.removeItem('pendingAvatar');
      setForm(f => ({ ...f, avatarId: pend }));
      toast('已选用上传的肖像作为出镜形象');
    }
    const last = localStorage.getItem('currentProjectId');
    api.get('/api/projects').then(list => {
      const p = list.find(x => x.id === last) || list[0];
      if (p) setForm(f => ({ ...f, ...p }));
    }).catch(() => {});
    api.get('/api/stats/overview').then(setStats).catch(() => {});
  }, []);

  const upd = (patch) => setForm(f => ({ ...f, ...patch }));
  const chars = form.script.replace(/\s/g, '').length;

  const saveProject = async (silent) => {
    const payload = { ...form };
    delete payload.videoUrl; delete payload.coverUrl; delete payload.audioUrl; delete payload.status;
    let saved;
    if (form.id) saved = await api.put(`/api/projects/${form.id}`, payload);
    else {
      saved = await api.post('/api/projects', payload);
      localStorage.setItem('currentProjectId', saved.id);
    }
    upd({ id: saved.id });
    reloadProjects();
    if (!silent) toast('草稿已保存');
    return saved;
  };

  const generate = async () => {
    if (!form.script.trim()) return toast('请先填写或生成文案', 'err');
    setBusy('render');
    try {
      const saved = await saveProject(true);
      const job = await api.post(`/api/projects/${saved.id}/render`);
      watchJob(job.id);
      toast('已开始生成口播视频');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };

  const aiPolish = async (mode) => {
    if (!form.script.trim()) return toast('请先填写文案', 'err');
    setBusy(mode);
    try {
      const r = await api.post('/api/scripts/polish', { script: form.script, mode });
      upd({ script: r.script.slice(0, MAX_CHARS) });
      toast(mode === '优化' ? 'AI 优化完成' : '润色完成');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };

  const importFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result || '').slice(0, MAX_CHARS);
      upd({ script: text, title: f.name.replace(/\.[^.]+$/, '') });
      toast('文案已导入');
    };
    rd.readAsText(f, 'utf-8');
    e.target.value = '';
  };

  const previewVoice = async () => {
    setBusy('voice');
    try {
      const r = await api.post('/api/tts/preview', { voiceId: form.voiceId, speed: form.speed, emotion: form.emotion });
      new Audio(r.audioUrl).play();
      toast(`正在试听：${(meta?.voices || []).find(v => v.id === form.voiceId)?.name || ''}`);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };

  const avatars = useMemo(() => {
    const all = meta?.avatars || [];
    return tab === '全部' ? all : all.filter(a => a.tags.includes(tab));
  }, [meta, tab]);
  const voices = meta?.voices || [];
  const speedFill = `${((form.speed - 0.6) / 1.0) * 100}%`;

  const doneProject = projects.find(p => p.id === form.id && p.status === 'done');
  const recentDone = projects.find(p => p.status === 'done');
  const playable = doneProject || recentDone;
  const selectedAvatar = (meta?.avatars || []).find(a => a.id === form.avatarId);
  const isCustomAvatar = !selectedAvatar && String(form.avatarId || '').startsWith('as_');

  const todayStat = stats || { todayGenerated: 0, todayDelta: 0, totalCreated: 0, totalDurationSec: 0, totalVideos: 0, successRate: 100, assets: 0 };

  return (
    <div>
      {/* 统计 */}
      <div className="stats-row">
        <div className="card stat-card">
          <div className="stat-ico" style={{ background: 'linear-gradient(135deg,#a78bfa,#7c5cff)' }}><Icon name="play" size={20} /></div>
          <div>
            <div className="stat-label">今日生成</div>
            <div className="stat-val">{todayStat.todayGenerated}
              {todayStat.todayDelta !== 0 && <span className="stat-delta">{todayStat.todayDelta > 0 ? '↑' : '↓'} {Math.abs(todayStat.todayDelta)}</span>}
            </div>
            <div className="stat-sub">视频 {todayStat.totalVideos} 个</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-ico" style={{ background: 'linear-gradient(135deg,#60a5fa,#3b82f6)' }}><Icon name="video" size={20} /></div>
          <div>
            <div className="stat-label">视频总时长</div>
            <div className="stat-val">{fmtDur(todayStat.totalDurationSec || 0)}</div>
            <div className="stat-sub">累计创作 {todayStat.totalCreated} 个作品</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-ico" style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}><Icon name="check" size={20} /></div>
          <div>
            <div className="stat-label">渲染成功率</div>
            <div className="stat-val">{todayStat.successRate}%</div>
            <div className="stat-sub">本地渲染 · 无需上传</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-ico" style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}><Icon name="star" size={20} /></div>
          <div>
            <div className="stat-label">素材库</div>
            <div className="stat-val">{todayStat.assets}<span style={{ fontSize: 14 }}> 个</span></div>
            <div className="stat-sub">持续创作 让内容发光</div>
          </div>
        </div>
      </div>

      {/* 预览 + 文案 */}
      <div className="home-grid">
        <div className="card player-card">
          <div className="card-title" style={{ padding: '4px 8px 10px' }}>
            <span className="ico"><Icon name="video" size={18} /></span>视频预览
            <span className="extra">
              {[['9:16', '竖屏'], ['16:9', '横屏']].map(([v, label]) => (
                <button key={v} className={`chip ${form.aspect === v ? 'on' : ''}`} style={{ padding: '4px 13px' }}
                  onClick={() => upd({ aspect: v })}>{label}</button>
              ))}
            </span>
          </div>
          <div className={`player ${form.aspect === '9:16' ? 'vertical' : ''}`}>
            {playable?.videoUrl ? (
              <video src={playable.videoUrl} controls poster={playable.coverUrl || undefined} ref={previewRef} key={playable.id} />
            ) : (
              <div className="placeholder">
                <img src={avatarImg(form.avatarId, 240)} alt="avatar" onError={e => { e.currentTarget.style.opacity = 0.3; }} />
                <button className="play-btn-float" onClick={() => form.script.trim() ? generate() : toast('请先填写文案', 'err')}><Icon name="play" size={24} /></button>
                <span style={{ fontSize: 13 }}>{isCustomAvatar ? '我的肖像 · 自定义' : selectedAvatar ? `${selectedAvatar.name} · ${selectedAvatar.desc}` : '选择数字人'}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>点击生成第一支口播视频</span>
              </div>
            )}
          </div>
          {playable?.videoUrl && (
            <div className="player-meta">
              <Icon name="video" size={15} />
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{playable.title}</span>
              <span>· {Math.round(playable.durationSec || 0)}s · {playable.aspect === '16:9' ? '横屏' : '竖屏'}</span>
              <a className="link-btn" style={{ marginLeft: 'auto' }} href={playable.videoUrl} download={`${playable.title}.mp4`}><Icon name="download" size={15} />下载视频</a>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title"><span className="ico"><Icon name="doc" size={19} /></span>文案脚本</div>
          <div className="script-btns">
            <button className="btn soft sm" onClick={() => setShowAi(true)}><Icon name="magic" size={15} />AI 生成文案</button>
            <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} />导入文案</button>
            <button className="btn sm" onClick={() => setShowTpl(true)}><Icon name="folder" size={15} />从模板选择</button>
            <input type="file" accept=".txt,.md" ref={fileRef} hidden onChange={importFile} />
          </div>
          <textarea
            className="script-area"
            maxLength={MAX_CHARS}
            placeholder={'在此输入口播文案，或点击上方「AI 生成文案」自动创作…\n\n提示：生成前请先在下方选择数字人与声音。'}
            value={form.script}
            onChange={e => upd({ script: e.target.value })}
          />
          <div className="script-foot">
            <span className="script-count">{chars} / {MAX_CHARS}</span>
            <div className="script-actions">
              <button className="txt-btn" onClick={() => aiPolish('优化')} disabled={busy === '优化'}><Icon name="sparkle" size={14} />AI 优化</button>
              <button className="txt-btn" onClick={() => aiPolish('润色')} disabled={busy === '润色'}><Icon name="refresh" size={14} />一键润色</button>
            </div>
          </div>
        </div>
      </div>

      {/* 数字人 + 声音 */}
      <div className="home-grid2">
        <div className="card">
          <div className="card-title">
            <span className="ico"><Icon name="person" size={19} /></span>数字人选择
            <span className="extra"><a className="link-btn" onClick={() => nav('/avatars')}>更多数字人 ›</a></span>
          </div>
          <div className="avatar-chips">
            {CATEGORIES.map(c => (
              <button key={c} className={`chip ${tab === c ? 'on' : ''}`} onClick={() => setTab(c)}>{c}</button>
            ))}
          </div>
          <div className="avatar-row">
            {avatars.slice(0, 6).map(a => (
              <div key={a.id} className={`avatar-item ${form.avatarId === a.id ? 'on' : ''}`} onClick={() => upd({ avatarId: a.id })}>
                <img src={avatarImg(a.id, 300)} alt={a.name} />
                <div className="nm">{a.name}</div>
                <div className="ds">{a.desc}</div>
              </div>
            ))}
            <div className="avatar-item" onClick={() => nav('/avatars')}>
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: 12, background: '#f1f3f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="more" size={22} />
              </div>
              <div className="nm">更多</div>
              <div className="ds">持续更新</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span className="ico"><Icon name="audio" size={19} /></span>声音设置
            <span className="extra"><button className="btn sm soft" onClick={previewVoice} disabled={busy === 'voice'}><Icon name="play" size={13} />{busy === 'voice' ? '合成中…' : '试听'}</button></span>
          </div>
          <div className="voice-row">
            <label>音色</label>
            <select className="select" value={form.voiceId} onChange={e => upd({ voiceId: e.target.value })}>
              {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="voice-slider-row">
            <label>语速</label>
            <input type="range" className="slider" min="0.6" max="1.6" step="0.05" value={form.speed}
              style={{ '--fill': speedFill }}
              onChange={e => upd({ speed: Number(e.target.value) })} />
            <span className="slider-val">{form.speed.toFixed(2).replace(/0$/, '')}x</span>
          </div>
          <div className="voice-slider-row">
            <label>情绪</label>
            <div className="chip-row">
              {['平稳', '开心', '严肃', '活泼'].map(e0 => (
                <button key={e0} className={`chip ${form.emotion === e0 ? 'on' : ''}`} onClick={() => upd({ emotion: e0 })}>{e0}</button>
              ))}
            </div>
          </div>
          <div className="voice-slider-row" style={{ marginBottom: 0 }}>
            <label>停顿</label>
            <div className="chip-row">
              {['较短', '适中', '较长'].map(p => (
                <button key={p} className={`chip ${form.pause === p ? 'on' : ''}`} onClick={() => upd({ pause: p })}>{p}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 + 发布渠道 */}
      <div className="home-grid2" style={{ gridTemplateColumns: '1.35fr 1fr' }}>
        <div className="card">
          <div className="card-title"><span className="ico"><Icon name="zap" size={18} /></span>快速操作</div>
          <div className="quick-row">
            <button className="btn lg primary" onClick={generate} disabled={busy === 'render'}>
              <Icon name="sparkle" size={17} />{busy === 'render' ? '生成中…' : '生成口播'}
            </button>
            <button className="btn lg" onClick={() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) || window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <Icon name="play" size={16} />预览
            </button>
            <button className="btn lg" onClick={() => saveProject()}><Icon name="save" size={16} />保存草稿</button>
            <button className="btn lg" style={{ background: 'linear-gradient(120deg,#4f8cff,#7c5cff)', color: '#fff', border: 'none' }} onClick={() => setShowPub(true)}>
              <Icon name="send" size={16} />一键发布
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-title"><span className="ico"><Icon name="send" size={18} /></span>发布渠道</div>
          <div className="channel-row">
            {CHANNELS.map(([id, name, color, ch]) => (
              <div key={id} className="channel" onClick={() => setShowPub(true)}>
                <div className="channel-ico" style={{ background: color }}>{ch}</div>
                <span>{name}</span>
              </div>
            ))}
            <div className="channel" onClick={() => nav('/publish')}>
              <div className="channel-ico" style={{ background: '#8a93a8' }}>…</div>
              <span>更多</span>
            </div>
          </div>
        </div>
      </div>

      {showAi && <AiScriptModal onClose={() => setShowAi(false)} onApply={s => upd({ script: s.slice(0, MAX_CHARS) })} />}
      {showTpl && <TemplateModal onClose={() => setShowTpl(false)} onPick={(t) => {
        setForm(f => ({ ...f, title: t.name, script: '' }));
        setShowAi(true);
        toast(`已选择「${t.name}」，填写主题后即可生成`, 'ok');
      }} />}
      {showPub && <PublishModal project={{ ...form, status: form.id ? (doneProject ? 'done' : form.status) : 'draft' }} onClose={() => setShowPub(false)} />}
    </div>
  );
}
