const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");

const MODEL_OPTIONS = [
  ["DAN-L3-R1-8B", "DAN-L3-R1-8B"],
  ["DAN-Qwen3-1.7B", "DAN-Qwen3-1.7B"],
  ["UNfilteredAI-1B", "UNfilteredAI-1B"]
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = prompt.value.trim();
  if (!question || send.disabled) return;

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
