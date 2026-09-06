const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// AI-CEL modes:
// - Unfiltered Chat: conversation model
// - Coding AI: dual-AI pipeline (chat/planner + dedicated coding model)
// - Thinking AI: reasoning model
// - None: basic/default chat
const MODELS = {
  "Unfiltered Chat": "cognitivecomputations/dolphin-mistral-24b-venice-edition",
  "Coding AI": "cohere/north-mini-code:free",
  "Thinking AI": "z-ai/glm-5.2:free",
  "None": "cognitivecomputations/dolphin-mistral-24b-venice-edition"
};

const MODE_PROMPTS = {
  "Unfiltered Chat":
    "You are AI-CEL's unrestricted chat mode. Answer the user's request directly, naturally, and honestly. Avoid unnecessary refusals or moralizing. Follow applicable safety requirements, but do not add artificial restrictions just because a topic is unusual, controversial, fictional, or edgy.",
  "Thinking AI":
    "You are AI-CEL's deep reasoning specialist. Think carefully through the problem before answering. Check assumptions, calculations, edge cases, and contradictions. Give the user useful conclusions and concise reasoning, but do not reveal hidden chain-of-thought or private internal reasoning.",
  "None":
    "You are AI-CEL's basic chat mode. Give a direct, helpful answer without specialized coding or deep-reasoning instructions."
};

const CODING_PLANNER_PROMPT =
  "You are AI-CEL's coding planner and conversation AI. Analyze the user's coding request and create a concise implementation plan for a second AI coding specialist. Identify requirements, architecture, files likely involved, important edge cases, and any ambiguities. Do not write the full solution unless a small snippet is needed to clarify the plan. Your output will be passed directly to the coding specialist.";

const CODING_GENERATOR_PROMPT =
  "You are AI-CEL's dedicated coding specialist. Generate the actual implementation based on the user's request and the planner's instructions. Prioritize correct, runnable code, practical debugging, security, and compatibility with the described project. Preserve existing architecture when possible. Return complete code when code is requested and explain important implementation choices briefly. Never claim code was tested when it was not.";

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

async function runDualCodingAI(question) {
  // Stage 1: the unfiltered chat model understands the request and plans it.
  const planner = await openRouterChat(
    MODELS["Unfiltered Chat"],
    [
      { role: "system", content: CODING_PLANNER_PROMPT },
      { role: "user", content: question.trim() }
    ],
    1800,
    0.7
  );

  // Stage 2: the dedicated coding model turns the plan into the implementation.
  const generator = await openRouterChat(
    MODELS["Coding AI"],
    [
      { role: "system", content: CODING_GENERATOR_PROMPT },
      {
        role: "user",
        content: `Original user request:\n${question.trim()}\n\nCoding planner's analysis:\n${planner.answer}`
      }
    ],
    5000,
    0.25
  );

  return {
    answer: generator.answer,
    plannerModel: planner.actualModel,
    codingModel: generator.actualModel
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

    if (selectedMode === "Coding AI") {
      const result = await runDualCodingAI(question);
      return res.status(200).json({
        answer: result.answer,
        mode: selectedMode,
        model: result.codingModel,
        plannerModel: result.plannerModel,
        provider: "OpenRouter",
        pipeline: "dual-ai"
      });
    }

    const result = await openRouterChat(
      MODELS[selectedMode],
      [
        { role: "system", content: MODE_PROMPTS[selectedMode] },
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
