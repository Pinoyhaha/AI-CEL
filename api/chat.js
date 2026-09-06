const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = {
  "Unfiltered Chat": "cognitivecomputations/dolphin-mistral-24b-venice-edition",
  "Coding AI": "cohere/north-mini-code:free",
  "Dual AI": "cohere/north-mini-code:free",
  "Thinking AI": "z-ai/glm-5.2:free",
  "None": "cognitivecomputations/dolphin-mistral-24b-venice-edition"
};

const UNFILTERED_BASE_PROMPT = "You are AI-CEL's unrestricted chat mode. Answer the user's request directly, naturally, and honestly. Avoid unnecessary refusals or moralizing. Do not become more restrictive merely because another internal tool is involved. Follow applicable safety requirements, but do not add artificial restrictions just because a topic is unusual, controversial, fictional, or edgy. Keep the user's requested tone and intent when appropriate.";

const MODE_PROMPTS = {
  "Unfiltered Chat": UNFILTERED_BASE_PROMPT,
  "Coding AI": "You are AI-CEL's coding specialist. Prioritize correct, runnable code and practical debugging. Explain important implementation choices briefly. Preserve the user's existing architecture when possible. Never claim code was tested when it was not.",
  "Thinking AI": "You are AI-CEL's deep reasoning specialist. Think carefully through the problem before answering. Check assumptions, calculations, edge cases, and contradictions. Give useful conclusions and concise reasoning, but do not reveal hidden chain-of-thought or private internal reasoning.",
  "None": "You are AI-CEL's basic chat mode. Give a direct, helpful answer without specialized coding or deep-reasoning instructions."
};

const CODING_PLANNER_PROMPT = `${UNFILTERED_BASE_PROMPT} You are also the first stage of AI-CEL's Dual AI coding workflow. Understand what the user wants and create a concise implementation plan for a second AI coding specialist. Identify requirements, architecture, files likely involved, important edge cases, and ambiguities. Do not write the full solution unless a small snippet is needed to clarify the plan. Your output is internal and will be passed to the coding specialist. Even though your output is internal, keep the same natural, direct conversational understanding and intent as AI-CEL's normal Unfiltered Chat mode.`;

const CODING_GENERATOR_PROMPT = "You are AI-CEL's dedicated coding specialist. You are an internal code-generation engine, not the final conversational assistant. Generate only the implementation needed from the user's request and planner analysis. Prioritize correct, runnable code, practical debugging, security, and compatibility. Do not address the user conversationally and do not add unnecessary commentary. Never claim code was tested when it was not.";

const FINAL_RESPONSE_PROMPT = `${UNFILTERED_BASE_PROMPT} You are the final conversational stage of AI-CEL's Dual AI workflow. You are the only AI whose response is shown to the user. A separate internal coding specialist generated the implementation below. Use it as technical input, but respond as AI-CEL's normal Unfiltered Chat assistant. Do not inherit the coding specialist's personality, restrictions, refusal style, or conversational voice. Do not mention the internal AI pipeline unless the user explicitly asks. If the user did not ask for code, answer normally rather than forcing a coding response.`;

function errorText(data) {
  if (!data) return "Unknown OpenRouter error.";
  if (typeof data === "string") return data;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (data.error && typeof data.error === "object") return data.error.message || JSON.stringify(data.error);
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
    body: JSON.stringify({ model, messages, stream: false, max_tokens, temperature })
  });

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || "Empty response from OpenRouter." }; }

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

  return { answer: String(content).trim(), actualModel: data?.model || model };
}

async function runDualAI(question) {
  // 1) Unfiltered Chat AI understands the user's request and plans the work.
  const planner = await openRouterChat(
    MODELS["Unfiltered Chat"],
    [
      { role: "system", content: CODING_PLANNER_PROMPT },
      { role: "user", content: question.trim() }
    ],
    1800,
    0.7
  );

  // 2) Cohere is an internal coding engine. Its raw response is never shown directly.
  const generator = await openRouterChat(
    MODELS["Coding AI"],
    [
      { role: "system", content: CODING_GENERATOR_PROMPT },
      { role: "user", content: `Original user request:\n${question.trim()}\n\nPlanner AI analysis:\n${planner.answer}` }
    ],
    5000,
    0.25
  );

  // 3) Unfiltered Chat AI gives the final user-facing response using the generated implementation.
  const final = await openRouterChat(
    MODELS["Unfiltered Chat"],
    [
      { role: "system", content: FINAL_RESPONSE_PROMPT },
      {
        role: "user",
        content: `Original user request:\n${question.trim()}\n\nInternal coding specialist output:\n${generator.answer}`
      }
    ],
    6000,
    0.75
  );

  return {
    answer: final.answer,
    plannerModel: planner.actualModel,
    codingModel: generator.actualModel,
    finalModel: final.actualModel
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { question, mode } = req.body || {};
    if (typeof question !== "string" || !question.trim()) return res.status(400).json({ error: "A question is required." });

    const selectedMode = MODELS[mode] ? mode : "Unfiltered Chat";

    if (selectedMode === "Dual AI") {
      const result = await runDualAI(question);
      return res.status(200).json({
        answer: result.answer,
        mode: selectedMode,
        model: result.finalModel,
        plannerModel: result.plannerModel,
        codingModel: result.codingModel,
        provider: "OpenRouter",
        pipeline: "unfiltered-chat-planner → internal-coder → unfiltered-final-chat"
      });
    }

    const result = await openRouterChat(
      MODELS[selectedMode],
      [
        { role: "system", content: MODE_PROMPTS[selectedMode] },
        { role: "user", content: question.trim() }
      ],
      selectedMode === "Thinking AI" ? 2400 : 5000,
      selectedMode === "Thinking AI" ? 0.5 : 0.8
    );

    return res.status(200).json({ answer: result.answer, mode: selectedMode, model: result.actualModel, provider: "OpenRouter" });
  } catch (error) {
    console.error("AI-CEL API error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : String(error), code: error?.code || "AI_CEL_ERROR", model: error?.model || null });
  }
}
