import re
import sys

def analyze(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    functions = []
    stack = []
    
    for i, line in enumerate(lines):
        line = line.strip()
        # simplified heuristic, looking for `const handle... = (...) => {` or `function ...`
        if re.search(r'(const|let|var)\s+\w+\s*=\s*(async\s+)?\(.*\)\s*=>\s*\{', line):
            name_match = re.search(r'(const|let|var)\s+(\w+)', line)
            if name_match:
                functions.append({"name": name_match.group(2), "start": i, "open": 1, "close": 0})
                stack.append(len(functions) - 1)
        elif re.search(r'function\s+(\w+)\s*\(', line):
            name_match = re.search(r'function\s+(\w+)', line)
            if name_match:
                functions.append({"name": name_match.group(1), "start": i, "open": 1, "close": 0})
                stack.append(len(functions) - 1)
        
        # count braces
        if stack:
            open_count = line.count('{')
            close_count = line.count('}')
            
            # If the declaration line had braces, they were counted in `open`, but we might overcount or undercount if we don't handle the exact line
            # Let's do a simpler full text index search
            pass

    # A simpler way is to just grep for them and look at the line numbers
analyze(sys.argv[1])
