const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const templatesEl = document.getElementById("templates");
const welcomeEl = document.getElementById("welcome");

const STORAGE_KEY = "ai_agent_history";
const SESSION_KEY = "ai_agent_session";
const STATS_KEY = "ai_agent_stats";

// Сессия
let sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
}

// Статистика
let stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{"messages":0,"sessions":1}');
updateStats();

// История для отправки на сервер
let chatHistory = [];

// Автоматическая высота textarea
inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + "px";
});

// ===== СОХРАНЕНИЕ И ЗАГРУЗКА ИСТОРИИ =====

function saveHistory() {
    const messages = [];
    document.querySelectorAll(".message").forEach(msg => {
        const role = msg.classList.contains("user") ? "user" : "assistant";
        const content = msg.querySelector(".message-content").innerText;
        const time = msg.querySelector(".message-time")?.innerText || "";
        messages.push({ role, content, time });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

function loadHistory() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const messages = JSON.parse(saved);
    if (messages.length === 0) return;

    // Убираем welcome
    if (welcomeEl) welcomeEl.style.display = "none";

    // Восстанавливаем сообщения
    messages.forEach(msg => {
        addMessage(msg.role, msg.content, msg.time, false);
        chatHistory.push({ role: msg.role, content: msg.content });
    });

    // Показываем уведомление
    const notice = document.getElementById("restoredNotice");
    if (notice) {
        notice.style.display = "flex";
        setTimeout(() => { notice.style.display = "none"; }, 3000);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== СТАТИСТИКА =====

function updateStats() {
    const msgCountEl = document.getElementById("msgCount");
    const sessionCountEl = document.getElementById("sessionCount");
    if (msgCountEl) msgCountEl.textContent = stats.messages;
    if (sessionCountEl) sessionCountEl.textContent = stats.sessions;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ===== ШАБЛОНЫ =====

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
        console.error("Шаблоны не загрузились:", e);
    }
}

// ===== MARKDOWN =====

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

    html = html.split('\n').map(line => {
        line = line.trim();
        if (!line) return '';
        if (line.startsWith('<')) return line;
        return '<p>' + line + '</p>';
    }).join('\n');

    return html;
}

// ===== СООБЩЕНИЯ =====

function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function addMessage(role, content, timeStr, save = true) {
    // Убираем welcome при первом сообщении
    if (welcomeEl && welcomeEl.style.display !== "none") {
        welcomeEl.style.display = "none";
    }

    const div = document.createElement("div");
    div.className = "message " + role;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "Вы" : "AI Агент";

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    if (role === "assistant") {
        contentDiv.innerHTML = parseMarkdown(content);
    } else {
        contentDiv.innerHTML = "<p>" + content.replace(/\n/g, "<br>") + "</p>";
    }

    const timeDiv = document.createElement("div");
    timeDiv.className = "message-time";
    timeDiv.textContent = timeStr || getTimeString();

    div.appendChild(label);
    div.appendChild(contentDiv);
    div.appendChild(timeDiv);

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (save) {
        stats.messages++;
        updateStats();
        saveHistory();
    }

    return div;
}

function showTyping() {
    const div = document.createElement("div");
    div.className = "message assistant";
    div.id = "typing";
    div.innerHTML = '<div class="message-label">AI Агент</div><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
    const el = document.getElementById("typing");
    if (el) el.remove();
}

// ===== ОТПРАВКА =====

async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage("user", text);
    chatHistory.push({ role: "user", content: text });

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
                session_id: sessionId,
                history: chatHistory.slice(-20)
            })
        });

        const data = await res.json();
        hideTyping();

        if (data.error) {
            addMessage("assistant", "❌ Ошибка: " + data.error);
        } else {
            addMessage("assistant", data.response);
            chatHistory.push({ role: "assistant", content: data.response });
        }
    } catch (e) {
        hideTyping();
        addMessage("assistant", "❌ Ошибка соединения: " + e.message);
    }

    sendBtn.disabled = false;
    inputEl.focus();
}

// ===== БЫСТРЫЙ ПРОМПТ =====

function quickPrompt(text) {
    inputEl.value = text;
    sendMessage();
}

// ===== СБРОС =====

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

    // Новая сессия
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    chatHistory = [];
    localStorage.removeItem(STORAGE_KEY);

    stats.sessions++;
    updateStats();

    // Очищаем экран
    messagesEl.innerHTML = "";

    // Возвращаем welcome
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.id = "welcome";
    welcome.innerHTML = '<div class="welcome-icon">🤖</div><h2>Новый диалог начат!</h2><p>Опиши задачу или выбери шаблон слева</p>';
    messagesEl.appendChild(welcome);
}

// ===== ЭКСПОРТ ЧАТА =====

function exportChat() {
    const messages = [];
    document.querySelectorAll(".message").forEach(msg => {
        const role = msg.classList.contains("user") ? "Вы" : "AI Агент";
        const content = msg.querySelector(".message-content").innerText;
        const time = msg.querySelector(".message-time")?.innerText || "";
        messages.push("[" + time + "] " + role + ":\n" + content + "\n");
    });

    if (messages.length === 0) {
        alert("Чат пуст — нечего сохранять");
        return;
    }

    const text = "=== AI Бизнес-Агент — История чата ===\n\n" + messages.join("\n---\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat_" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    URL.revokeObjectURL(url);
}

// ===== МОБИЛЬНОЕ МЕНЮ =====

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
}

// ===== КЛАВИШИ =====

function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// ===== СТАРТ =====

loadTemplates();
loadHistory();
