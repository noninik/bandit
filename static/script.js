const terminalEl = document.getElementById("terminal");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const agentsListEl = document.getElementById("agentsList");
const commandsListEl = document.getElementById("commandsList");

const STORAGE_KEY = "ai_army_v4_history";
const SESSION_KEY = "ai_army_v4_session";
const STATS_KEY = "ai_army_v4_stats";
const QUESTS_KEY = "ai_army_v4_quests";

let sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) { sessionId = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, sessionId); }

let currentAgent = "auto";
let agents = {};
let chatHistory = [];
let stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{"messages":0,"agents_used":[],"chains_run":0,"fullcycles":0}');
let quests = JSON.parse(localStorage.getItem(QUESTS_KEY) || '{}');
let startTime = Date.now();

setInterval(() => {
    const d = Math.floor((Date.now() - startTime) / 1000);
    const el = document.getElementById("uptime");
    if (el) el.textContent = String(Math.floor(d/60)).padStart(2,"0") + ":" + String(d%60).padStart(2,"0");
}, 1000);

inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

// ===== AGENTS =====
async function loadAgents() {
    try {
        const res = await fetch("/api/agents");
        agents = await res.json();
        agentsListEl.innerHTML = "";

        const autoDiv = document.createElement("div");
        autoDiv.className = "agent-item active";
        autoDiv.dataset.id = "auto";
        autoDiv.innerHTML = '<span class="agent-icon">🧠</span><span class="agent-name">Auto-Dispatch</span><span class="agent-dot"></span>';
        autoDiv.onclick = () => switchAgent("auto");
        agentsListEl.appendChild(autoDiv);

        for (const [id, agent] of Object.entries(agents)) {
            const div = document.createElement("div");
            div.className = "agent-item";
            div.dataset.id = id;
            div.innerHTML = '<span class="agent-icon">' + agent.icon + '</span><span class="agent-name">' + agent.name + '</span><span class="agent-dot"></span>';
            div.onclick = () => switchAgent(id);
            agentsListEl.appendChild(div);
        }
    } catch (e) { console.error(e); }
}

function switchAgent(id) {
    currentAgent = id;
    document.querySelectorAll(".agent-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
    if (id === "auto") {
        document.getElementById("promptAgent").textContent = "🧠";
        document.getElementById("autoRoute").checked = true;
    } else {
        document.getElementById("promptAgent").textContent = agents[id].icon;
        document.getElementById("autoRoute").checked = false;
    }
    addLog("switch", "→ " + (id === "auto" ? "🧠 Auto" : agents[id].icon + " " + agents[id].name));
    inputEl.focus();
}

// ===== COMMANDS =====
async function loadCommands() {
    try {
        const res = await fetch("/api/templates");
        const templates = await res.json();
        commandsListEl.innerHTML = "";
        templates.forEach(t => {
            const div = document.createElement("div");
            div.className = "command-item";
            div.innerHTML = '<span class="command-name">' + t.title + '</span><span class="command-desc">' + t.desc + '</span>';
            div.onclick = () => {
                if (t.title === "/fullcycle") {
                    document.getElementById("nicheInput").focus();
                } else {
                    inputEl.value = t.prompt;
                    inputEl.focus();
                }
            };
            commandsListEl.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

// ===== LOG =====
function addLog(type, text) {
    const div = document.createElement("div");
    div.className = "init-log";
    const icons = { success:'<span class="log-success">✓</span>', info:'<span class="log-info">ℹ</span>', warning:'<span class="log-warning">⚠</span>', error:'<span class="log-error">✗</span>', switch:'<span class="log-info">→</span>' };
    div.innerHTML = (icons[type]||icons.info) + " " + text;
    terminalEl.appendChild(div);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

// ===== PARSE =====
function parseResponse(text) {
    const stepMap = {
        "СКАНИРОВАНИЕ":"analysis","АНАЛИЗ":"analysis","АУДИТОРИЯ":"analysis","ANALYSIS":"analysis",
        "REDDIT":"research","YOUTUBE":"research","TWITTER":"research","TWITTER/X":"research",
        "TELEGRAM/ФОРУМЫ":"research","GOOGLE TRENDS":"research",
        "ИССЛЕДОВАНИЕ":"research","RESEARCH":"research","ДАННЫЕ":"research","КОНКУРЕНТЫ":"research",
        "ТРЕНДЫ":"research","БОЛИ":"research","КАРТА БОЛЕЙ":"research",
        "БИЗНЕС-ВОЗМОЖНОСТИ":"strategy",
        "СТРАТЕГИЯ":"strategy","STRATEGY":"strategy","КАНАЛЫ":"strategy","ПОЗИЦИОНИРОВАНИЕ":"strategy",
        "РЕШЕНИЕ":"strategy","МОДЕЛЬ":"strategy","ПРОДУКТ":"strategy","БИЗНЕС-МОДЕЛЬ":"strategy",
        "ПЛАН":"plan","PLAN":"plan","MVP":"plan","КОД":"plan","КОНТЕНТ-ПЛАН":"plan",
        "ДОРОЖНАЯ КАРТА":"plan","ВОРОНКА":"plan","ЗАПУСК":"plan","КОМПОНЕНТЫ":"plan",
        "СКРИПТ":"plan","ПЕРВЫЙ КОНТАКТ":"plan","ПРЕЗЕНТАЦИЯ":"plan",
        "MVP — 2 НЕДЕЛИ":"plan","МАРКЕТИНГ":"plan",
        "РЕЗУЛЬТАТ":"result","RESULT":"result","ВЫВОДЫ":"result","ВЫВОД":"result",
        "РЕКОМЕНДАЦИИ":"result","МЕТРИКИ":"result","UNIT-ЭКОНОМИКА":"result",
        "РИСКИ":"result","ЗАКРЫТИЕ":"result","FOLLOW-UP":"result",
        "ФИНАНСЫ":"result","КОМАНДА":"plan","РЫНОК":"research",
        "РЕЗЮМЕ":"analysis","ПРОБЛЕМА":"analysis",
        "АРХИТЕКТУРА":"analysis","API":"plan","ДЕПЛОЙ":"result","ТЕСТЫ":"plan","СРОКИ":"result",
        "КЛИЕНТ":"research","АВАТАР":"research","ВОЗРАЖЕНИЯ":"strategy",
        "ЛЕНДИНГ":"plan","КОНТЕНТ":"plan"
    };

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

    html = html.replace(/\[([А-ЯA-Z\s\-\/0-9]+)\]/g, (match, label) => {
        const t = label.trim();
        const cls = stepMap[t] || "default";
        return '<div class="step-label ' + cls + '">[' + t + ']</div>';
    });

    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.split('\n').map(l => { l = l.trim(); if (!l) return ''; if (l.startsWith('<')) return l; return '<p>'+l+'</p>'; }).join('\n');
    return html;
}

function getTime() {
    return new Date().toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

// ===== TERMINAL BLOCK =====
function addTerminalBlock(userText, responseHtml, agentInfo, timeStr, routeInfo) {
    const block = document.createElement("div");
    block.className = "term-block";
    const a = agentInfo || { icon:"🧠", name:"Agent", color:"#58a6ff" };

    let html = '<div class="term-input-line"><span class="term-prompt">'+a.icon+' ❯</span><span class="term-command">'+userText.replace(/</g,"&lt;")+'</span></div>';
    html += '<div class="term-status"><span class="agent-badge" style="background:'+a.color+'22;color:'+a.color+'">'+a.name+'</span><span>executed</span></div>';
    if (routeInfo) html += '<div class="route-info">🧠 '+routeInfo.reason+'</div>';
    html += '<div class="term-response">'+responseHtml+'</div>';
    html += '<div class="term-time">'+(timeStr||getTime())+'</div>';

    block.innerHTML = html;
    terminalEl.appendChild(block);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

function setStatus(s, t) {
    const dot = document.getElementById("statusDot");
    const txt = document.getElementById("statusText");
    dot.className = "status-dot" + (s !== "ready" ? " "+s : "");
    txt.textContent = t || "Ready";
}

function showThinking(label) {
    const div = document.createElement("div");
    div.className = "thinking"; div.id = "thinking";
    div.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div><span>'+(label||"Thinking...")+'</span>';
    terminalEl.appendChild(div);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

function updateThinking(label) {
    const el = document.getElementById("thinking");
    if (el) {
        const span = el.querySelector("span:last-child");
        if (span) span.textContent = label;
    }
}

function hideThinking() { const el = document.getElementById("thinking"); if (el) el.remove(); }

// ===== QUESTS =====
function completeQuest(id, name) {
    if (quests[id]) return;
    quests[id] = true;
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
    const el = document.getElementById(id);
    if (el) { el.textContent = "☑"; el.parentElement.classList.add("done"); }
    addLog("success", "🏆 Quest: " + name);
}

function loadQuests() {
    for (const [id, done] of Object.entries(quests)) {
        if (done) { const el = document.getElementById(id); if (el) { el.textContent = "☑"; el.parentElement.classList.add("done"); } }
    }
}

// ===== SEND =====
async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    inputEl.style.height = "auto";
    sendBtn.disabled = true;

    const isAuto = currentAgent === "auto" || document.getElementById("autoRoute").checked;
    setStatus("working", isAuto ? "Routing..." : "Processing...");
    showThinking(isAuto ? "🧠 Choosing best agent..." : (agents[currentAgent]?.icon||"")+" Working...");

    chatHistory.push({ role: "user", content: text });

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text, session_id: sessionId,
                agent: isAuto ? "strategist" : currentAgent,
                auto_route: isAuto, history: chatHistory.slice(-20)
            })
        });

        const data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            const ai = { icon: data.agent_icon, name: data.agent_name, color: data.agent_color };
            addTerminalBlock(text, parseResponse(data.response), ai, null, data.route_info);
            chatHistory.push({ role: "assistant", content: data.response });
            stats.messages++;
            if (!stats.agents_used.includes(data.agent)) stats.agents_used.push(data.agent);
            updateStats(); saveHistory();

            if (data.agent === "scanner") completeQuest("q1", "Просканировать соцсети");
            if (data.agent === "business_plan") completeQuest("q3", "Получить бизнес-план");
            if (stats.agents_used.length >= 3) completeQuest("q4", "Использовать 3+ агентов");
        }
    } catch (e) { hideThinking(); addLog("error", e.message); }

    setStatus("ready"); sendBtn.disabled = false; inputEl.focus();
}

// ===== FULL CYCLE =====
async function runFullCycle() {
    const nicheInput = document.getElementById("nicheInput");
    const niche = nicheInput.value.trim();
    if (!niche) { nicheInput.focus(); addLog("warning", "Введи нишу в поле слева"); return; }

    sendBtn.disabled = true;
    nicheInput.disabled = true;

    // Header
    const header = document.createElement("div");
    header.className = "fullcycle-header";
    header.innerHTML = '<h3>🚀 FULL CYCLE: ' + niche + '</h3><p>Автоматический анализ: соцсети → идеи → бизнес-план</p>' +
        '<div class="fullcycle-progress" id="fcProgress">' +
        '<span class="progress-step active" id="fc1">📡 Скан</span><span class="progress-arrow">→</span>' +
        '<span class="progress-step" id="fc2">💡 Идеи</span><span class="progress-arrow">→</span>' +
        '<span class="progress-step" id="fc3">📋 План</span></div>';
    terminalEl.appendChild(header);

    setStatus("fullcycle", "Full Cycle: " + niche);
    showThinking("📡 Scanning social media for: " + niche + "...");

    try {
        const res = await fetch("/api/fullcycle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ niche: niche, project: "default" })
        });

        const data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            data.results.forEach((r, i) => {
                // Update progress
                const steps = ["fc1","fc2","fc3"];
                if (steps[i]) {
                    document.getElementById(steps[i])?.classList.add("done");
                    document.getElementById(steps[i])?.classList.remove("active");
                    if (steps[i+1]) document.getElementById(steps[i+1])?.classList.add("active");
                }

                if (i > 0) {
                    const sep = document.createElement("div");
                    sep.className = "chain-separator";
                    sep.textContent = "▼ " + r.agent_icon + " " + r.agent_name;
                    terminalEl.appendChild(sep);
                }

                const ai = { icon: r.agent_icon, name: r.agent_name, color: r.agent_color };
                addTerminalBlock(
                    i === 0 ? "Сканирую соцсети: " + niche : "Продолжаю анализ: " + niche,
                    parseResponse(r.response), ai
                );

                if (!stats.agents_used.includes(r.agent)) stats.agents_used.push(r.agent);
            });

            stats.messages += data.results.length;
            stats.fullcycles = (stats.fullcycles || 0) + 1;
            updateStats(); saveHistory();

            completeQuest("q1", "Просканировать соцсети");
            completeQuest("q2", "Запустить полный цикл");
            completeQuest("q3", "Получить бизнес-план");
            if (stats.agents_used.length >= 3) completeQuest("q4", "3+ агентов");

            addLog("success", "🚀 Full cycle complete for: " + niche);
        }
    } catch (e) { hideThinking(); addLog("error", e.message); }

    setStatus("ready"); sendBtn.disabled = false; nicheInput.disabled = false; inputEl.focus();
}

// ===== CHAIN =====
async function runChain(chainAgents, chainName) {
    const text = inputEl.value.trim();
    if (!text) { addLog("warning", "Сначала введи задачу в поле ввода"); inputEl.focus(); return; }

    inputEl.value = "";
    sendBtn.disabled = true;

    addLog("info", "🔗 Chain: " + chainName);
    setStatus("chain", "Chain running...");
    showThinking("🔗 Executing chain...");

    try {
        const res = await fetch("/api/chain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, chain: chainAgents, project: "default" })
        });

        const data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            data.results.forEach((r, i) => {
                if (i > 0) {
                    const sep = document.createElement("div");
                    sep.className = "chain-separator";
                    sep.textContent = "▼ " + r.agent_icon + " " + r.agent_name;
                    terminalEl.appendChild(sep);
                }
                const ai = { icon: r.agent_icon, name: r.agent_name, color: r.agent_color };
                addTerminalBlock(i === 0 ? text : "← from previous agent", parseResponse(r.response), ai);
                if (!stats.agents_used.includes(r.agent)) stats.agents_used.push(r.agent);
            });

            stats.messages += data.results.length;
            stats.chains_run = (stats.chains_run || 0) + 1;
            updateStats(); saveHistory();
            if (stats.agents_used.length >= 3) completeQuest("q4", "3+ агентов");
            addLog("success", "🔗 Chain done: " + data.results.length + " agents");
        }
    } catch (e) { hideThinking(); addLog("error", e.message); }

    setStatus("ready"); sendBtn.disabled = false; inputEl.focus();
}

// ===== STATS =====
function updateStats() {
    const mc = document.getElementById("msgCount");
    const au = document.getElementById("agentsUsed");
    const cr = document.getElementById("chainsRun");
    if (mc) mc.textContent = stats.messages;
    if (au) au.textContent = stats.agents_used.length;
    if (cr) cr.textContent = (stats.chains_run||0) + (stats.fullcycles||0);
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ===== SAVE/LOAD =====
function saveHistory() {
    const blocks = [];
    document.querySelectorAll(".term-block, .fullcycle-header, .chain-separator").forEach(el => blocks.push(el.outerHTML));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

function loadHistory() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const blocks = JSON.parse(saved);
    if (!blocks.length) return;
    blocks.forEach(html => { const div = document.createElement("div"); div.innerHTML = html; if (div.firstChild) terminalEl.appendChild(div.firstChild); });
    addLog("success", "History restored (" + blocks.length + " items)");
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

// ===== RESET =====
async function resetChat() {
    try { await fetch("/api/reset", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({session_id:sessionId,project:"default"}) }); } catch(e){}
    sessionId = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, sessionId);
    chatHistory = []; localStorage.removeItem(STORAGE_KEY);
    terminalEl.innerHTML = '';
    const w = document.createElement("div"); w.className = "terminal-welcome";
    w.innerHTML = '<pre class="ascii-art">\n    ╔══════════════════════════════════════════════════╗\n    ║        AI  AGENT  ARMY  v4.0                    ║\n    ║        Social Scanner + Auto Business Plans     ║\n    ╚══════════════════════════════════════════════════╝</pre>';
    terminalEl.appendChild(w);
    addLog("success", "System reset");
}

// ===== EXPORT =====
function exportChat() {
    const lines = [];
    document.querySelectorAll(".term-block").forEach(block => {
        const cmd = block.querySelector(".term-command")?.innerText || "";
        const badge = block.querySelector(".agent-badge")?.innerText || "";
        const resp = block.querySelector(".term-response")?.innerText || "";
        const time = block.querySelector(".term-time")?.textContent || "";
        lines.push("["+time+"] ["+badge+"] > "+cmd+"\n\n"+resp+"\n\n---\n");
    });
    if (!lines.length) { addLog("warning","Nothing to export"); return; }
    completeQuest("q5","Экспортировать результат");
    const text = "=== AI Agent Army v4.0 — Export ===\n" + new Date().toLocaleString() + "\n\n" + lines.join("\n");
    const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "agent_army_"+new Date().toISOString().slice(0,10)+".txt"; a.click();
    addLog("success","Exported "+lines.length+" entries");
}

function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }
function handleKeyDown(e) { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendMessage(); } }

// ===== INIT =====
loadAgents(); loadCommands(); loadHistory(); updateStats(); loadQuests();
