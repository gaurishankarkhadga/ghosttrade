import re

with open('frontend/src/components/PromptInputBar.jsx', 'r') as f:
    content = f.read()

# Replace the duplicated chipIcon declarations
content = re.sub(r'let chipIcon = \' \';\n\s*let chipIcon = \'⚡ \';', 'let chipIcon = \'⚡ \';', content)
content = re.sub(r'chipIcon = \' \';\n\s*chipIcon = \'⚠️ \';', 'chipIcon = \'⚠️ \';', content)
content = re.sub(r'chipIcon = \'\';\n\s*chipIcon = \'⏱️ \';', 'chipIcon = \'⏱️ \';', content)
content = re.sub(r'chipIcon = direction === \'BULLISH\' \? \' \' : \' \';\n\s*chipIcon = direction === \'BULLISH\' \? \'🟢 \' : \'🔴 \';', 'chipIcon = direction === \'BULLISH\' ? \'🟢 \' : \'🔴 \';', content)
content = re.sub(r'chipIcon = \' \';\n\s*chipIcon = \'🛡️ \';', 'chipIcon = \'🛡️ \';', content)

with open('frontend/src/components/PromptInputBar.jsx', 'w') as f:
    f.write(content)
