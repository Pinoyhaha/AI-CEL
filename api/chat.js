const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const THINKING_MODEL = "Qwen/Qwen3-4B-Thinking-2507";
const HF_MODELS = {
  "DAN-L3-R1-8B": "UnfilteredAI/DAN-L3-R1-8B",
  "DAN-Qwen3-1.7B": "UnfilteredAI/DAN-Qwen3-1.7B",
  "UNfilteredAI-1B": "UnfilteredAI/UNfilteredAI-1B"
};

// OpenRouter's current paid model uses the slug without :free.
const OPENROUTER_MODELS = {
  "Venice Uncensored": "cognitivecomputations/dolphin-mistral-24b-venice-edition"
};

function errorText(data) {
  if (!data) return "Unknown provider error.";
  if (typeof data === "string") return data;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (data.error && typeof data.error === "object") {
    return data.error.message || JSON.stringify(data.error);
  }
  return JSON.stringify(data);
}

async function providerChat(url, token, model, messages, max_tokens, temperature, provider) {
  if (!token) {
    const error = new Error(`${provider} API key is not configured on the server.`);
    error.status = 500;
    throw error;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  if (provider === "OpenRouter") {
    headers["HTTP-Referer"] = "https://ai-cel.vercel.app";
    headers["X-Title"] = "AI-CEL";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
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
    data = { error: raw || "Empty response from provider." };
  }

  if (!response.ok) {
    const error = new Error(`${provider} HTTP ${response.status}: ${errorText(data)}`);
    error.status = response.status;
    error.model = model;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null) {
    const error = new Error(`${provider} returned no text for model ${model}.`);
    error.status = 502;
    error.model = model;
    throw error;
  }

  return String(content).trim();
}

async function hfChat(model, messages, max_tokens, temperature) {
  return providerChat(
    HF_URL,
    process.env.HF_TOKEN,
    model,
    messages,
    max_tokens,
    temperature,
    "Hugging Face"
  );
}

async function openRouterChat(model, messages, max_tokens, temperature) {
  return providerChat(
    OPENROUTER_URL,
    process.env.OPENROUTER_API_KEY,
    model,
    messages,
    max_tokens,
    temperature,
    "OpenRouter"
  );
}

async function thinkingPass(question) {
  return hfChat(THINKING_MODEL, [
    {
      role: "system",
      content: "You are the reasoning/planning model in a two-model system. Analyze the user's request carefully. Return a concise reasoning summary containing important facts, assumptions, calculations, and a recommended approach for the final model. Do not expose private chain-of-thought; provide conclusions and useful reasoning summaries instead."
    },
    { role: "user", content: question }
  ], 900, 0.4);
}

async function finalPass(model, question, reasoning) {
  return openRouterChat(model, [
    {
      role: "system",
      content: "You are the final-answer model. Answer the user's original request directly and naturally. Use the planning summary as additional context, but independently check it and correct mistakes. Do not claim you performed actions you did not perform."
    },
    {
      role: "user",
      content: `Original user request:\n${question}\n\nPlanning summary from the reasoning model:\n${reasoning}\n\nWrite the final answer now.`
    }
  ], 1400, 0.85);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, model } = req.body || {};

    if (typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "A question is required." });
    }

    if (!process.env.HF_TOKEN) {
      return res.status(500).json({ error: "HF_TOKEN is not configured on the server." });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is not configured. Add it to your Vercel environment variables."
      });
    }

    const selectedName = OPENROUTER_MODELS[model]
      ? model
      : "Venice Uncensored";
    const selectedModel = OPENROUTER_MODELS[selectedName];

    const reasoning = await thinkingPass(question.trim());
    const answer = await finalPass(
      selectedModel,
      question.trim(),
      reasoning
    );

    return res.status(200).json({
      answer,
      model: selectedName,
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
