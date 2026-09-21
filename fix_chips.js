const fs = require('fs');
const path = './frontend/src/components/PromptInputBar.jsx';

let content = fs.readFileSync(path, 'utf8');

const newComponent = `
// Internal component for Bloomberg-style live flashing ticks
const LiveFlashingChip = ({ ticker, assetData, onSend, disabled, market, language, title, baseClass, chipIcon }) => {
  const [flashClass, setFlashClass] = useState('');
  const prevPriceRef = useRef(assetData?.currentPrice);
  const prevScoreRef = useRef(assetData?.score);

  useEffect(() => {
    const currentPrice = assetData?.currentPrice;
    const currentScore = assetData?.score;
    const prevPrice = prevPriceRef.current;
    const prevScore = prevScoreRef.current;

    let shouldFlash = false;
    let flashType = '';

    // Flash on price change
    if (currentPrice !== undefined && prevPrice !== undefined && currentPrice !== prevPrice) {
      shouldFlash = true;
      flashType = currentPrice > prevPrice ? 'flash-green' : 'flash-red';
    } 
    // Fallback: Flash on AI score change
    else if (currentScore !== undefined && prevScore !== undefined && currentScore !== prevScore) {
      shouldFlash = true;
      flashType = currentScore > prevScore ? 'flash-green' : 'flash-red';
    }

    if (shouldFlash) {
      setFlashClass(''); // reset to re-trigger animation
      setTimeout(() => setFlashClass(flashType), 10);
      const timer = setTimeout(() => setFlashClass(''), 800);
      
      prevPriceRef.current = currentPrice;
      prevScoreRef.current = currentScore;
      
      return () => clearTimeout(timer);
    }
    
    prevPriceRef.current = currentPrice;
    prevScoreRef.current = currentScore;
  }, [assetData?.currentPrice, assetData?.score]);

  return (
    <button 
      type="button"
      className={\`\${baseClass} \${flashClass}\`}
      onClick={() => onSend({ text: ticker, imageBase64: null, market, language })}
      disabled={disabled}
      title={title}
    >
      {chipIcon}{ticker} {assetData?.score !== undefined ? \`(\${assetData.score})\` : ''}
    </button>
  );
};
`;

// Insert the new component right before the default export
content = content.replace('export default function PromptInputBar', newComponent + '\nexport default function PromptInputBar');

// Replace the return inside the map
const oldReturn = `               return (
                 <button 
                   key={ticker}
                   type="button"
                   className={chipClass} 
                   onClick={() => onSend({ text: ticker, imageBase64: null, market, language })}
                   disabled={disabled}
                   title={title}
                 >
                   {chipIcon}{ticker} {assetData?.score !== undefined ? \`(\${assetData.score})\` : ''}
                 </button>
               );`;

const newReturn = `               return (
                 <LiveFlashingChip 
                   key={ticker}
                   ticker={ticker}
                   assetData={assetData}
                   onSend={onSend}
                   disabled={disabled}
                   market={market}
                   language={language}
                   title={title}
                   baseClass={chipClass}
                   chipIcon={chipIcon}
                 />
               );`;

content = content.replace(oldReturn, newReturn);

fs.writeFileSync(path, content, 'utf8');
console.log("Chips upgraded!");
