import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

export default function Data() {
  const { projects } = useApp();
  const [ov, setOv] = useState(null);
  const [daily, setDaily] = useState([]);
  useEffect(() => {
    api.get('/api/stats/overview').then(setOv).catch(() => {});
    api.get('/api/stats/daily').then(setDaily).catch(() => {});
  }, []);

  if (!ov) return null;
  const max = Math.max(1, ...daily.map(d => Math.max(d.generated, d.rendered)));
  const topProjects = [...projects].filter(p => p.status === 'done').sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0)).slice(0, 5);

  const Stat = ({ ico, color, label, val, sub }) => (
    <div className="card stat-card">
      <div className="stat-ico" style={{ background: color }}><Icon name={ico} size={20} /></div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-val">{val}</div>
        <div className="stat-sub">{sub}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div><h2>数据</h2><p>全部数据来自本地真实创作记录</p></div>
      </div>
      <div className="data-grid">
        <Stat ico="play" color="linear-gradient(135deg,#a78bfa,#7c5cff)" label="累计作品" val={ov.totalCreated} sub={`视频 ${ov.totalVideos} 个`} />
        <Stat ico="clock" color="linear-gradient(135deg,#60a5fa,#3b82f6)" label="视频总时长" val={`${Math.floor(ov.totalDurationSec / 60)}分${ov.totalDurationSec % 60}秒`} sub="本地渲染输出" />
        <Stat ico="check" color="linear-gradient(135deg,#34d399,#10b981)" label="渲染成功率" val={`${ov.successRate}%`} sub={`当前队列 ${ov.queue} 个任务`} />
        <Stat ico="doc" color="linear-gradient(135deg,#fbbf24,#f59e0b)" label="文案 / 素材" val={`${ov.scripts} / ${ov.assets}`} sub="文案库 / 素材库" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          近 7 天创作趋势
          <span className="extra legend">
            <span><i style={{ background: 'var(--primary)' }} />生成文案</span>
            <span><i style={{ background: '#b9e5c9' }} />渲染完成</span>
          </span>
        </div>
        <div className="bars">
          {daily.map(d => (
            <div key={d.date} className="bar-col">
              <div className="bar-group">
                <div className="bar b1" style={{ height: `${(d.generated / max) * 100}%` }} title={`生成 ${d.generated}`} />
                <div className="bar b2" style={{ height: `${(d.rendered / max) * 100}%` }} title={`完成 ${d.rendered}`} />
              </div>
              <span className="bar-x">{d.date}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 6 }}>
        <div className="card-title" style={{ padding: '14px 14px 0' }}>时长 TOP 作品</div>
        {topProjects.length === 0 ? <div className="empty">暂无数据</div> : (
          <table className="table">
            <thead><tr><th>作品</th><th>时长</th><th>数字人</th><th>完成时间</th></tr></thead>
            <tbody>
              {topProjects.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.title}</td>
                  <td>{Math.round(p.durationSec || 0)}s</td>
                  <td style={{ color: 'var(--ink2)' }}>{p.avatarId}</td>
                  <td style={{ color: 'var(--muted)' }}>{p.updatedAt ? new Date(p.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
