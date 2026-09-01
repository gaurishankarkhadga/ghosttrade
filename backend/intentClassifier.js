

/**
 * Classifies the user prompt into one of four modes using Groq.
 * Modes: FULL_ANALYSIS, CLARIFICATION_NEEDED, DATA_BACKED_CONVERSATION, PURE_CONVERSATION
 */
export async function classifyIntentWithGroq(prompt) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return 'FULL_ANALYSIS'; // Fallback

    const systemPrompt = `You are an Intent Classifier for a quantitative trading AI.
Categorize the user's prompt into EXACTLY ONE of the following 4 categories (reply with ONLY the category name):

FULL_ANALYSIS: The user explicitly wants a deep scan, trade setup, or analysis of a specific asset (e.g., "Analyze BTC", "Should I buy Tesla?", "AAPL prediction").
CLARIFICATION_NEEDED: The user mentions an asset but there is a typo, ambiguity, or it's unclear what they want (e.g., "how is appl", "bitcon", "shoud i buy solna").
DATA_BACKED_CONVERSATION: The user is asking a conversational question about a specific asset that requires real-time data to answer accurately (e.g., "Why is BTC dumping?", "Is ETH bullish right now?", "What is the RSI on SOL?").
PURE_CONVERSATION: The user is asking a general trading, finance, or educational question with no specific asset mentioned, OR a non-trading question (e.g., "What is a moving average?", "How do I manage risk?", "Hello").

Reply ONLY with the category name string. No other text.`;

    const requestBody = {
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 300
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) return 'FULL_ANALYSIS';

    const data = await response.json();
    const intent = data.choices[0].message.content.trim().toUpperCase();

    if (['FULL_ANALYSIS', 'CLARIFICATION_NEEDED', 'DATA_BACKED_CONVERSATION', 'PURE_CONVERSATION'].includes(intent)) {
      return intent;
    }
    return 'FULL_ANALYSIS';
  } catch (e) {
    console.error("[INTENT CLASSIFIER] Groq failed:", e);
    return 'FULL_ANALYSIS';
  }
}
