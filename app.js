const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");

const MODEL_OPTIONS = [
  ["Venice Uncensored", "Venice Uncensored 🆓"],
  ["DAN-L3-R1-8B", "DAN-L3-R1-8B (HF unavailable)"],
  ["DAN-Qwen3-1.7B", "DAN-Qwen3-1.7B (HF unavailable)"],
  ["UNfilteredAI-1B", "UNfilteredAI-1B (HF unavailable)"]
];

const select = document.createElement("select");
select.id = "model";
select.title = "Chat model";
for (const [value, label] of MODEL_OPTIONS) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}
form.insertBefore(select, prompt);

function addMessage(role, text, extraClass = "") {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = `bubble ${extraClass}`;
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

async function loadModelAvailability() {
  try {
    const response = await fetch("/api/models", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    // The OpenRouter model is known from the server configuration.
    const venice = select.querySelector('option[value="Venice Uncensored"]');
    if (venice) {
      venice.disabled = false;
      venice.textContent = "Venice Uncensored 🆓";
    }

    // Keep the original HF choices visible, but mark them unavailable
    // when the user's enabled HF providers do not serve them.
    for (const option of select.options) {
      if (option.value === "Venice Uncensored") continue;
      const info = data.models?.[option.value];
      if (!info) continue;
      option.disabled = !info.available;
      option.textContent = info.available
        ? option.value
        : `${option.value} (HF unavailable)`;
    }

    select.value = "Venice Uncensored";
  } catch (error) {
    console.warn("Model availability check failed:", error);
    select.value = "Venice Uncensored";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = prompt.value.trim();
  if (!question || send.disabled) return;

  const selectedOption = select.selectedOptions[0];
  if (selectedOption?.disabled) {
    addMessage("assistant", `⚠️ ${select.value} is currently unavailable. Please choose Venice Uncensored.`);
    return;
  }

  addMessage("user", question);
  prompt.value = "";
  send.disabled = true;
  const thinking = addMessage("assistant", "Thinking…", "typing");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, model: select.value })
    });
    const data = await response.json().catch(() => ({}));
    thinking.remove();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    addMessage("assistant", data.answer || "The model returned an empty answer.");
  } catch (error) {
    thinking.remove();
    addMessage("assistant", `⚠️ ${error.message || "Something went wrong."}`);
  } finally {
    send.disabled = false;
    prompt.focus();
  }
});

prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

loadModelAvailability();
