import json

with open('/home/gaurishankar/.gemini/antigravity/brain/edac7fd4-4fa5-49c9-aa6c-573870c974cb/.system_generated/logs/overview.txt', 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if 'tool_calls' in data:
                for call in data['tool_calls']:
                    if call.get('name') == 'run_command':
                        cmd = call.get('args', {}).get('CommandLine', '')
                        if "cat << 'EOF' > backend/patternEngine.js" in cmd:
                            content = cmd.split("cat << 'EOF' > backend/patternEngine.js\\n")[1].split("\\nEOF")[0]
                            content = content.replace('\\n', '\n').replace('\\"', '"')
                            with open('patternEngine_recovered.js', 'w') as out: out.write(content)
                        if "cat << 'EOF' > backend/backtestEngine.js" in cmd:
                            content = cmd.split("cat << 'EOF' > backend/backtestEngine.js\\n")[1].split("\\nEOF")[0]
                            content = content.replace('\\n', '\n').replace('\\"', '"')
                            with open('backtestEngine_recovered.js', 'w') as out: out.write(content)
                        if "cat << 'EOF' > backend/slTpCalculator.js" in cmd:
                            content = cmd.split("cat << 'EOF' > backend/slTpCalculator.js\\n")[1].split("\\nEOF")[0]
                            content = content.replace('\\n', '\n').replace('\\"', '"')
                            with open('slTpCalculator_recovered.js', 'w') as out: out.write(content)
                        if "cat << 'EOF' > backend/monitorWorker.js" in cmd:
                            content = cmd.split("cat << 'EOF' > backend/monitorWorker.js\\n")[1].split("\\nEOF")[0]
                            content = content.replace('\\n', '\n').replace('\\"', '"')
                            with open('monitorWorker_recovered.js', 'w') as out: out.write(content)
        except Exception as e:
            pass

print("Recovery attempted.")
