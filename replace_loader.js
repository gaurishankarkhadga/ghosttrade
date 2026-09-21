const fs = require('fs');
const path = './frontend/src/components/AiChatInterface.jsx';

let content = fs.readFileSync(path, 'utf8');

const matrixComponent = `
function MatrixTerminalLoader() {
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    const fullLogs = [
      "> INITIATING DEEP SCAN PROTOCOL v2.0.1",
      "> CONNECTING TO BINANCE LIQUIDITY POOLS... [OK]",
      "> EXTRACTING LEVEL 2 ORDER BOOK... [OK]",
      "> COMPUTING HURST EXPONENT (H)...",
      "> REGIME DETECTED: TRENDING_BULLISH (H=0.68)",
      "> APPLYING KELLY CRITERION RISK MATRIX...",
      "> VALIDATING TRADE LOGIC... [OK]",
      "> SYNTHESIZING FINAL INTELLIGENCE REPORT..."
    ];
    
    let currentLog = 0;
    const interval = setInterval(() => {
      if (currentLog < fullLogs.length) {
        setLogs(prev => {
           // Prevent duplicates if React strict mode double-fires
           if(prev.includes(fullLogs[currentLog])) return prev;
           return [...prev, fullLogs[currentLog]];
        });
        currentLog++;
      } else {
        clearInterval(interval);
      }
    }, 450); // 450ms per line for that hacker feel
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="matrix-terminal-loader">
      <div className="matrix-header">
        <span className="dot red"></span>
        <span className="dot yellow"></span>
        <span className="dot green"></span>
        <span className="title">GHOST_ENGINE_RUNTIME</span>
      </div>
      <div className="matrix-body font-mono">
        {logs.map((log, i) => (
          <div key={i} className="matrix-line">{log}</div>
        ))}
        <div className="matrix-line blink-cursor" style={{ marginTop: '5px' }}>_</div>
      </div>
    </div>
  );
}
`;

// Find where DynamicThinkingIndicator starts and ends
const startDynamic = content.indexOf('function DynamicThinkingIndicator() {');
const endDynamic = content.indexOf('export default function AiChatInterface() {');

if (startDynamic !== -1 && endDynamic !== -1) {
  // Replace the old component with the new one
  content = content.substring(0, startDynamic) + matrixComponent + '\n' + content.substring(endDynamic);
  
  // Now replace the usage
  content = content.replace('{isThinking && <DynamicThinkingIndicator />}', '{isThinking && <MatrixTerminalLoader />}');
  
  fs.writeFileSync(path, content, 'utf8');
  console.log("Replaced successfully!");
} else {
  console.log("Could not find the target component.");
}
