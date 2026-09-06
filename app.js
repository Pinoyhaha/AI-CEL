const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");
const menuToggle = document.getElementById("menu-toggle");
const modelMenu = document.getElementById("model-menu");
const modeSubtitle = document.getElementById("mode-subtitle");
const modeOptions = document.querySelectorAll(".mode-option");

let selectedMode = localStorage.getItem("ai-cel-mode") || "Unfiltered Chat";
const labels = {
  "Unfiltered Chat": "🔥 Unfiltered Chat",
  "Coding AI": "💻 Coding AI",
  "Thinking AI": "🧠 Thinking AI",
  "None": "⚪ Normal Chat"
};

function setMode(mode) {
  selectedMode = mode;
  localStorage.setItem("ai-cel-mode", mode);
  modeSubtitle.textContent = labels[mode] || mode;

  modeOptions.forEach((option) => {
    option.classList.toggle("active", option.dataset.mode === mode);
  });

  closeMenu();
}

function openMenu() {
  modelMenu.classList.add("open");
  modelMenu.setAttribute("aria-hidden", "false");
  menuToggle.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  modelMenu.classList.remove("open");
  modelMenu.setAttribute("aria-hidden", "true");
  menuToggle.setAttribute("aria-expanded", "false");
}

menuToggle.addEventListener("click", () => {
  if (modelMenu.classList.contains("open")) closeMenu();
  else openMenu();
});

modeOptions.forEach((option) => {
  option.addEventListener("click", () => setMode(option.dataset.mode));
});

document.addEventListener("click", (event) => {
  if (!modelMenu.contains(event.target) && !menuToggle.contains(event.target)) {
    closeMenu();
  }
});

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
  const thinking = addMessage("assistant", getThinkingText(selectedMode), "typing");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, mode: selectedMode })
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
  if (mode === "None") return "💬 Generating…";
  return "🔥 Thinking…";
}

prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

setMode(selectedMode);
