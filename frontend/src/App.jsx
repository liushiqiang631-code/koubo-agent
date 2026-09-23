import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import Home from './pages/Home.jsx';
import Create from './pages/Create.jsx';
import Avatars from './pages/Avatars.jsx';
import Voices from './pages/Voices.jsx';
import Scripts from './pages/Scripts.jsx';
import Assets from './pages/Assets.jsx';
import Publish from './pages/Publish.jsx';
import Data from './pages/Data.jsx';
import Settings from './pages/Settings.jsx';
import Help from './pages/Help.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const NAV = [
  ['/', '首页', 'home'],
  ['/create', '创作中心', 'edit'],
  ['/avatars', '数字人', 'person'],
  ['/voices', '声音', 'audio'],
  ['/scripts', '文案', 'doc'],
  ['/assets', '素材库', 'image'],
  ['/publish', '发布', 'send'],
  ['/data', '数据', 'chart'],
];

function Logo() {
  return (
    <div className="logo">
      <div className="logo-badge"><Icon name="wave" size={22} sw={2.2} /></div>
      <div>
        <div className="logo-title">口播智能体</div>
        <div className="logo-sub">让好内容被更多人听见</div>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="nav">
        {NAV.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Icon name={icon} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">
        <NavLink to="/help" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="help" /><span>帮助中心</span></NavLink>
        <NavLink to="/settings" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon name="settings" /><span>设置</span></NavLink>
      </div>
    </aside>
  );
}

function Topbar({ search, setSearch }) {
  return (
    <div className="topbar">
      <div className="search">
        <Icon name="search" size={17} />
        <input placeholder="搜索模板、数字人、声音或功能…" value={search || ''} onChange={e => setSearch && setSearch(e.target.value)} />
      </div>
    </div>
  );
}

export function AppShell({ children, search, setSearch }) {
  const { toasts, renderJob } = useApp();
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar search={search} setSearch={setSearch} />
        <div className="content">{children}</div>
      </div>
      {renderJob && (
        <div className="render-float">
          <div className="stage"><span>{renderJob.stage || '处理中'}…</span><span>{Math.round((renderJob.progress || 0) * 100)}%</span></div>
          <div className="progress-line"><div style={{ width: `${Math.round((renderJob.progress || 0) * 100)}%` }} /></div>
        </div>
      )}
      <div className="toasts">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [projects, setProjects] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [renderJob, setRenderJob] = useState(null);
  const [search, setSearch] = useState('');
  const pollRef = useRef(null);
  const toastSeq = useRef(1);

  const toast = useCallback((msg, type = 'ok') => {
    const id = toastSeq.current++;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  const reloadProjects = useCallback(async () => {
    try { setProjects(await api.get('/api/projects')); } catch { /* 服务未就绪 */ }
  }, []);

  useEffect(() => {
    api.get('/api/meta').then(setMeta).catch(() => toast('无法连接服务，请确认已启动后端', 'err'));
    reloadProjects();
  }, []);

  // 渲染任务进度轮询
  const watchJob = useCallback((jobId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.get(`/api/jobs/${jobId}`);
        if (job.state === 'done' || job.state === 'failed') {
          clearInterval(pollRef.current);
          setRenderJob(null);
          if (job.state === 'done') toast('🎉 口播视频生成完成');
          else toast(`生成失败：${job.error}`, 'err');
          reloadProjects();
        } else {
          setRenderJob(job);
        }
      } catch { clearInterval(pollRef.current); setRenderJob(null); }
    }, 1200);
  }, [toast, reloadProjects]);

  const value = { meta, projects, reloadProjects, toast, toasts, renderJob, watchJob, search, setSearch };
  return (
    <Ctx.Provider value={value}>
      <Routes>
        <Route path="/" element={<AppShell><Home /></AppShell>} />
        <Route path="/create" element={<AppShell><Create /></AppShell>} />
        <Route path="/avatars" element={<AppShell><Avatars /></AppShell>} />
        <Route path="/voices" element={<AppShell><Voices /></AppShell>} />
        <Route path="/scripts" element={<AppShell><Scripts /></AppShell>} />
        <Route path="/assets" element={<AppShell><Assets /></AppShell>} />
        <Route path="/publish" element={<AppShell><Publish /></AppShell>} />
        <Route path="/data" element={<AppShell><Data /></AppShell>} />
        <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
        <Route path="/help" element={<AppShell><Help /></AppShell>} />
      </Routes>
    </Ctx.Provider>
  );
}
