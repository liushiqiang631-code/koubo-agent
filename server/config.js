import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'server', 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');

export const PORT = Number(process.env.PORT || 7788);

for (const dir of [DATA_DIR, MEDIA_DIR, UPLOAD_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const WINDOWS_FONT = 'C\\:/Windows/Fonts/msyh.ttc';

// 将默认设置写入数据库前的兜底配置（数据库 settings 优先）
export const DEFAULT_SETTINGS = {
  llm: {
    baseUrl: process.env.LLM_BASE_URL || '',   // OpenAI 兼容接口，如 https://api.deepseek.com/v1
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
  },
  tts: {
    engine: 'auto', // auto | edge | sapi
    defaultVoiceId: 'xiaoxuan',
  },
  render: {
    aspect: '9:16',       // 9:16 | 16:9
    fps: 30,
    crf: 23,
    watermark: '',        // 画面水印文字，如账号名
  },
  brand: {
    appName: '口播智能体',
  },
};
