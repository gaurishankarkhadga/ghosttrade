import re

with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/frontend/src/components/AiMessageBubble.jsx', 'r') as f:
    code = f.read()

# We want to change:
# {smoothedContent && (
#   <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
# )}
# TO:
# {smoothedContent && message.uiComponent !== 'DEEP_SCAN_RESULTS' && (
#   <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
# )}

old_snippet = """{smoothedContent && (
              <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
            )}"""

new_snippet = """{smoothedContent && message.uiComponent !== 'DEEP_SCAN_RESULTS' && (
              <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
            )}"""

if old_snippet in code:
    code = code.replace(old_snippet, new_snippet)
    with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/frontend/src/components/AiMessageBubble.jsx', 'w') as f:
        f.write(code)
    print("SUCCESS")
else:
    print("Snippet not found")
