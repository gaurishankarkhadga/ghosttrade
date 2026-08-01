import fs from 'fs';

const TRADE_CARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    narrative: {
      type: "STRING",
      description: "The full analytical narrative (Modules 1-13) formatted in Markdown."
    },
    prediction: {
      type: "OBJECT",
      properties: {
        direction: { type: "STRING", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
        confidence: { type: "INTEGER" },
        primaryTarget: { type: "NUMBER" },
        extendedTarget: { type: "NUMBER" },
        invalidationLevel: { type: "NUMBER" },
        downsideRisk: { type: "NUMBER" },
        currentPrice: { type: "NUMBER" },
        timeframe: { type: "STRING", enum: ["INTRADAY", "SWING", "POSITION"] }
      },
      required: ["direction", "confidence", "primaryTarget", "invalidationLevel", "currentPrice", "timeframe"]
    }
  },
  required: ["narrative", "prediction"]
};
console.log("Schema defined");
