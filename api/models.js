const HF_MODELS_URL = "https://router.huggingface.co/v1/models";

const MODELS = {
  "DAN-L3-R1-8B": "UnfilteredAI/DAN-L3-R1-8B",
  "DAN-Qwen3-1.7B": "UnfilteredAI/DAN-Qwen3-1.7B",
  "UNfilteredAI-1B": "UnfilteredAI/UNfilteredAI-1B"
};

function errorText(data) {
  if (!data) return "Unknown Hugging Face error.";
  if (typeof data === "string") return data;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  return JSON.stringify(data);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "HF_TOKEN is not configured on the server." });
  }

  try {
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
      return res.status(response.status).json({
        error: `Hugging Face HTTP ${response.status}: ${errorText(data)}`
      });
    }

    const availableIds = new Set(
      Array.isArray(data?.data)
        ? data.data.map((item) => item?.id).filter(Boolean)
        : []
    );

    const models = Object.fromEntries(
      Object.entries(MODELS).map(([name, id]) => [name, {
        id,
        available: availableIds.has(id)
      }])
    );

    return res.status(200).json({ models });
  } catch (error) {
    console.error("AI-CEL model availability error:", error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
