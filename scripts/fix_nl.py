import re

with open('src/workspace/hooks/useChatSend.ts', 'r') as f:
    text = f.read()

# I want to find `.join('` followed by a literal newline, then `')` and replace it with `.join('\\n')`
# Or I could just replace any string literal that is incorrectly split.
# A simpler way is to replace `.join('\n')`
text = re.sub(r"\.join\('[\r\n]+'\)", ".join('\\n')", text)

# There's another `\n\n` somewhere:
#   ? `${currentSelectedShortcut.prompt}\n\n${userInputPart}`
#  We can fix this by replacing `` `${currentSelectedShortcut.prompt}[\r\n]+${userInputPart}` ``
text = re.sub(r"`\$\{currentSelectedShortcut\.prompt\}[\r\n]+\$\{userInputPart\}`", "`\\${currentSelectedShortcut.prompt}\\n\\n\\${userInputPart}`", text)

# And another `\n\n[PPT 生成设置]`
text = re.sub(r"`[\r\n]+\[PPT 生成设置\] \$\{slideSettingsToPromptSuffix\(slideSettings\)\}`", "`\\n\\n[PPT 生成设置] \\${slideSettingsToPromptSuffix(slideSettings)}`", text)

with open('src/workspace/hooks/useChatSend.ts', 'w') as f:
    f.write(text)

print("Fixed newlines in useChatSend")
