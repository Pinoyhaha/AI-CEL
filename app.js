const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");

const MODE_OPTIONS = [
  ["Unfiltered Chat", "🔥 Unfiltered Chat"],
  ["Coding AI", "💻 Coding AI · Free"],
  ["Thinking AI", "🧠 Thinking AI · Free"]
];

const select = document.createElement("select");
select.id = "model";
select.title = "AI mode";
for (const [value, label] of MODE_OPTIONS) {
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

  const mode = select.value;
  addMessage("user", question);
  prompt.value = "";
  send.disabled = true;
  const thinking = addMessage("assistant", getThinkingText(mode), "typing");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, mode })
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

function getThinkingText(mode) {
  if (mode === "Coding AI") return "💻 Writing / debugging…";
  if (mode === "Thinking AI") return "🧠 Thinking deeply…";
  return "🔥 Thinking…";
}

prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
