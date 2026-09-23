import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const DB_FILE = path.join(DATA_DIR, 'db.json');

const emptyDb = () => ({
  seq: 1,
  projects: [],
  assets: [],
  jobs: [],
  scripts: [], // 文案库
  daily: {},   // { '2026-09-20': { generated, rendered, failed } }
  settings: null,
});

let db = emptyDb();
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      db = { ...emptyDb(), ...raw };
    }
  } catch (err) {
    console.error('[db] 读取失败，使用空数据库:', err.message);
    db = emptyDb();
  }
}

function persistNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), 'utf-8');
  fs.renameSync(tmp, DB_FILE);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      persistNow();
    } catch (err) {
      console.error('[db] 写入失败:', err.message);
    }
  }, 120);
}

export function nextId(prefix) {
  const id = `${prefix}_${Date.now().toString(36)}${(db.seq++).toString(36)}`;
  scheduleSave();
  return id;
}

export const get = () => db;

export function save() {
  scheduleSave();
}

export function getSettings(defaults) {
  if (!db.settings) db.settings = defaults;
  // 深合并默认值，保证新增配置字段存在
  for (const k of Object.keys(defaults)) {
    if (db.settings[k] === undefined) db.settings[k] = defaults[k];
    else if (typeof defaults[k] === 'object' && defaults[k] !== null) {
      db.settings[k] = { ...defaults[k], ...db.settings[k] };
    }
  }
  return db.settings;
}

load();
process.on('exit', () => { try { persistNow(); } catch { /* ignore */ } });
