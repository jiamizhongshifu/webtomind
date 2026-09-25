import re
import os

with open('src/content/extractors/types.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('interface ContentBlock', 'export interface ContentBlock')
text = text.replace('function extractInlineEmojiFromImage', 'export function extractInlineEmojiFromImage')
text = text.replace('export export', 'export')

with open('src/content/extractors/types.ts', 'w', encoding='utf-8') as f:
    f.write(text)

with open('src/content/raw-content-extractor.ts', 'r', encoding='utf-8') as f:
    text = f.read()
text = text.replace('getExtractor(url: string, hostname: string)', 'getExtractor(hostname: string)')
text = text.replace('getExtractor(url, hostname)', 'getExtractor(hostname)')
with open('src/content/raw-content-extractor.ts', 'w', encoding='utf-8') as f:
    f.write(text)

# Also fix the unused imports in generic, twitter, weixin, weibo
for file in ['generic.ts', 'twitter.ts', 'weixin.ts']:
    with open('src/content/extractors/' + file, 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('buildRawContent, ', '')
    text = text.replace(', buildRawContent', '')
    with open('src/content/extractors/' + file, 'w', encoding='utf-8') as f:
        f.write(text)
