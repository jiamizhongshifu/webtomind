import sys
import re
import os

filepath = 'src/content/raw-content-extractor.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

def get_block(start_str, end_str):
    start = text.find(start_str)
    if start == -1: return ""
    if end_str:
        end = text.find(end_str, start)
        if end == -1: end = len(text)
    else:
        end = len(text)
    return text[start:end]

shared_code = get_block("/**", "export async function extractTwitterRawContent")
twitter_code = get_block("export async function extractTwitterRawContent", "export async function extractWeixinRawContent")
weixin_code = get_block("export async function extractWeixinRawContent", "export async function extractWeiboRawContent")
weibo_code = get_block("export async function extractWeiboRawContent", "export async function extractGenericRawContent")
generic_code = get_block("export async function extractGenericRawContent", "export async function fetchImageForPlatform")
helpers_code = get_block("export async function fetchImageForPlatform", "export async function extractRawContent")
main_code = get_block("export async function extractRawContent", None)

os.makedirs('src/content/extractors', exist_ok=True)

# Let's verify we got everything
print(f"shared: {len(shared_code)}")
print(f"twitter: {len(twitter_code)}")
print(f"weixin: {len(weixin_code)}")
print(f"weibo: {len(weibo_code)}")
print(f"generic: {len(generic_code)}")
print(f"helpers: {len(helpers_code)}")
print(f"main: {len(main_code)}")

with open('src/content/extractors/test.py.log', 'w') as f:
    f.write("Done")
