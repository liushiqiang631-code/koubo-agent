# -*- coding: utf-8 -*-
"""
单句 TTS 合成桥接（调用微软 Edge 神经语音，由 edge-tts 官方库维护协议）
用法:
  python tts_edge.py --text "一句话" --voice zh-CN-XiaoxiaoNeural \
      --rate "+0%" --pitch "+0Hz" --out-audio s0.mp3 --out-words s0.json
输出: mp3 音频 + 词级时间戳 JSON([{text,start,end}]，单位秒)
"""
import argparse
import asyncio
import json
import sys

import edge_tts


async def synth(text, voice, rate, pitch, out_audio, out_words):
    c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary='WordBoundary')
    audio = bytearray()
    words = []
    async for chunk in c.stream():
        if chunk['type'] == 'audio':
            audio.extend(chunk['data'])
        elif chunk['type'] == 'WordBoundary':
            words.append({
                'text': chunk['text'],
                'start': chunk['offset'] / 1e7,
                'end': (chunk['offset'] + chunk['duration']) / 1e7,
            })
    if len(audio) < 800:
        raise RuntimeError(f'音频过小: {len(audio)}B')
    with open(out_audio, 'wb') as f:
        f.write(bytes(audio))
    with open(out_words, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--text', required=True)
    ap.add_argument('--voice', default='zh-CN-XiaoxiaoNeural')
    ap.add_argument('--rate', default='+0%')
    ap.add_argument('--pitch', default='+0Hz')
    ap.add_argument('--out-audio', required=True)
    ap.add_argument('--out-words', required=True)
    a = ap.parse_args()
    asyncio.run(synth(a.text, a.voice, a.rate, a.pitch, a.out_audio, a.out_words))
    print('OK')
