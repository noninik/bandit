const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const templatesEl = document.getElementById("templates");

const sessionId = crypto.randomUUID();

inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + "px";
});

async function loadTemplates() {
    try {
        const res = await fetch("/api/templates");
        const templates = await res.json();
        templates.forEach(t => {
            const btn = document.createElement("button");
            btn.className = "template-btn";
            btn.textContent = t.title;
            btn.onclick = () => {
                inputEl.value = t.prompt;
                inputEl.focus();
                inputEl.style.height = "auto";
                inputEl.style.height = inputEl.scrollHeight + "px";
            };
            templatesEl.appendChild(btn);
        });
    } catch (e) {
        console.error("Не удалось загрузить шаблоны:", e);
    }
}

function parseMarkdown(text) {
    let html = text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    html = html
        .split('\n')
        .map(line => {
            line = line.trim();
            if (!line) return '';
            if (line.startsWith('<')) return line;
            return '<p>' + line + '</p>';
        })
        .join('\n');

    return html;
}

function addMessage(role, content) {
    const div = document.createElement("div");
    div.className = "message " + role;

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    if (role === "assistant") {
        contentDiv.innerHTML = parseMarkdown(content);
    } else {
        contentDiv.innerHTML = "<p>" + content.replace(/\n/g, '<br>') + "</p>";
    }

    div.appendChild(contentDiv);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
}

function showTyping() {
    const div = document.createElement("div");
    div.className = "message assistant";
    div.id = "typing";
    div.innerHTML = '<div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
    const el = document.getElementById("typing");
    if (el) el.remove();
}

async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage("user", text);
    inputEl.value = "";
    inputEl.style.height = "auto";

    sendBtn.disabled = true;
    showTyping();

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                session_id: sessionId
            })
        });

        const data = await res.json();
        hideTyping();

        if (data.error) {
            addMessage("assistant", "❌ Ошибка: " + data.error);
        } else {
            addMessage("assistant", data.response);
        }
    } catch (e) {
        hideTyping();
        addMessage("assistant", "❌ Ошибка соединения: " + e.message);
    }

    sendBtn.disabled = false;
    inputEl.focus();
}

async function resetChat() {
    try {
        await fetch("/api/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (e) {
        console.error(e);
    }

    messagesEl.innerHTML = "";
    addMessage("assistant", "🔄 Диалог сброшен. Чем могу помочь?");
}

function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

loadTemplates();
