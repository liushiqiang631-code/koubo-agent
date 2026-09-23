// 依赖恢复工具：按 package-lock.json 逐包从镜像下载 tarball 校验解压
// 用法: node rescue-deps.js [--force]   （--force 重装全部，否则只修缺失/损坏的包）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const FORCE = process.argv.includes('--force');
const ROOT = process.cwd();
const NM = path.join(ROOT, 'node_modules');
const TMP = path.join(ROOT, '.rescue-tmp');
const TAR = 'C:/Windows/System32/tar.exe'; // bsdtar，支持 Windows 路径

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'));
const entries = Object.entries(lock.packages || {}).filter(([k]) => k.startsWith('node_modules/'));

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

// 快速健康检查：package.json 存在且主入口文件存在
function healthy(dir, pkg) {
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(pj, 'utf-8'));
    const main = meta.main || 'index.js';
    if (meta.exports) return fs.existsSync(pj); // exports 型包只查 package.json
    if (fs.existsSync(path.join(dir, main))) return true;
    if (fs.existsSync(path.join(dir, main.replace(/\.js$/, '') + '.js'))) return true;
    if (fs.existsSync(path.join(dir, 'index.js'))) return true;
    return false;
  } catch { return false; }
}

let ok = 0, fixed = 0, failed = [];
async function fetchWithRetry(url, dest, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 600000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      return true;
    } catch (e) {
      console.log(`  retry ${i + 1}/${tries}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return false;
}

async function processPkg([key, info]) {
  try {
    await processPkgInner([key, info]);
  } catch (e) {
    failed.push(key + ' (' + e.message.slice(0, 60) + ')');
    console.log('  包处理失败(继续):', key, e.message.slice(0, 80));
  }
}

async function processPkgInner([key, info]) {
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  // 跳过非当前平台的 optional 二进制
  if (/@(esbuild|rollup|swc|img|napi|parcel)\//.test(name) &&
      !/(win32-x64|win32-arm64-msvc|x64-msvc|msvc-win32)/.test(name)) { ok++; return; }
  const dir = path.join(NM, name);
  if (!FORCE && fs.existsSync(dir) && healthy(dir, info)) { ok++; return; }
  let url = info.resolved;
  if (!url) {
    const base = name.includes('/') ? name.split('/')[1] : name;
    url = `https://registry.npmmirror.com/${name}/-/${base}-${info.version}.tgz`;
  } else {
    url = url.replace('registry.npmjs.org', 'registry.npmmirror.com');
  }
  const tgz = path.join(TMP, name.replace(/[\/@]/g, '_') + '.tgz');
  console.log(`修复 ${name}@${info.version}`);
  if (!(await fetchWithRetry(url, tgz))) { failed.push(name); return; }
  // 完整性校验
  const buf = fs.readFileSync(tgz);
  const hash = crypto.createHash('sha512').update(buf).digest('base64');
  if (info.integrity && `sha512-${hash}` !== info.integrity) { failed.push(name + ' (hash)'); return; }
  for (let r = 0; r < 6; r++) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1500 }); break; }
    catch { await new Promise(res => setTimeout(res, 2500)); }
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(TAR, ['-xzf', tgz, '-C', dir, '--strip-components=1'], { stdio: 'pipe' });
    fixed++;
  } catch (e) {
    failed.push(name + ' (tar)');
  }
}

const concurrency = 6;
let idx = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (idx < entries.length) {
    const i = idx++;
    await processPkg(entries[i]);
  }
}));

console.log(`\n完成: 健康已有 ${ok} 个, 新修复 ${fixed} 个, 失败 ${failed.length} 个`);
if (failed.length) console.log('失败清单:', failed.join(', '));
