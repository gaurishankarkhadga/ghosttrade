import fs from 'fs';
const code = fs.readFileSync('backend/scannerEngine.js', 'utf8');

let fixedCode = code.replace(
`    allSentiments.push(...batchResults);
    if (i + SENTIMENT_BATCH_SIZE < tickers.length) { await sleep(2500); }
    }
  }`,
`    allSentiments.push(...batchResults);
    if (i + SENTIMENT_BATCH_SIZE < tickers.length) {
      await sleep(2500);
    }
  }`);

fs.writeFileSync('backend/scannerEngine.js', fixedCode);
