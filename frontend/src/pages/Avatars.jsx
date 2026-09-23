import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, avatarImg } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

const CATEGORIES = ['全部', '热门', '商务', '知识', '生活', '年轻态', '多语言'];

export default function Avatars() {
  const { meta, toast } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState('全部');
  const [assets, setAssets] = useState([]);
  const fileRef = React.useRef(null);
  const load = () => api.get('/api/assets').then(a => setAssets(a.filter(x => x.type === 'image'))).catch(() => {});
  useEffect(() => { load(); }, []);

  const all = meta?.avatars || [];
  const list = tab === '全部' ? all : all.filter(a => a.tags.includes(tab));

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    fd.append('name', f.name.replace(/\.[^.]+$/, ''));
    try {
      await api.post('/api/assets', fd);
      toast('肖像已上传，可在首页视频渲染中使用');
      load();
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>数字人</h2><p>内置矢量数字人形象，也可上传真人肖像照作为出镜形象</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />上传肖像</button>
          <input type="file" accept="image/*" ref={fileRef} hidden onChange={upload} />
        </div>
      </div>
      <div className="avatar-chips">
        {CATEGORIES.map(c => <button key={c} className={`chip ${tab === c ? 'on' : ''}`} onClick={() => setTab(c)}>{c}</button>)}
      </div>
      <div className="grid-cards">
        {list.map(a => (
          <div key={a.id} className="card mini-card">
            <img src={avatarImg(a.id, 400)} alt={a.name} />
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
              <b style={{ fontSize: 15 }}>{a.name}</b>
              <span className="tag purple" style={{ marginLeft: 8 }}>{a.gender}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--muted)' }}>{a.desc}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 5 }}>🎙 {a.voiceName}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              {a.tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '26px 0 12px' }}>我的肖像素材</h3>
      {assets.length === 0 ? (
        <div className="card"><div className="empty" style={{ padding: 26 }}>暂无上传肖像。上传后将出现在此处，并可在视频渲染中使用。</div></div>
      ) : (
        <div className="grid-cards">
          {assets.map(a => (
            <div key={a.id} className="card mini-card">
              <img src={a.url} alt={a.name} />
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</b>
                <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={async () => { await api.del(`/api/assets/${a.id}`); load(); }}><Icon name="trash" size={13} /></button>
              </div>
              <button className="btn sm soft" style={{ width: '100%', marginTop: 8 }}
                onClick={() => { localStorage.setItem('pendingAvatar', a.id); nav('/'); }}>
                用作数字人 ›
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
