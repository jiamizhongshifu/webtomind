import re

with open('src/workspace/components/ChatArea.tsx', 'r') as f:
    chat_area_code = f.read()

# I will just write a python script that writes ChatInputArea.tsx template
chat_input_template = """import React from 'react';

export interface ChatInputAreaProps {
    // To be filled...
}

export function ChatInputArea(props: ChatInputAreaProps) {
    const { ...rest } = props;
    return (
        // JSX goes here
        null
    );
}
"""

with open('src/workspace/components/ChatInputArea.tsx', 'w') as f:
    f.write(chat_input_template)

