

/**
 * Streams a strict, highly accurate, elite institutional conversation directly to the user.
 * Bypasses the heavy GhostTrade asset analysis pipeline.
 */
export async function handleConversation(clientWs, prompt, language) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      clientWs.send(JSON.stringify({ status: 'update', text: "SYSTEM ERROR: GROQ_API_KEY missing for conversation engine.\n" }));
      clientWs.send(JSON.stringify({ status: 'end' }));
      return;
    }

    let translationDirective = "";
    if (language && language !== 'English') {
      translationDirective = `\n\nCRITICAL DIRECTIVE: You MUST translate your ENTIRE response into ${language}. Do not output English.`;
    }

    const systemPrompt = `You are Ghost, an elite quantitative institutional trader and market analyst.
Your mandate is to provide mathematically rigorous, highly accurate, and professional answers to trading, finance, and macroeconomic questions.

STRICT BOUNDARIES:
1. You DO NOT use AI disclaimers like "As an AI language model..." or "I cannot provide financial advice."
2. You speak with absolute confidence, backed by factual market mechanics.
3. If the user asks a question OUTSIDE of finance, trading, economics, or markets (e.g., "Write a poem", "How to bake a cake", "Tell me a joke"), you MUST coldly refuse with exactly: "I am an institutional trading engine. I only process financial markets and quantitative data."
4. Keep your answers concise, structured, and easy to read. Use bullet points where appropriate.
${translationDirective}`;

    const requestBody = {
      model: "qwen/qwen3.6-27b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      stream: true,
      temperature: 0.2, // Low temperature for high factual accuracy
      max_tokens: 1500
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    clientWs.send(JSON.stringify({ status: 'start' }));

    // Read the SSE stream
    for await (const chunk of response.body) {
      const chunkStr = chunk.toString();
      const lines = chunkStr.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              const textChunk = data.choices[0].delta.content;
              clientWs.send(JSON.stringify({ status: 'update', text: textChunk }));
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }

    clientWs.send(JSON.stringify({ status: 'end' }));
  } catch (err) {
    console.error('[CONVERSATION ENGINE] Error:', err.message);
    clientWs.send(JSON.stringify({ status: 'update', text: "\n_Connection to conversation module interrupted._\n" }));
    clientWs.send(JSON.stringify({ status: 'end' }));
  }
}
