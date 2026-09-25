import os
import re

def fix_cors(directory):
    pattern1 = re.compile(r"(\s*//.*通配符)?\s*if\s*\(\s*ALLOWED_ORIGINS\.some\([^)]+\)\s*&&\s*origin\.startsWith\('chrome-extension://'\)\s*\)\s*\{\s*return origin;\s*\}", re.MULTILINE)
    
    # Another format 
    pattern2 = re.compile(r"(\s*//.*)?\s*if\s*\(\s*ALLOWED_ORIGINS\.some\(\(.*\)\s*=>\s*.*===\s*'chrome-extension://\*'\)\s*&&\s*origin\.startsWith\('chrome-extension://'\)\s*\)\s*\{\s*return origin;\s*\}", re.MULTILINE)
    
    pattern_env1 = re.compile(r",chrome-extension://\*")
    pattern_env2 = re.compile(r"chrome-extension://\*,")

    for root, dirs, files in os.walk(directory):
        if 'node_modules' in root or '.git' in root:
            continue
        for file in files:
            if not file.endswith('.ts') and not 'env' in file:
                continue
            
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            original = content
            content = pattern1.sub('', content)
            content = pattern2.sub('', content)
            content = pattern_env1.sub(',chrome-extension://<your-extension-id>', content)
            content = pattern_env2.sub('chrome-extension://<your-extension-id>,', content)
            
            if content != original:
                print("Fixed CORS in", filepath)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)

fix_cors('.')
