import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

const STATUS = {
  draft: ['草稿', 'tag'],
  queued: ['排队中', 'tag amber'],
  rendering: ['渲染中', 'tag amber'],
  done: ['已完成', 'tag green'],
  failed: ['失败', 'tag red'],
};

export default function Create() {
  const { projects, reloadProjects, toast } = useApp();
  const nav = useNavigate();
  const [list, setList] = useState(projects);
  useEffect(() => setList(projects), [projects]);

  const open = (p) => { localStorage.setItem('currentProjectId', p.id); nav('/'); };
  const remove = async (p) => {
    if (!window.confirm(`删除「${p.title}」？该操作不可恢复。`)) return;
    await api.del(`/api/projects/${p.id}`);
    toast('已删除');
    reloadProjects();
  };
  const retry = async (p) => {
    try {
      await api.post(`/api/projects/${p.id}/render`);
      toast('已重新加入渲染队列');
      reloadProjects();
    } catch (e) { toast(e.message, 'err'); }
  };
  const download = (p) => {
    const a = document.createElement('a');
    a.href = p.videoUrl; a.download = `${p.title}.mp4`; a.click();
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>创作中心</h2><p>管理你的全部口播作品</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => { localStorage.removeItem('currentProjectId'); nav('/'); }}>
            <Icon name="edit" size={16} />新建作品
          </button>
        </div>
      </div>
      <div className="card" style={{ padding: 6 }}>
        {list.length === 0 ? (
          <div className="empty"><div className="big">🎬</div>还没有作品，去首页创建第一支口播视频吧</div>
        ) : (
          <table className="table">
            <thead><tr><th>作品</th><th>数字人</th><th>状态</th><th>时长</th><th>更新时间</th><th style={{ textAlign: 'right' }}>操作</th></tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.script?.slice(0, 60) || '（无文案）'}</div>
                  </td>
                  <td style={{ color: 'var(--ink2)' }}>{p.avatarId}</td>
                  <td><span className={STATUS[p.status]?.[1] || 'tag'}>{STATUS[p.status]?.[0] || p.status}</span>
                    {p.status === 'failed' && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 3, maxWidth: 200 }}>{p.lastError}</div>}
                  </td>
                  <td>{p.durationSec ? `${Math.round(p.durationSec)}s` : '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(p.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>
                    <div className="ops">
                      <button className="btn sm" onClick={() => open(p)}>打开</button>
                      {p.status === 'done' && <button className="btn sm" onClick={() => download(p)}><Icon name="download" size={13} /></button>}
                      {(p.status === 'failed' || p.status === 'draft') && <button className="btn sm soft" onClick={() => retry(p)}>生成</button>}
                      <button className="btn sm danger" onClick={() => remove(p)}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
