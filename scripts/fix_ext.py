import re
import os

with open('src/content/extractors/types.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# export ContentBlock
text = text.replace('interface ContentBlock', 'export interface ContentBlock')
text = text.replace('interface RawContent', 'export interface RawContent')
with open('src/content/extractors/types.ts', 'w', encoding='utf-8') as f:
    f.write(text)

with open('src/content/extractors/helpers.ts', 'r', encoding='utf-8') as f:
    helpers = f.read()

for fn in ['cleanTitle', 'escapeHtml', 'buildRawContent', 'fetchImageFromUrl', 'compressBase64Image']:
    helpers = re.sub(r'^(async\s+function\s+' + fn + ')', r'export \1', helpers, flags=re.MULTILINE)
    helpers = re.sub(r'^(function\s+' + fn + ')', r'export \1', helpers, flags=re.MULTILINE)
    
helpers = helpers.replace('export export', 'export')
helpers = helpers.replace('import { MAX_IMAGES', 'import { COMPRESS_QUALITY, MAX_IMAGE_SIZE')

with open('src/content/extractors/helpers.ts', 'w', encoding='utf-8') as f:
    f.write(helpers)

for platform in ['twitter', 'weixin', 'weibo', 'generic']:
    with open(f'src/content/extractors/{platform}.ts', 'r', encoding='utf-8') as f:
        plat = f.read()
    plat = re.sub(r'^function\s+', 'export function ', plat, flags=re.MULTILINE)
    plat = re.sub(r'^async\s+function\s+', 'export async function ', plat, flags=re.MULTILINE)
    # the function itself is used by the class later in the same file.
    with open(f'src/content/extractors/{platform}.ts', 'w', encoding='utf-8') as f:
        f.write(plat)

print("Patched.")
