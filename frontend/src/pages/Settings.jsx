import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function Settings() {
  const { toast, meta } = useApp();
  const [s, setS] = useState(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => { api.get('/api/settings').then(setS).catch(() => {}); }, []);
  if (!s) return null;

  const upd = (patch) => setS(v => ({ ...v, ...patch }));
  const save = async () => {
    await api.put('/api/settings', s);
    toast('设置已保存');
  };
  const testLlm = async () => {
    setTesting(true);
    try {
      await api.put('/api/settings', s);
      const r = await api.post('/api/settings/llm-test');
      toast(r.ok ? 'LLM 连接成功' : `连接失败：${r.error}`, r.ok ? 'ok' : 'err');
    } catch (e) { toast(e.message, 'err'); } finally { setTesting(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div><h2>设置</h2><p>所有配置保存在本机，不上传任何服务器</p></div>
        <div className="actions"><button className="btn primary" onClick={save}>保存设置</button></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">✨ AI 文案引擎（OpenAI 兼容接口）</div>
        <p style={{ color: 'var(--ink2)', fontSize: 13, margin: '-6px 0 14px', lineHeight: 1.8 }}>
          配置后文案生成/优化将调用大模型（支持 DeepSeek、通义千问、GLM、Kimi、OpenAI 等兼容接口）。
          <b>未配置时使用内置本地文案引擎</b>，无需联网也可生成可用文案。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div className="form-row">
            <label>接口地址 Base URL</label>
            <input className="input" placeholder="如 https://api.deepseek.com/v1" value={s.llm.baseUrl || ''} onChange={e => upd({ llm: { ...s.llm, baseUrl: e.target.value } })} />
          </div>
          <div className="form-row">
            <label>API Key</label>
            <input className="input" type="password" placeholder={s.hasLlmKey ? '已保存（输入可覆盖）' : 'sk-...'} value={s.llm.apiKey || ''} onChange={e => upd({ llm: { ...s.llm, apiKey: e.target.value } })} />
          </div>
          <div className="form-row">
            <label>模型名</label>
            <input className="input" placeholder="如 deepseek-chat" value={s.llm.model || ''} onChange={e => upd({ llm: { ...s.llm, model: e.target.value } })} />
          </div>
        </div>
        <button className="btn sm soft" onClick={testLlm} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🎙 语音合成</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 560 }}>
          <div className="form-row">
            <label>合成引擎</label>
            <select className="select" value={s.tts.engine} onChange={e => upd({ tts: { ...s.tts, engine: e.target.value } })}>
              <option value="auto">自动（Edge 在线 → 系统离线兜底）</option>
              <option value="edge">仅 Edge 神经语音（需联网）</option>
            </select>
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>当前状态：{meta ? '语音服务就绪' : '检查中…'}。试听与渲染共用同一引擎，效果一致。</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🎬 视频渲染</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, maxWidth: 760 }}>
          <div className="form-row">
            <label>默认画幅</label>
            <select className="select" value={s.render.aspect} onChange={e => upd({ render: { ...s.render, aspect: e.target.value } })}>
              <option value="9:16">竖屏 9:16（抖音/视频号）</option>
              <option value="16:9">横屏 16:9（B站/西瓜）</option>
            </select>
          </div>
          <div className="form-row">
            <label>帧率</label>
            <select className="select" value={s.render.fps} onChange={e => upd({ render: { ...s.render, fps: Number(e.target.value) } })}>
              <option value={30}>30 fps</option><option value={24}>24 fps</option>
            </select>
          </div>
          <div className="form-row">
            <label>画质 CRF（越小越清）</label>
            <input className="input" type="number" min="18" max="30" value={s.render.crf} onChange={e => upd({ render: { ...s.render, crf: Number(e.target.value) || 23 } })} />
          </div>
          <div className="form-row">
            <label>画面水印（选填）</label>
            <input className="input" placeholder="@你的账号名" value={s.render.watermark || ''} onChange={e => upd({ render: { ...s.render, watermark: e.target.value } })} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">ℹ️ 关于</div>
        <p style={{ color: 'var(--ink2)', fontSize: 13, lineHeight: 2 }}>
          口播智能体 · 本地部署版 v1.0 —— 数据（作品/文案/素材/设置）全部保存在本机 server/data 目录。<br />
          能力边界：语音合成与视频渲染完全本地可用；平台自动发布需企业开放平台资质，当前提供发布助手模式。
        </p>
      </div>
    </div>
  );
}
