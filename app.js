const messages = document.getElementById("messages");
const form = document.getElementById("chat-form");
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");
const menuToggle = document.getElementById("menu-toggle");
const modelMenu = document.getElementById("model-menu");
const modeSubtitle = document.getElementById("mode-subtitle");
const modeOptions = document.querySelectorAll(".mode-option");
const attach = document.getElementById("attach");
const fileInput = document.getElementById("file-input");
const attachmentPreview = document.getElementById("attachment-preview");

let selectedMode = localStorage.getItem("ai-cel-mode") || "Unfiltered Chat";
let selectedFile = null;

const labels = {
  "Unfiltered Chat": "🔥 Chatbot",
  "Coding AI": "💻 Coding AI"
};

function setMode(mode) {
  selectedMode = mode === "Coding AI" ? "Coding AI" : "Unfiltered Chat";
  localStorage.setItem("ai-cel-mode", selectedMode);
  modeSubtitle.textContent = labels[selectedMode];
  modeOptions.forEach((option) => option.classList.toggle("active", option.dataset.mode === selectedMode));
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

modeOptions.forEach((option) => option.addEventListener("click", () => setMode(option.dataset.mode)));

document.addEventListener("click", (event) => {
  if (!modelMenu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
});

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(text) {
  const blocks = [];
  let source = String(text).replace(/```([\w+.-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = `@@CODE${blocks.length}@@`;
    const cleanCode = code.replace(/^\n|\n$/g, "");
    blocks.push({ lang: lang || "text", code: cleanCode });
    return id;
  });

  source = escapeHtml(source);
  source = source.replace(/`([^`\n]+)`/g, "<code class=\"inline-code\">$1</code>");
  source = source.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  source = source.replace(/\n/g, "<br>");

  blocks.forEach((block, index) => {
    const html = `<pre class="code-block"><code>${escapeHtml(block.code)}</code></pre><button class="download-code" type="button" data-code-index="${index}">⬇️ Create ${escapeHtml(block.lang)} file</button>`;
    source = source.replace(`@@CODE${index}@@`, html);
  });
  return { html: source, blocks };
}

function addMessage(role, text, extraClass = "") {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = `bubble ${extraClass}`;

  if (role === "assistant" && extraClass !== "typing") {
    const rendered = renderMarkdown(text);
    bubble.innerHTML = rendered.html;
    rendered.blocks.forEach((block, index) => {
      const button = bubble.querySelector(`[data-code-index="${index}"]`);
      if (button) button.addEventListener("click", () => downloadGeneratedFile(block.code, extensionFor(block.lang), `aicel-${index + 1}`));
    });
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

function extensionFor(lang) {
  const map = { js: "js", javascript: "js", ts: "ts", typescript: "ts", py: "py", python: "py", html: "html", css: "css", json: "json", xml: "xml", java: "java", kt: "kt", kotlin: "kt", c: "c", cpp: "cpp", h: "h", hpp: "hpp", cs: "cs", php: "php", sh: "sh", bash: "sh", sql: "sql", md: "md", markdown: "md", txt: "txt" };
  return map[String(lang).toLowerCase()] || "txt";
}

function downloadGeneratedFile(content, extension, baseName) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showAttachment(file) {
  selectedFile = file;
  attachmentPreview.hidden = false;
  attachmentPreview.textContent = `📎 ${file.name}`;
}

function clearAttachment() {
  selectedFile = null;
  fileInput.value = "";
  attachmentPreview.hidden = true;
  attachmentPreview.textContent = "";
}

attach.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) showAttachment(fileInput.files[0]);
});

async function readTextFile(file) {
  const maxBytes = 1024 * 1024;
  if (file.size > maxBytes) throw new Error("For now, attached text/code files must be 1 MB or smaller.");
  const text = await file.text();
  return `\n\n--- ATTACHED FILE: ${file.name} ---\n${text}\n--- END ATTACHED FILE ---`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const typedQuestion = prompt.value.trim();
  if ((!typedQuestion && !selectedFile) || send.disabled) return;

  let question = typedQuestion;
  let fileName = "";

  try {
    if (selectedFile) {
      fileName = selectedFile.name;
      const fileText = await readTextFile(selectedFile);
      question = `${typedQuestion || "Please inspect this file and help me with it."}${fileText}`;
    }
  } catch (error) {
    addMessage("assistant", `⚠️ ${error.message}`);
    return;
  }

  addMessage("user", fileName ? `${typedQuestion || "Please inspect this file."}\n📎 ${fileName}` : typedQuestion);
  prompt.value = "";
  clearAttachment();
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
  return mode === "Coding AI" ? "💻 Writing / debugging…" : "🔥 Thinking…";
}

prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

setMode(selectedMode);
