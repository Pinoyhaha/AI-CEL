const HF_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODELS_URL = "https://router.huggingface.co/v1/models";
const THINKING_MODEL = "Qwen/Qwen3-4B-Thinking-2507";
const MODELS = {
  "DAN-L3-R1-8B": "UnfilteredAI/DAN-L3-R1-8B",
  "DAN-Qwen3-1.7B": "UnfilteredAI/DAN-Qwen3-1.7B",
  "UNfilteredAI-1B": "UnfilteredAI/UNfilteredAI-1B"
};

let modelCache = { expires: 0, ids: new Set() };

function errorText(data) {
  if (!data) return "Unknown Hugging Face error.";
  if (typeof data === "string") return data;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (data.error && typeof data.error === "object") {
    return data.error.message || JSON.stringify(data.error);
  }
  return JSON.stringify(data);
}

async function getAvailableModelIds(token) {
  const now = Date.now();
  if (modelCache.expires > now && modelCache.ids.size) return modelCache.ids;

  const response = await fetch(HF_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || "Empty response from Hugging Face." };
  }

  if (!response.ok) {
    const error = new Error(`Hugging Face HTTP ${response.status}: ${errorText(data)}`);
    error.status = response.status;
    throw error;
  }

  const ids = new Set(
    Array.isArray(data?.data)
      ? data.data.map((item) => item?.id).filter(Boolean)
      : []
  );

  modelCache = { expires: now + 30000, ids };
  return ids;
}

async function ensureModelAvailable(model, token) {
  const ids = await getAvailableModelIds(token);
  if (!ids.has(model)) {
    const error = new Error(
      `The requested model '${model}' is not supported by any provider you have enabled. ` +
      `Choose an available model from the model selector, or deploy this model through a Hugging Face Inference Endpoint.`
    );
    error.status = 503;
    error.code = "MODEL_UNAVAILABLE";
    error.model = model;
    throw error;
  }
}

async function hfChat(model, messages, max_tokens, temperature) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    const error = new Error("HF_TOKEN is not configured on the server.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(HF_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
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
    data = { error: raw || "Empty response from Hugging Face." };
  }

  if (!response.ok) {
    const error = new Error(`Hugging Face HTTP ${response.status}: ${errorText(data)}`);
    error.status = response.status;
    error.model = model;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null) {
    const error = new Error(`Hugging Face returned no text for model ${model}.`);
    error.status = 502;
    throw error;
  }

  return String(content).trim();
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
  return hfChat(model, [
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

    const token = process.env.HF_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "HF_TOKEN is not configured on the server." });
    }

    const selectedName = MODELS[model] ? model : "DAN-L3-R1-8B";
    const selectedModel = MODELS[selectedName];

    // Check both models before starting an expensive two-pass request.
    await ensureModelAvailable(THINKING_MODEL, token);
    await ensureModelAvailable(selectedModel, token);

    const reasoning = await thinkingPass(question.trim());
    const answer = await finalPass(
      selectedModel,
      question.trim(),
      reasoning
    );

    return res.status(200).json({ answer, model: selectedName });
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
