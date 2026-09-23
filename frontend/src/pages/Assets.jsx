import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

export default function Assets() {
  const { toast } = useApp();
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('全部');
  const fileRef = useRef(null);
  const load = () => api.get('/api/assets').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const shown = filter === '全部' ? list : list.filter(a => a.type === (filter === '图片' ? 'image' : 'audio'));

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('name', f.name.replace(/\.[^.]+$/, ''));
    try {
      await api.post('/api/assets', fd);
      toast('素材已上传');
      load();
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>素材库</h2><p>管理肖像照片与配音素材，图片可直接作为视频出镜形象</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />上传素材</button>
          <input type="file" accept="image/*,audio/*" ref={fileRef} hidden onChange={upload} />
        </div>
      </div>
      <div className="avatar-chips">
        {['全部', '图片', '音频'].map(c => <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{c}</button>)}
      </div>
      {shown.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">🗂</div>暂无素材，点击右上角上传</div></div>
      ) : (
        <div className="grid-cards">
          {shown.map(a => (
            <div key={a.id} className="card mini-card">
              {a.type === 'image'
                ? <img src={a.url} alt={a.name} />
                : <div style={{ width: '100%', aspectRatio: '1', borderRadius: 12, background: 'var(--grad-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}><Icon name="audio" size={44} /></div>}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(a.size / 1024 / 1024).toFixed(2)} MB · {a.type === 'image' ? '图片' : '音频'}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {a.type === 'audio' && <button className="btn sm soft" onClick={() => new Audio(a.url).play()}><Icon name="play" size={12} /></button>}
                  <button className="btn sm danger" onClick={async () => { await api.del(`/api/assets/${a.id}`); load(); toast('已删除'); }}><Icon name="trash" size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
