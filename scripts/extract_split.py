import re
import os

filepath = 'src/content/raw-content-extractor.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# Make extractors dir
os.makedirs('src/content/extractors', exist_ok=True)

# Define exact boundaries
b0 = 0
b1 = text.find('export async function extractRawContent')
b2 = text.find('async function extractTwitterRawContent')
b3 = text.find('async function extractWeixinRawContent')
b4 = text.find('async function extractWeiboRawContent')
b5 = text.find('async function extractGenericRawContent')
b6 = text.find('async function fetchImageFromUrl')

shared_code = text[b0:b1]
main_code = text[b1:b2]
twitter_code = text[b2:b3]
weixin_code = text[b3:b4]
weibo_code = text[b4:b5]
generic_code = text[b5:b6]
helpers_code = text[b6:]

# 1. Types & Shared
shared_code = re.sub(r'const\s+MAX_IMAGES', 'export const MAX_IMAGES', shared_code)
shared_code = re.sub(r'const\s+MAX_IMAGE_SIZE', 'export const MAX_IMAGE_SIZE', shared_code)
shared_code = re.sub(r'const\s+COMPRESS_QUALITY', 'export const COMPRESS_QUALITY', shared_code)
shared_code = re.sub(r'function\s+extractInlineEmojiFromImage', 'export function extractInlineEmojiFromImage', shared_code)
shared_code = shared_code.replace('interface ContentBlock', 'export interface ContentBlock')
shared_code = shared_code.replace('interface RawContent', 'export interface RawContent')

types_ts = shared_code + """
export interface ExtractorStrategy {
  extract(title: string): Promise<RawContent>;
}
"""
with open('src/content/extractors/types.ts', 'w', encoding='utf-8') as f:
    f.write(types_ts)

# 2. Helpers
helpers_code = re.sub(r'^(async\s+function\s+)', r'export \1', helpers_code, flags=re.MULTILINE)
helpers_code = re.sub(r'^(function\s+)', r'export \1', helpers_code, flags=re.MULTILINE)
helpers_code = helpers_code.replace('export export', 'export')

helpers_ts = f"""import {{ createLogger }} from '@/utils/logger';
import type {{ RawContent, ContentBlock }} from './types';
import {{ MAX_IMAGES, MAX_IMAGE_SIZE, COMPRESS_QUALITY }} from './types';

const log = createLogger('RawExtractor');

{helpers_code}
"""
with open('src/content/extractors/helpers.ts', 'w', encoding='utf-8') as f:
    f.write(helpers_ts)

# 3. Twitter
twitter_ts = f"""import {{ createLogger }} from '@/utils/logger';
import type {{ RawContent, ContentBlock, ExtractorStrategy }} from './types';
import {{ extractInlineEmojiFromImage, MAX_IMAGES }} from './types';
import {{ fetchImagesFromUrlBatch, buildRawContent, cleanTitle, escapeHtml }} from './helpers';

const log = createLogger('RawExtractor');

{re.sub(r'^(async\s+function|function)\s+', r'export \1 ', twitter_code, flags=re.MULTILINE)}

export class TwitterExtractor implements ExtractorStrategy {{
  extract(title: string): Promise<RawContent> {{
    return extractTwitterRawContent(title);
  }}
}}
"""
with open('src/content/extractors/twitter.ts', 'w', encoding='utf-8') as f:
    f.write(twitter_ts)

# 4. Weixin
weixin_ts = f"""import {{ createLogger }} from '@/utils/logger';
import type {{ RawContent, ContentBlock, ExtractorStrategy }} from './types';
import {{ extractInlineEmojiFromImage, MAX_IMAGES }} from './types';
import {{ fetchImagesFromUrlBatch, buildRawContent, escapeHtml, cleanTitle }} from './helpers';

const log = createLogger('RawExtractor');

{re.sub(r'^(async\s+function|function)\s+', r'export \1 ', weixin_code, flags=re.MULTILINE)}

export class WeixinExtractor implements ExtractorStrategy {{
  extract(title: string): Promise<RawContent> {{
    return extractWeixinRawContent(title);
  }}
}}
"""
with open('src/content/extractors/weixin.ts', 'w', encoding='utf-8') as f:
    f.write(weixin_ts)

# 5. Weibo
weibo_ts = f"""import {{ createLogger }} from '@/utils/logger';
import type {{ RawContent, ExtractorStrategy }} from './types';
import {{ MAX_IMAGES }} from './types';
import {{ fetchImagesFromUrlBatch, buildRawContent }} from './helpers';

const log = createLogger('RawExtractor');

{re.sub(r'^(async\s+function|function)\s+', r'export \1 ', weibo_code, flags=re.MULTILINE)}

export class WeiboExtractor implements ExtractorStrategy {{
  extract(title: string): Promise<RawContent> {{
    return extractWeiboRawContent(title);
  }}
}}
"""
with open('src/content/extractors/weibo.ts', 'w', encoding='utf-8') as f:
    f.write(weibo_ts)

# 6. Generic
generic_ts = f"""import {{ createLogger }} from '@/utils/logger';
import type {{ RawContent, ContentBlock, ExtractorStrategy }} from './types';
import {{ extractInlineEmojiFromImage, MAX_IMAGES }} from './types';
import {{ fetchImagesFromUrlBatch, cleanTitle, escapeHtml, buildRawContent }} from './helpers';

const log = createLogger('RawExtractor');

{re.sub(r'^(async\s+function|function)\s+', r'export \1 ', generic_code, flags=re.MULTILINE)}

export class GenericExtractor implements ExtractorStrategy {{
  extract(title: string): Promise<RawContent> {{
    return extractGenericRawContent(title);
  }}
}}
"""
with open('src/content/extractors/generic.ts', 'w', encoding='utf-8') as f:
    f.write(generic_ts)

# 7. Main raw-content-extractor.ts
index_ts = f"""import {{ createLogger }} from '@/utils/logger';
import type {{ RawContent, ExtractorStrategy }} from './extractors/types';
import {{ TwitterExtractor }} from './extractors/twitter';
import {{ WeixinExtractor }} from './extractors/weixin';
import {{ WeiboExtractor }} from './extractors/weibo';
import {{ GenericExtractor }} from './extractors/generic';

export * from './extractors/types';
export * from './extractors/helpers';

const log = createLogger('RawExtractor');

export class ExtractorFactory {{
  static getExtractor(url: string, hostname: string): ExtractorStrategy {{
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {{
      return new TwitterExtractor();
    }}
    if (hostname.includes('mp.weixin.qq.com')) {{
      return new WeixinExtractor();
    }}
    if (hostname.includes('weibo.com')) {{
      return new WeiboExtractor();
    }}
    return new GenericExtractor();
  }}
}}

{main_code}
"""
index_ts = re.sub(
    r'if\s*\(hostname\.includes[\s\S]*?return\s+extractGenericRawContent\(pageTitle\);\s*\}[\s\n]*',
    'const strategy = ExtractorFactory.getExtractor(url, hostname);\n    return await strategy.extract(pageTitle);\n\n',
    index_ts
)

with open('src/content/raw-content-extractor.ts', 'w', encoding='utf-8') as f:
    f.write(index_ts)

print("Split logic created successfully.")
