import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

export default function Scripts() {
  const { toast } = useApp();
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const load = () => api.get('/api/scripts').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const remove = async (s) => {
    await api.del(`/api/scripts/${s.id}`);
    load();
  };
  const useInEditor = (s) => {
    localStorage.setItem('pendingScript', JSON.stringify({ title: s.title, content: s.content }));
    nav('/');
    toast('已带入首页编辑器');
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>文案库</h2><p>保存过的口播文案，可随时再次使用</p></div>
      </div>
      {list.length === 0 ? (
        <div className="card"><div className="empty">
          <div className="big">📝</div>
          文案库为空。在首页「文案脚本」卡片的 AI 优化/润色后会自动提示保存。
        </div></div>
      ) : (
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {list.map(s => (
            <div key={s.id} className="card mini-card">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <b style={{ fontSize: 14.5 }}>{s.title}</b>
                <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => remove(s)}><Icon name="trash" size={13} /></button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.8, margin: '10px 0', maxHeight: 130, overflow: 'hidden' }}>
                {s.content.slice(0, 120)}{s.content.length > 120 ? '…' : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {new Date(s.createdAt).toLocaleDateString('zh-CN')} · {s.content.length} 字
                  {s.meta?.engine === 'llm' && <span className="tag purple" style={{ marginLeft: 6 }}>AI</span>}
                </span>
                <button className="btn sm soft" onClick={() => useInEditor(s)}>去创作 ›</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
