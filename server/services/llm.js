// ============ AI 文案服务 ============
// 双引擎：LLM（OpenAI 兼容接口，可在设置中配置 DeepSeek/通义/GLM 等）→ 本地模板引擎兜底
// 本地引擎：按 风格/时长/受众 结构化生成口播稿（钩子→共鸣→要点→总结→行动号召），真实可用。

import { getSettings } from '../db.js';

// ---- 风格模板池 ----
const HOOKS = {
  '干货': [
    '关于{topic}，90%的人都做错了，接下来{dur}，我把正确的方法一次讲清楚。',
    '还在为{topic}发愁吗？别急，今天这条视频，帮你彻底搞明白。',
    '如果你也想搞定{topic}，一定要看完，特别是第三点，几乎没人告诉你。',
    '我用{dur}，把{topic}的核心讲透，建议先点个收藏。',
  ],
  '种草': [
    '姐妹们！{topic}这个宝藏，我不允许你们还不知道。',
    '被问了800次的{topic}来了，今天直接分享给你们。',
    '这可能是你今年看过最实用的{topic}分享，看完你会回来谢我的。',
  ],
  '故事': [
    '三年前我完全不懂{topic}，直到我明白了这件事，一切才慢慢变好。',
    '关于{topic}，我踩过所有的坑，今天毫无保留地讲给你听。',
    '很多人问我{topic}是怎么做起来的，故事要从一次失败说起。',
  ],
  '资讯': [
    '最新消息，{topic}迎来了重要变化，{dur}带你了解关键信息。',
    '最近，{topic}有了新进展，这几件事你需要知道。',
    '今天和大家同步一下{topic}的最新动态，重点都帮你划好了。',
  ],
};

const PAIN = {
  '干货': [
    '很多人一上来就闷头干，结果方向错了，越努力越焦虑。',
    '网上信息很多，但大多零散不成体系，看完还是不知道怎么动手。',
    '其实不是你不努力，而是方法不对，方向错了，努力就会打折。',
  ],
  '种草': [
    '之前我也买错过好多，又贵又不实用，真的心疼钱。',
    '市面上的选择太多了，一不小心就踩雷，用两次就吃灰。',
    '为了帮大家避坑，我认真对比了很久，才敢推荐给你们。',
  ],
  '故事': [
    '那时候走了很多弯路，交了不少学费，才慢慢摸到门道。',
    '一开始我也怀疑自己，是不是真的适合做这件事。',
  ],
  '资讯': [
    '这次变化影响不小，跟很多人都息息相关，建议认真听完。',
  ],
};

const POINT_TPL = {
  '干货': [
    '第一，{p}。不要小看这一点，它是所有方法的地基，先把基础打牢，后面才能事半功倍。',
    '第二，{p}。这里有个关键细节：先从小处入手，每天进步一点点，坚持一个月就能看到明显变化。',
    '第三，{p}。很多人忽略了这个环节，恰恰是它决定了你能不能长期坚持下去。',
    '再补充一点，{p}。把这一点做好，你会发现整体效率至少提升一倍。',
  ],
  '种草': [
    '首先，{p}，这个设计真的太贴心了，用过就回不去了。',
    '其次，{p}，性价比真的绝了，这个价位能买到这种品质，闭眼入都不亏。',
    '最让我惊喜的是，{p}，细节做得特别到位，一看就很用心。',
  ],
  '故事': [
    '第一个转折点，是{p}，那次经历让我彻底改变了想法。',
    '后来我发现了{p}，事情才开始有了转机。',
    '最重要的是{p}，直到今天我还在坚持这个习惯。',
  ],
  '资讯': [
    '第一，{p}，这一点和我们都有关，要重点留意。',
    '第二，{p}，接下来可能会有相应的配套动作。',
    '第三，{p}，建议大家提前做好准备。',
  ],
};

const ENDINGS = {
  '干货': ['好了，今天的分享就到这里。如果对你有帮助，记得点赞收藏，关注我，下期继续分享更多干货。', '以上就是全部核心了，说起来简单，做到才是关键。觉得有用的话，转发给需要的朋友，我们下期见。'],
  '种草': ['好了，今天的分享就到这里，喜欢的话记得点赞关注，评论区告诉我你想看什么，我们下期见。', '有需要的姐妹可以直接安排了，用过的都可以来评论区聊聊感受。喜欢就点个关注吧。'],
  '故事': ['这就是我的故事，希望能给你一点启发。如果喜欢这样的内容，点个关注，我们下期继续。', '每个人的路都不一样，但方法可以借鉴。觉得有共鸣的，评论区聊聊，我们下期见。'],
  '资讯': ['以上就是今天的全部内容，关注我，重要信息第一时间同步给你。', '后续进展我会持续跟进，记得点个关注，我们下期见。'],
};

const GENERIC_POINTS = {
  '干货': ['明确目标，把大目标拆成每天可执行的小步骤', '建立反馈机制，每周复盘一次，及时调整方向', '借助工具提升效率，把重复的事情交给自动化', '找对圈子，和同频的人互相督促成长'],
  '种草': ['颜值和质感都在线，拿出来很有面子', '上手非常简单，新手也能快速用好', '价格很实惠，学生党也没有压力', '售后有保障，用着特别放心'],
  '故事': ['真正开始行动，而不是停留在计划里', '遇到问题先找方法，而不是找借口', '把别人的经验变成自己的路标'],
  '资讯': ['政策层面的支持力度在加大', '行业内的头部玩家已经开始布局', '普通人的机会窗口正在打开'],
};

const POLISH_MAP = [
  ['因此', '所以'], ['然而', '但是'], ['即可', '就能'], ['以及', '和'], ['十分', '特别'],
  ['非常地', '特别'], ['进行了', '做了'], ['的话呢', '的话'], ['那么', '那'], ['之所以', '之所以'],
  ['首先呢', '首先'], ['众所周知', '大家都知道'], ['综上所述', '总结一下'], ['予以', '给予'],
  ['倘若', '如果'], ['亦', '也'], ['并', '并且'], ['诸位', '大家'],
  // 全局替换的语病修正（"会因此"→"会所以"不通顺，回改）
  ['会所以', '会因此'], ['将所以', '将因此'], ['也所以', '也因此'], ['能所以', '能因此'],
];

const rand = (arr, seed) => arr[Math.floor(seededRandom(seed) * arr.length)];
function seededRandom(seedState) {
  // 简单可重置伪随机
  seedState.v = (seedState.v * 1664525 + 1013904223) % 4294967296;
  return seedState.v / 4294967296;
}
function newSeed(topic) {
  let h = 0;
  for (const c of String(topic)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return { v: h + Date.now() % 100000 };
}

const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const SPEECH_RATE = 4.2; // 字/秒

export function localGenerate({ topic, points = '', style = '干货', durationSec = 60, audience = '' }) {
  const seed = newSeed(topic + style);
  const dur = Math.max(20, Math.min(300, Number(durationSec) || 60));
  const targetChars = Math.round(dur * SPEECH_RATE);
  const who = audience ? `，特别是${audience}` : '';

  const parts = [];
  const durWord = dur <= 40 ? '半分钟' : dur <= 70 ? '一分钟' : '两分钟';
  parts.push(fill(rand(HOOKS[style] || HOOKS['干货'], seed), { topic, dur: durWord }));

  // 要点数量按时长分配
  let pointList = points.split(/[，,、\n;；]/).map(s => s.trim()).filter(Boolean);
  const maxPoints = Math.max(1, Math.min(pointList.length || 4, Math.floor(dur / 18)));
  while (pointList.length < maxPoints) {
    const g = rand(GENERIC_POINTS[style] || GENERIC_POINTS['干货'], seed);
    if (!pointList.includes(g)) pointList.push(g);
  }
  pointList = pointList.slice(0, maxPoints);

  parts.push(rand(PAIN[style] || PAIN['干货'], seed));

  const tplPool = POINT_TPL[style] || POINT_TPL['干货'];
  pointList.forEach((p, i) => {
    parts.push(fill(tplPool[i % tplPool.length], { p }));
  });

  parts.push(rand(ENDINGS[style] || ENDINGS['干货'], seed));

  let script = parts.join('');

  // 字数控制：超长删要点，不足补要点
  const count = s => s.replace(/\s/g, '').length;
  while (count(script) > targetChars * 1.25 && pointList.length > 1) {
    pointList.pop();
    const tp = [parts[0], rand(PAIN[style] || PAIN['干货'], seed),
      ...pointList.map((p, i) => fill(tplPool[i % tplPool.length], { p })), parts[parts.length - 1]];
    script = tp.join('');
  }
  while (count(script) < targetChars * 0.7) {
    const g = rand(GENERIC_POINTS[style] || GENERIC_POINTS['干货'], seed);
    if (pointList.includes(g)) break;
    pointList.push(g);
    parts.splice(parts.length - 1, 0, fill(tplPool[pointList.length % tplPool.length], { p: g }));
    script = parts.join('');
  }
  return { script, meta: { engine: 'local', style, durationSec: dur, chars: count(script), audience } };
}

// 本地润色：口语化 + 长句拆分 + 结构检查
export function localPolish(script) {
  let s = script.trim();
  for (const [a, b] of POLISH_MAP) s = s.split(a).join(b);
  // 超长句在逗号处断开
  const out = [];
  for (const sentence of s.split(/(?<=[。！？!?])/)) {
    if (sentence.length <= 40) { out.push(sentence); continue; }
    let buf = '';
    for (const seg of sentence.split(/(?<=[，,])/)) {
      if ((buf + seg).length > 28) { out.push(buf); buf = seg; } else buf += seg;
    }
    if (buf) out.push(buf);
  }
  s = out.join('').replace(/([，,])\s*([。！？])/g, '$2').replace(/([。！？]){2,}/g, '$1');
  return { script: s, meta: { engine: 'local', chars: s.replace(/\s/g, '').length } };
}

// ---- LLM 引擎（OpenAI 兼容）----
async function llmChat(messages, { timeoutMs = 90000 } = {}) {
  const settings = getSettings({ llm: {}, tts: {}, render: {}, brand: {} });
  const baseUrl = (settings.llm.baseUrl || '').replace(/\/+$/, '');
  const apiKey = settings.llm.apiKey || '';
  const model = settings.llm.model || '';
  if (!baseUrl || !apiKey || !model) throw new Error('LLM 未配置');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.8 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM 接口返回 ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 返回内容为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateScript(params) {
  const settings = getSettingsSafe();
  const useLlm = settings.llm?.baseUrl && settings.llm?.apiKey && settings.llm?.model;
  if (useLlm) {
    try {
      const content = await llmChat([
        { role: 'system', content: '你是一位顶级短视频口播文案写手。要求：口语化、短句、有网感，直接输出文案正文，不要标题、不要 markdown、不要舞台提示。' },
        { role: 'user', content: `请写一条口播视频文案。\n主题：${params.topic}\n风格：${params.style}\n时长：约${params.durationSec}秒（按每秒4个字估算字数）\n${params.audience ? `受众：${params.audience}\n` : ''}${params.points ? `必须涵盖的要点：${params.points}\n` : ''}结构：强钩子开头 → 共鸣/痛点 → 核心要点 → 总结 → 引导互动。` },
      ]);
      return { script: content.trim(), meta: { engine: 'llm', model: settings.llm.model } };
    } catch (err) {
      console.warn('[llm] 生成失败，回退本地引擎:', err.message);
    }
  }
  return localGenerate(params);
}

export async function polishScript(script, mode = '润色') {
  const settings = getSettingsSafe();
  const useLlm = settings.llm?.baseUrl && settings.llm?.apiKey && settings.llm?.model;
  if (useLlm) {
    try {
      const content = await llmChat([
        { role: 'system', content: mode === '优化' ? '你是口播文案优化专家：让文案更有钩子、节奏更强、更适合口播。直接输出优化后的文案，不要解释。' : '你是口播文案润色专家：修正语病、书面语口语化、长句拆短，保持原意。直接输出润色后的文案，不要解释。' },
        { role: 'user', content: script },
      ]);
      return { script: content.trim(), meta: { engine: 'llm', mode } };
    } catch (err) {
      console.warn('[llm] 润色失败，回退本地引擎:', err.message);
    }
  }
  return localPolish(script);
}

function getSettingsSafe() {
  // eslint-disable-next-line
  return getSettings({ llm: {}, tts: {}, render: {}, brand: {} });
}

// ---- 模板库（供前端"从模板选择"）----
export const TEMPLATES = [
  { id: 't1', name: '干货知识口播', style: '干货', durationSec: 60, desc: '三点式干货结构，适合知识分享、教程讲解', sample: '主题：如何做好时间管理\n要点：要事优先 / 番茄工作法 / 每日复盘' },
  { id: 't2', name: '好物种草口播', style: '种草', durationSec: 45, desc: '痛点切入+卖点展开，适合产品推荐', sample: '主题：便携榨汁杯\n要点：小巧便携 / 充电快 / 好清洗' },
  { id: 't3', name: '个人故事口播', style: '故事', durationSec: 60, desc: '第一人称叙事，适合经历分享、成长感悟', sample: '主题：我从程序员到自由职业\n要点：裸辞的勇气 / 找到方向 / 持续学习' },
  { id: 't4', name: '行业资讯口播', style: '资讯', durationSec: 40, desc: '快节奏资讯播报，适合新闻动态解读', sample: '主题：新能源汽车新政策\n要点：补贴延续 / 充电桩建设' },
  { id: 't5', name: '产品介绍口播', style: '干货', durationSec: 30, desc: '短平快介绍产品核心价值', sample: '主题：智能语音助手\n要点：一句话设置提醒 / 全屋联动' },
  { id: 't6', name: '促销活动口播', style: '种草', durationSec: 30, desc: '营造紧迫感，突出活动力度', sample: '主题：周年庆大促\n要点：全场五折 / 限量赠品 / 仅剩三天' },
];
