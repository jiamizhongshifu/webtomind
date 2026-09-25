import re
import os

filepath = 'src/content/raw-content-extractor.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

def get_block(start_str, end_str):
    start = text.find(start_str)
    if start == -1: return ""
    if end_str is not None:
        end = text.find(end_str, start)
        if end == -1: end = len(text)
    else:
        end = len(text)
    return text[start:end]

# Extract basic types and helper functions
shared_start = text.find('import { createLogger }')
# The boundary between shared and the rest
# The shared ends before extractTwitterRawContent, but wait, there is extractInlineEmojiFromImage
boundary_1 = text.find('async function extractTwitterRawContent')
shared_code = text[shared_start:boundary_1]

# Now for Twitter
boundary_2 = text.find('async function extractWeixinRawContent')
twitter_code = text[boundary_1:boundary_2]

# For Weixin
boundary_3 = text.find('async function extractWeiboRawContent')
weixin_code = text[boundary_2:boundary_3]

# For Weibo
boundary_4 = text.find('async function extractGenericRawContent')
weibo_code = text[boundary_3:boundary_4]

# For Generic
boundary_5 = text.find('// ==========================================')
generic_code = text[boundary_4:boundary_5]

# Helpers (fetchImageForPlatform)
boundary_6 = text.find('export async function extractRawContent')
helpers_code = text[boundary_5:boundary_6]

main_code = text[boundary_6:]

os.makedirs('src/content/extractors', exist_ok=True)

with open('src/content/extractors/types.ts', 'w', encoding='utf-8') as f:
    f.write(shared_code)

with open('src/content/extractors/helpers.ts', 'w', encoding='utf-8') as f:
    # Need to import RawContent, ContentBlock from types
    f.write("import { createLogger } from '@/utils/logger';\n")
    f.write("import { COMPRESS_QUALITY, MAX_IMAGE_SIZE } from './types';\n")
    f.write(helpers_code)

# Let's fix exports and imports for the python script in a separate more robust script.
# We'll just print out sizes first.
print(f"shared: {len(shared_code)}, twitter: {len(twitter_code)}, weixin: {len(weixin_code)}, weibo: {len(weibo_code)}, generic: {len(generic_code)}, helpers: {len(helpers_code)}, main: {len(main_code)}")
