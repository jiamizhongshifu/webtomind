import re

with open('src/workspace/components/ChatArea.tsx', 'r') as f:
    text = f.read()

start = text.find('const handleSend = async () => {')

# Find the matching closing brace for the handleSend function
brace_count = 0
found_first_brace = False
end = start
for i in range(start, len(text)):
    if text[i] == '{':
        brace_count += 1
        found_first_brace = True
    elif text[i] == '}':
        brace_count -= 1
        
    if found_first_brace and brace_count == 0:
        end = i + 1
        break

handle_send_code = text[start:end]

hook_template = f"""import {{ useRef, useCallback }} from 'react';
import type {{ Reference }} from '@/types';
import type {{ Shortcut }} from '@/services/database';
// imports will need to be added manually or automatically

export interface UseChatSendProps {{
  // Add props here
}}

export function useChatSend(props: UseChatSendProps) {{
  const {{
    // Destructure props here
  }} = props;

  {handle_send_code}

  return {{
    handleSend
  }};
}}
"""

with open('src/workspace/hooks/useChatSend.ts', 'w') as f:
    f.write(hook_template)

# Replace handleSend in ChatArea
text = text[:start] + 'const { handleSend } = useChatSend({ /* props */ });' + text[end:]

with open('src/workspace/components/ChatArea.tsx', 'w') as f:
    f.write(text)

print("Extracted handleSend successfully.")
