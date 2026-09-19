const fs = require('fs');
let code = fs.readFileSync('backend/geminiEngine.js', 'utf8');

const targetStr = `            winRate: signal?.scoreBreakdown?.winRate || 50,
            ofiData: { buyerPercent: dynamicBuyerPercent, sellerPercent: 100 - dynamicBuyerPercent, netDelta: dynamicBuyerPercent - 50, cumulativeDelta: p3Context.tf15m ? p3Context.tf15m.slice(-50).map(c=>c.close) : [] },
              signalFactors: signal?.scoreBreakdown,
              riskRewardRatio: 2.0
            }
          }));
        } else {
          const notice = \`\\n RISK CONTROL: \${riskBlockReason}\\n\`;
          clientWs.send(JSON.stringify({ status: 'update', text: notice }));
          fullText += notice;
        }`;

const replacementStr = `            winRate: signal?.scoreBreakdown?.winRate || 50,
            ofiData: { buyerPercent: dynamicBuyerPercent, sellerPercent: 100 - dynamicBuyerPercent, netDelta: dynamicBuyerPercent - 50, cumulativeDelta: p3Context.tf15m ? p3Context.tf15m.slice(-50).map(c=>c.close) : [] },
              signalFactors: signal?.scoreBreakdown,
              riskRewardRatio: 2.0
            }
          }));
        }`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('backend/geminiEngine.js', code);
