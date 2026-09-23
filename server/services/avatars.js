import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENE_PY = path.join(__dirname, 'scene.py');

// ============ 矢量数字人形象 ============
// 统一 viewBox 0 0 400 400 的半身插画，UI 与视频底图共用。
// 图层顺序：后层头发 → 脖子 → 身体 → 头/耳 → 五官 → 前层头发（刘海）

function shade(hex, pct) {
  const n = hex.replace('#', '');
  const num = parseInt(n.length === 3 ? n.split('').map(c => c + c).join('') : n, 16);
  const clamp = v => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + Math.round(255 * pct / 100));
  const g = clamp(((num >> 8) & 0xff) + Math.round(255 * pct / 100));
  const b = clamp((num & 0xff) + Math.round(255 * pct / 100));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function defaultEyes() {
  return `
  <ellipse cx="178" cy="168" rx="8" ry="10" fill="#2A2119"/>
  <ellipse cx="222" cy="168" rx="8" ry="10" fill="#2A2119"/>
  <circle cx="181" cy="164" r="3" fill="#FFFFFFCC"/>
  <circle cx="225" cy="164" r="3" fill="#FFFFFFCC"/>`;
}

function faceParts(skin, hairColor) {
  return `
  <!-- 眉 -->
  <path d="M164 148 q14 -9 30 -3" stroke="${shade(hairColor, -8)}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M206 145 q16 -6 30 3" stroke="${shade(hairColor, -8)}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <!-- 眼睛 -->
  ${defaultEyes()}
  <!-- 鼻与嘴 -->
  <path d="M197 178 q5 8 -2 12" stroke="${shade(skin, -30)}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M182 202 q18 14 36 0" stroke="#B4534B" stroke-width="6" fill="none" stroke-linecap="round"/>
  <ellipse cx="158" cy="188" rx="12" ry="7" fill="#F2A09955"/>
  <ellipse cx="242" cy="188" rx="12" ry="7" fill="#F2A09955"/>`;
}

// ---- 发型：back（头后层）/ front（刘海层）----
const hairLongBack = (c) => `
  <path d="M128 300 q-16 -210 72 -216 q88 6 72 216 l-34 4 q10 -70 6 -120 l-88 0 q-4 50 6 120 z" fill="${shade(c, -8)}"/>`;
const hairLongFront = (c) => `
  <path d="M140 158 q-6 -80 60 -84 q66 4 60 84 q-6 -34 -26 -44 q-16 14 -44 12 q-30 2 -38 20 q-6 8 -12 12 z" fill="${c}"/>
  <path d="M200 76 q58 4 58 56 q-12 -22 -30 -28 q-18 12 -46 10 q-26 0 -40 18 q0 -52 58 -56 z" fill="${shade(c, 12)}"/>`;
const hairBobBack = (c) => `
  <path d="M132 232 q-14 -140 68 -146 q82 6 68 146 l-28 2 q8 -40 4 -70 l-88 0 q-4 30 4 70 z" fill="${shade(c, -8)}"/>`;
const hairBobFront = (c) => `
  <path d="M138 160 q-4 -86 62 -90 q66 4 62 90 q-8 -30 -24 -40 q-4 12 -14 16 l-4 -18 q-24 -8 -44 -2 q-22 4 -30 26 q-4 10 -8 18 z" fill="${c}"/>
  <path d="M200 72 q56 4 58 54 q-14 -20 -32 -26 q-20 10 -46 8 q-24 0 -38 16 q2 -48 58 -52 z" fill="${shade(c, 14)}"/>`;
const hairBunBack = (c) => `
  <circle cx="200" cy="70" r="27" fill="${shade(c, -6)}"/>
  <path d="M136 226 q-12 -150 64 -154 q76 4 64 154 l-26 2 q6 -46 2 -78 l-80 0 q-4 32 2 78 z" fill="${shade(c, -8)}"/>`;
const hairBunFront = (c) => `
  <path d="M142 152 q-2 -78 58 -82 q60 4 58 82 q-8 -30 -24 -40 q-2 10 -12 14 q-6 -12 -18 -16 q-8 10 -22 10 q-26 2 -40 32 z" fill="${c}"/>`;
const hairShortFront = (c) => `
  <path d="M138 158 q-4 -76 62 -80 q66 4 62 80 q-4 -28 -20 -38 l-4 -12 q-22 -8 -60 -4 q-24 4 -32 20 q-4 14 -8 34 z" fill="${c}"/>
  <path d="M200 80 q44 2 52 32 q-26 -12 -52 -10 q-26 -2 -52 10 q8 -30 52 -32 z" fill="${shade(c, 16)}"/>`;
const hairSideFront = (c) => `
  <path d="M136 156 q0 -78 64 -82 q70 4 64 86 q-8 -10 -12 -28 q-30 6 -66 -14 q-24 18 -30 60 q-8 4 -20 -22 z" fill="${c}"/>
  <path d="M200 78 q48 0 56 34 q-28 -14 -56 -12 q-28 -2 -56 12 q8 -34 56 -34 z" fill="${shade(c, 16)}"/>`;
const hairCurlyBack = (c) => {
  const puffs = [[140,128],[158,98],[200,86],[242,98],[260,128],[128,162],[272,162],[126,200],[274,200]];
  return puffs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${y < 110 ? 27 : 21}" fill="${shade(c, -6)}"/>`).join('');
};
const hairCurlyFront = (c) => `
  <path d="M146 148 q8 -58 54 -60 q46 2 54 60 q-12 -26 -30 -32 q-2 8 -10 10 q-8 -10 -22 -10 q-30 -2 -46 32 z" fill="${c}"/>`;

// ---- 服装 ----
const outfitBlazer = (c, shirt) => `
  <path d="M112 400 q-4 -96 54 -122 l70 34 70 -34 q58 26 54 122 z" fill="${c}"/>
  <path d="M166 278 l34 40 -20 24 -34 -58 z" fill="${shade(c, -14)}"/>
  <path d="M234 278 l-34 40 20 24 34 -58 z" fill="${shade(c, -14)}"/>
  <path d="M200 318 l-24 82 24 0 24 -82 z" fill="${shirt}"/>`;
const outfitBlazerTee = (c, tee) => `
  <path d="M112 400 q-4 -96 54 -122 l70 34 70 -34 q58 26 54 122 z" fill="${c}"/>
  <path d="M170 282 q30 22 60 0 l-6 118 -48 0 z" fill="${tee}"/>
  <path d="M166 278 l14 16 -14 12 -12 -22 z" fill="${shade(c, -14)}"/>
  <path d="M234 278 l-14 16 14 12 12 -22 z" fill="${shade(c, -14)}"/>`;
const outfitKnit = (c) => `
  <path d="M118 400 q-2 -92 50 -118 q-2 26 32 40 34 -14 32 -40 q52 26 50 118 z" fill="${c}"/>
  <path d="M168 288 q32 18 64 0 l-4 26 q-28 12 -56 0 z" fill="${shade(c, -12)}"/>
  <path d="M150 340 h100 M146 368 h108 M150 394 h100" stroke="${shade(c, -8)}" stroke-width="5" opacity="0.5"/>`;
const outfitHoodie = (c) => `
  <path d="M112 400 q-4 -96 54 -122 l34 22 34 -22 q58 26 54 122 z" fill="${c}"/>
  <path d="M160 282 q40 34 80 0 l-8 34 q-32 18 -64 0 z" fill="${shade(c, -12)}"/>
  <path d="M188 322 v54 M212 322 v54" stroke="${shade(c, -18)}" stroke-width="7" stroke-linecap="round"/>`;
const outfitTurtleneck = (c) => `
  <path d="M112 400 q-4 -96 54 -122 l70 34 70 -34 q58 26 54 122 z" fill="${c}"/>
  <rect x="170" y="270" width="60" height="36" rx="15" fill="${shade(c, -10)}"/>
  <path d="M148 344 h104 M144 372 h112" stroke="${shade(c, 10)}" stroke-width="4" opacity="0.35"/>`;
const outfitShirtTie = (suit, tie) => `
  <path d="M112 400 q-4 -96 54 -122 l70 34 70 -34 q58 26 54 122 z" fill="${suit}"/>
  <path d="M200 316 l-30 -34 30 -8 30 8 z" fill="#FFFFFF"/>
  <path d="M200 300 l-13 13 13 68 13 -68 z" fill="${tie}"/>
  <path d="M187 296 l13 -9 13 9 -13 11 z" fill="${shade(tie, -18)}"/>
  <path d="M166 278 l14 16 -14 12 -12 -22 z" fill="${shade(suit, -14)}"/>
  <path d="M234 278 l-14 16 14 12 12 -22 z" fill="${shade(suit, -14)}"/>`;
const outfitShirtOpen = (c) => `
  <path d="M112 400 q-4 -96 54 -122 l70 34 70 -34 q58 26 54 122 z" fill="${c}"/>
  <path d="M200 314 l-34 -34 34 -10 34 10 z" fill="#FFFFFF"/>
  <path d="M186 282 l14 30 14 -30" stroke="${shade(c, -16)}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M166 278 l14 16 -14 12 -12 -22 z" fill="${shade(c, -14)}"/>
  <path d="M234 278 l-14 16 14 12 12 -22 z" fill="${shade(c, -14)}"/>`;

const glasses = `
  <g stroke="#2E3440" stroke-width="5" fill="#FFFFFF14">
    <rect x="157" y="153" width="39" height="28" rx="13"/>
    <rect x="204" y="153" width="39" height="28" rx="13"/>
    <path d="M196 166 h8"/>
  </g>`;

// ============ 数字人目录 ============
export const AVATARS = [
  { id: 'xiaoxuan', name: '晓萱', desc: '知性自然', tags: ['热门', '商务'], gender: '女',
    voiceName: '晓萱 · 温柔女声', scene: ['#8B7CF6', '#6D5AE0'],
    draw: hairLongBack('#4A342A')
      + `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#EBC4AE"/>`
      + outfitBlazer('#F3EFE9', '#FFFFFF')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#F6D7C3"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#F6D7C3"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#F6D7C3"/>`
      + faceParts('#F6D7C3', '#4A342A')
      + hairLongFront('#4A342A') },
  { id: 'haoran', name: '浩然', desc: '商务专业', tags: ['热门', '商务'], gender: '男',
    voiceName: '浩然 · 专业男声', scene: ['#5B8DEF', '#3D6BD8'],
    draw: `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#DDB08C"/>`
      + outfitShirtTie('#2E3E5C', '#4F6FE0')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#EFC5A5"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#EFC5A5"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#EFC5A5"/>`
      + faceParts('#EFC5A5', '#241C16')
      + hairShortFront('#241C16') },
  { id: 'siyu', name: '思雨', desc: '亲和温暖', tags: ['生活', '热门'], gender: '女',
    voiceName: '思雨 · 亲切女声', scene: ['#F2977C', '#E0765B'],
    draw: hairBobBack('#5C3A28')
      + `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#EDC6AE"/>`
      + outfitKnit('#F5D9C8')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#F8DCC8"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#F8DCC8"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#F8DCC8"/>`
      + faceParts('#F8DCC8', '#5C3A28')
      + hairBobFront('#5C3A28') },
  { id: 'kaiwen', name: '凯文', desc: '活力阳光', tags: ['年轻态', '知识'], gender: '男',
    voiceName: '凯文 · 活力男声', scene: ['#4FC3C8', '#2E9BA6'],
    draw: `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#DEA87F"/>`
      + outfitHoodie('#7ECBEF')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#EDBE9C"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#EDBE9C"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#EDBE9C"/>`
      + faceParts('#EDBE9C', '#3A2A1E')
      + hairSideFront('#3A2A1E') },
  { id: 'luna', name: 'Luna', desc: '时尚气质', tags: ['年轻态', '热门'], gender: '女',
    voiceName: 'Luna · 时尚女声', scene: ['#E86FA4', '#C74883'],
    draw: hairBunBack('#20191A')
      + `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#E5BDA6"/>`
      + outfitTurtleneck('#2A2A33')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#F6D3BC"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#F6D3BC"/>
         <circle cx="139" cy="192" r="4.5" fill="#F2C879"/><circle cx="261" cy="192" r="4.5" fill="#F2C879"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#F6D3BC"/>`
      + faceParts('#F6D3BC', '#20191A')
      + hairBunFront('#20191A') },
  { id: 'yunjie', name: '云杰', desc: '知识渊博', tags: ['知识', '商务'], gender: '男',
    voiceName: '云杰 · 磁性男声', scene: ['#6C7BE8', '#4B58C6'],
    draw: `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#D6A87E"/>`
      + outfitShirtOpen('#E9EDF5')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#E8C09A"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#E8C09A"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#E8C09A"/>`
      + faceParts('#E8C09A', '#2B2320')
      + hairShortFront('#2B2320') + glasses },
  { id: 'anqi', name: '安琪', desc: '优雅多语', tags: ['多语言', '生活'], gender: '女',
    voiceName: '安琪 · 优雅女声', scene: ['#E8A44C', '#CE8430'],
    draw: hairCurlyBack('#3E2A22')
      + `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#E9C4A6"/>`
      + outfitBlazerTee('#D9B58F', '#FFF7EC')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#F3CFB4"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#F3CFB4"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#F3CFB4"/>`
      + faceParts('#F3CFB4', '#3E2A22')
      + hairCurlyFront('#3E2A22') },
  { id: 'zimo', name: '子墨', desc: '青春讲述', tags: ['年轻态', '知识'], gender: '男',
    voiceName: '子墨 · 青春男声', scene: ['#5DBE8A', '#3D9B68'],
    draw: `<ellipse cx="200" cy="252" rx="34" ry="16" fill="#00000022"/><rect x="178" y="216" width="44" height="54" rx="20" fill="#DFB28A"/>`
      + outfitHoodie('#BFE3C0')
      + `<ellipse cx="139" cy="172" rx="11" ry="16" fill="#F1C9A5"/><ellipse cx="261" cy="172" rx="11" ry="16" fill="#F1C9A5"/>`
      + `<ellipse cx="200" cy="165" rx="62" ry="70" fill="#F1C9A5"/>`
      + faceParts('#F1C9A5', '#1F1B18')
      + hairShortFront('#1F1B18') },
];

export function avatarSvg(a, { size = 400, rounded = 0 } = {}) {
  const gradId = `g_${a.id}`;
  const inner = `
    <rect width="400" height="400" fill="url(#${gradId})"/>
    <circle cx="330" cy="60" r="110" fill="#FFFFFF22"/>
    <circle cx="40" cy="340" r="90" fill="#FFFFFF1A"/>
    ${a.draw}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a.scene[0]}"/>
      <stop offset="1" stop-color="${a.scene[1]}"/>
    </linearGradient>
    ${rounded ? `<clipPath id="clip_${a.id}"><rect width="400" height="400" rx="${rounded}"/></clipPath>` : ''}
  </defs>
  <g ${rounded ? `clip-path="url(#clip_${a.id})"` : ''}>${inner}</g></svg>`;
}

export function findAvatar(id) {
  return AVATARS.find(a => a.id === id) || null;
}

// ============ 视频底图（Pillow 绘制，详见 scene.py） ============
// aspect: '9:16' → 1080x1920；'16:9' → 1920x1080
export function renderSceneImage(avatarOrImagePath, outPath, aspect = '9:16') {
  return new Promise((resolve, reject) => {
    const args = ['--out', outPath, '--aspect', aspect];
    if (typeof avatarOrImagePath === 'string') args.push('--image', avatarOrImagePath);
    else args.push('--preset', avatarOrImagePath.id);
    const py = process.env.PYTHON || 'python';
    const proc = spawn(py, [SCENE_PY, ...args], { windowsHide: true });
    let err = '';
    proc.stderr.on('data', d => { err += String(d); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`底图生成失败: ${err.slice(-400)}`));
    });
  });
}
