import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

const CHANNELS = [
  ['douyin', '抖音', '#111318', '抖'],
  ['shipinhao', '视频号', '#5BB95B', '视'],
  ['xiaohongshu', '小红书', '#FE2C55', '红'],
  ['bilibili', 'B站', '#22AEE1', 'B'],
  ['kuaishou', '快手', '#FF5000', '快'],
];

export default function Publish() {
  const { projects, reloadProjects, toast } = useApp();
  const [detail, setDetail] = useState({});
  const done = projects.filter(p => p.status === 'done');

  const load = (p) => api.get(`/api/publish/${p.id}`).then(d => setDetail(s => ({ ...s, [p.id]: d }))).catch(() => {});
  useEffect(() => { done.forEach(load); }, [projects.length]);

  const toggleChannel = async (p, ch) => {
    const cur = detail[p.id]?.channels?.[ch] === 'published';
    await api.post(`/api/publish/${p.id}`, { channel: ch, status: cur ? 'pending' : 'published' });
    load(p);
    toast(cur ? '已标记为待发布' : '已标记为已发布');
  };
  const copyText = async (p) => {
    const d = detail[p.id];
    if (!d) return;
    try { await navigator.clipboard.writeText(`${d.caption}\n\n${d.hashtags.join(' ')}`); toast('文案已复制'); }
    catch { toast('复制失败', 'err'); }
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>发布</h2><p>生成发布文案与话题，下载视频后一键上传各平台</p></div>
      </div>
      {done.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">🚀</div>暂已无完成的视频。先生成口播视频，再来发布。</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {done.map(p => {
            const d = detail[p.id];
            return (
              <div key={p.id} className="card" style={{ display: 'flex', gap: 18 }}>
                <div style={{ width: 128, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#0c1020', aspectRatio: '9/13' }}>
                  {d?.coverUrl
                    ? <img src={d.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="cover" />
                    : <video src={d?.videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <b style={{ fontSize: 16 }}>{p.title}</b>
                    <span className="tag green">已完成 · {Math.round(p.durationSec || 0)}s</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink2)', margin: '8px 0 12px', lineHeight: 1.8 }}>
                    {d?.caption}
                    <div style={{ color: 'var(--primary)', marginTop: 2 }}>{d?.hashtags?.join(' ')}</div>
                  </div>
                  <div className="channel-row" style={{ justifyContent: 'flex-start', gap: 18, marginBottom: 12 }}>
                    {CHANNELS.map(([id, name, color, ch]) => {
                      const pub = d?.channels?.[id] === 'published';
                      return (
                        <div key={id} className="channel" onClick={() => toggleChannel(p, id)} style={{ opacity: pub ? 1 : 0.75 }}>
                          <div className="channel-ico" style={{ background: color, position: 'relative' }}>
                            {ch}
                            {pub && <span style={{ position: 'absolute', inset: -4, borderRadius: 17, border: '2.5px solid var(--green)' }} />}
                          </div>
                          <span>{pub ? '✓ 已发布' : name}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn sm" onClick={() => copyText(p)}><Icon name="doc" size={13} />复制文案</button>
                    <a className="btn sm" href={d?.videoUrl} download={`${p.title}.mp4`}><Icon name="download" size={13} />下载视频</a>
                    {d?.coverUrl && <a className="btn sm" href={d.coverUrl} download={`${p.title}_封面.jpg`}><Icon name="image" size={13} />下载封面</a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 16, lineHeight: 1.8 }}>
        说明：抖音/视频号/小红书等平台的全自动发布需要各企业开放平台资质审核。本页提供「发布助手」能力：生成标题文案与话题标签、管理各渠道发布状态、快速下载视频与封面素材。
      </p>
    </div>
  );
}
