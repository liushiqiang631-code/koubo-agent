import React, { useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../icons.jsx';
import { useApp } from '../App.jsx';

export default function Voices() {
  const { meta, toast } = useApp();
  const [busyId, setBusyId] = useState(null);
  const voices = meta?.voices || [];
  const preview = async (v) => {
    setBusyId(v.id);
    try {
      const r = await api.post('/api/tts/preview', { voiceId: v.id, speed: 1, emotion: v.styles[0] });
      new Audio(r.audioUrl).play();
      toast(`试听：${v.name}${r.engine === 'sapi' ? '（系统语音）' : ''}`);
    } catch (e) { toast(e.message, 'err'); } finally { setBusyId(null); }
  };
  return (
    <div>
      <div className="page-head">
        <div><h2>声音</h2><p>微软神经网络语音 · 免费合成，支持语速/情绪/停顿精细调节</p></div>
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {voices.map(v => (
          <div key={v.id} className="card mini-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--grad-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="audio" size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{v.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.gender} · {v.edge.replace('zh-CN-', '').replace('Neural', '')}</div>
              </div>
              <button className="btn sm soft" style={{ marginLeft: 'auto' }} onClick={() => preview(v)} disabled={busyId === v.id}>
                <Icon name="play" size={12} />{busyId === v.id ? '…' : '试听'}
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '10px 0 8px' }}>{v.desc}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {v.styles.map(s => <span key={s} className="tag purple">{s}</span>)}
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16, lineHeight: 1.8 }}>
        提示：声音由 Edge 神经语音引擎在线合成（免费）；离线环境自动回退到 Windows 系统语音（效果较机械）。若配置了 Azure 语音服务密钥，可在设置中切换。
      </p>
    </div>
  );
}
