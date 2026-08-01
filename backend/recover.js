const fs = require('fs');
const logs = fs.readFileSync('/home/gaurishankar/.gemini/antigravity/brain/edac7fd4-4fa5-49c9-aa6c-573870c974cb/.system_generated/logs/overview.txt', 'utf8').split('\n').filter(l => l.trim().length > 0);

for (const line of logs) {
  try {
    const json = JSON.parse(line);
    if (json.tool_calls) {
      for (const call of json.tool_calls) {
        if (call.name === 'run_command' && call.args && call.args.CommandLine) {
          const cmd = call.args.CommandLine;
          if (cmd.includes("cat << 'EOF' > backend/patternEngine.js")) {
            const content = cmd.split("cat << 'EOF' > backend/patternEngine.js\\n")[1].split("\\nEOF")[0];
            fs.writeFileSync('patternEngine_recovered.js', content.replace(/\\n/g, '\n').replace(/\\\\"/g, '"'));
          }
          if (cmd.includes("cat << 'EOF' > backend/backtestEngine.js")) {
            const content = cmd.split("cat << 'EOF' > backend/backtestEngine.js\\n")[1].split("\\nEOF")[0];
            fs.writeFileSync('backtestEngine_recovered.js', content.replace(/\\n/g, '\n').replace(/\\\\"/g, '"'));
          }
          if (cmd.includes("cat << 'EOF' > backend/slTpCalculator.js")) {
             const content = cmd.split("cat << 'EOF' > backend/slTpCalculator.js\\n")[1].split("\\nEOF")[0];
             fs.writeFileSync('slTpCalculator_recovered.js', content.replace(/\\n/g, '\n').replace(/\\\\"/g, '"'));
          }
        }
      }
    }
  } catch (e) {}
}
console.log("Recovery attempted.");
