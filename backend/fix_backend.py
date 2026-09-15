import re

with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/backend/geminiEngine.js', 'r') as f:
    code = f.read()

# We need to remove the parts where it sends the report text.
# Let's carefully find and replace.

old_block = """      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: `_Translating to ${language}..._\\n\\n` }));
        noOpReport = await translateTextWithGroq(noOpReport, language);
      }

      const parts = noOpReport.split('\\n');
      for (const p of parts) {
        clientWs.send(JSON.stringify({ status: 'update', text: p + '\\n' }));
        await new Promise(r => setTimeout(r, 35));
      }"""

new_block = """      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: `_Translating Deep Scan results to ${language}..._\\n\\n` }));
        // Translation happens on frontend/premium cards or is handled natively by the UI
      }"""

code = code.replace(old_block, new_block)

old_block2 = """      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: `_Translating to ${language}..._\\n\\n` }));
        report = await translateTextWithGroq(report, language);
      }

      const parts = report.split('\\n');
      for (const p of parts) {
        clientWs.send(JSON.stringify({ status: 'update', text: p + '\\n' }));
        await new Promise(r => setTimeout(r, 35));
      }"""

new_block2 = """      if (language && language !== 'English') {
        clientWs.send(JSON.stringify({ status: 'update', text: `_Translating Deep Scan results to ${language}..._\\n\\n` }));
      }"""

code = code.replace(old_block2, new_block2)

with open('/home/gaurishankar/Desktop/IDEAT/ghosttrade/backend/geminiEngine.js', 'w') as f:
    f.write(code)

print("SUCCESS")
