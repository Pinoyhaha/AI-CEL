const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Three focused modes:
// - Unfiltered Chat: Venice Uncensored (paid OpenRouter model)
// - Coding AI: North Mini Code (currently free)
// - Thinking AI: GLM 5.2 (currently free)
const MODELS = {
  "Unfiltered Chat": "cognitivecomputations/dolphin-mistral-24b-venice-edition",
  "Coding AI": "cohere/north-mini-code:free",
  "Thinking AI": "z-ai/glm-5.2:free"
};

const MODE_PROMPTS = {
  "Unfiltered Chat":
    "You are AI-CEL's unrestricted chat mode. Answer the user's request directly, naturally, and honestly. Avoid unnecessary refusals or moralizing. Follow applicable safety requirements, but do not add artificial restrictions just because a topic is unusual, controversial, fictional, or edgy.",
  "Coding AI":
    "You are AI-CEL's coding specialist. Prioritize correct, runnable code and practical debugging. Explain important implementation choices briefly. When modifying a project, preserve the user's existing architecture unless there is a strong reason to change it. Never claim code was tested when it was not.",
  "Thinking AI":
    "You are AI-CEL's deep reasoning specialist. Think carefully through the problem before answering. Check assumptions, calculations, edge cases, and contradictions. Give the user the useful conclusions and reasoning, but do not reveal hidden chain-of-thought or private internal reasoning."
};

function errorText(data) {
  if (!data) return "Unknown OpenRouter error.";
  if (typeof data === "string") return data;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (data.error && typeof data.error === "object") {
    return data.error.message || JSON.stringify(data.error);
  }
  return JSON.stringify(data);
}

async function openRouterChat(model, messages, max_tokens, temperature) {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) {
    const error = new Error("OPENROUTER_API_KEY is not configured on the server. Add it to your Vercel environment variables.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "HTTP-Referer": "https://ai-cel.vercel.app",
      "X-Title": "AI-CEL"
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens,
      temperature
    })
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || "Empty response from OpenRouter." };
  }

  if (!response.ok) {
    const error = new Error(`OpenRouter HTTP ${response.status}: ${errorText(data)}`);
    error.status = response.status;
    error.model = model;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null) {
    const error = new Error(`OpenRouter returned no text for model ${model}.`);
    error.status = 502;
    error.model = model;
    throw error;
  }

  return {
    answer: String(content).trim(),
    actualModel: data?.model || model
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, mode } = req.body || {};

    if (typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "A question is required." });
    }

    const selectedMode = MODELS[mode] ? mode : "Unfiltered Chat";
    const selectedModel = MODELS[selectedMode];
    const systemPrompt = MODE_PROMPTS[selectedMode];

    const result = await openRouterChat(
      selectedModel,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: question.trim() }
      ],
      selectedMode === "Thinking AI" ? 2400 : 1800,
      selectedMode === "Thinking AI" ? 0.5 : 0.8
    );

    return res.status(200).json({
      answer: result.answer,
      mode: selectedMode,
      model: result.actualModel,
      provider: "OpenRouter"
    });
  } catch (error) {
    console.error("AI-CEL API error:", error);

    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({
      error: error instanceof Error ? error.message : String(error),
      code: error?.code || "AI_CEL_ERROR",
      model: error?.model || null
    });
  }
}
