var terminalEl = document.getElementById("terminal");
var inputEl = document.getElementById("userInput");
var sendBtn = document.getElementById("sendBtn");
var agentsListEl = document.getElementById("agentsList");
var commandsListEl = document.getElementById("commandsList");
var plansListEl = document.getElementById("plansList");

var STORAGE_KEY = "ai_v5_history";
var SESSION_KEY = "ai_v5_session";
var STATS_KEY = "ai_v5_stats";
var QUESTS_KEY = "ai_v5_quests";

var sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
}

var currentAgent = "auto";
var agents = {};
var chatHistory = [];
var stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{"messages":0,"agents_used":[],"chains_run":0,"plans":0}');
var quests = JSON.parse(localStorage.getItem(QUESTS_KEY) || '{}');
var startTime = Date.now();

setInterval(function() {
    var d = Math.floor((Date.now() - startTime) / 1000);
    var el = document.getElementById("uptime");
    if (el) el.textContent = String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0");
}, 1000);

inputEl.addEventListener("input", function() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
});


function showPanel(mode) {
    var plans = document.getElementById("plansPanel");
    var term = document.getElementById("terminalPanel");
    var div = document.getElementById("panelDivider");
    var tabs = document.querySelectorAll(".tab");
    tabs.forEach(function(t) { t.classList.remove("active"); });
    if (mode === "plans") {
        plans.style.display = "flex"; plans.style.width = "100%";
        term.style.display = "none"; div.style.display = "none";
        tabs[1].classList.add("active");
    } else if (mode === "terminal") {
        plans.style.display = "none"; div.style.display = "none";
        term.style.display = "flex"; term.style.flex = "1";
        tabs[2].classList.add("active");
    } else {
        plans.style.display = "flex"; plans.style.width = "40%";
        term.style.display = "flex"; term.style.flex = "1";
        div.style.display = "block";
        tabs[0].classList.add("active");
    }
}


async function loadAgents() {
    try {
        var res = await fetch("/api/agents");
        agents = await res.json();
        agentsListEl.innerHTML = "";
        var auto = document.createElement("div");
        auto.className = "agent-item active";
        auto.dataset.id = "auto";
        auto.innerHTML = '<span class="agent-icon">🧠</span><span class="agent-name">Auto</span><span class="agent-dot"></span>';
        auto.onclick = function() { switchAgent("auto"); };
        agentsListEl.appendChild(auto);
        for (var id in agents) {
            var a = agents[id];
            var d = document.createElement("div");
            d.className = "agent-item";
            d.dataset.id = id;
            d.innerHTML = '<span class="agent-icon">' + a.icon + '</span><span class="agent-name">' + a.name + '</span><span class="agent-dot"></span>';
            d.onclick = (function(agentId) { return function() { switchAgent(agentId); }; })(id);
            agentsListEl.appendChild(d);
        }
    } catch (e) { console.error(e); }
}


function switchAgent(id) {
    currentAgent = id;
    document.querySelectorAll(".agent-item").forEach(function(el) {
        el.classList.toggle("active", el.dataset.id === id);
    });
    if (id === "auto") {
        document.getElementById("promptAgent").textContent = "🧠";
        document.getElementById("autoRoute").checked = true;
    } else {
        document.getElementById("promptAgent").textContent = agents[id].icon;
        document.getElementById("autoRoute").checked = false;
    }
    addLog("switch", "→ " + (id === "auto" ? "🧠 Auto" : agents[id].icon + " " + agents[id].name));
}


async function loadCommands() {
    try {
        var res = await fetch("/api/templates");
        var templates = await res.json();
        commandsListEl.innerHTML = "";
        templates.forEach(function(c) {
            var d = document.createElement("div");
            d.className = "command-item";
            d.innerHTML = '<span class="command-name">' + c.title + '</span><span class="command-desc">' + c.desc + '</span>';
            d.onclick = function() {
                if (c.title === "/fullcycle") { document.getElementById("nicheInput").focus(); }
                else { inputEl.value = c.prompt; inputEl.focus(); }
            };
            commandsListEl.appendChild(d);
        });
    } catch (e) { console.error(e); }
}


function addLog(type, text) {
    var d = document.createElement("div");
    d.className = "init-log";
    var icons = {
        success: '<span class="log-success">✓</span>',
        info: '<span class="log-info">ℹ</span>',
        warning: '<span class="log-warning">⚠</span>',
        error: '<span class="log-error">✗</span>',
        switch: '<span class="log-info">→</span>'
    };
    d.innerHTML = (icons[type] || icons.info) + " " + text;
    terminalEl.appendChild(d);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}


function parseResponse(text) {
    var stepMap = {
        "СКАНИРОВАНИЕ":"analysis","АНАЛИЗ":"analysis","АУДИТОРИЯ":"analysis",
        "REDDIT":"research","YOUTUBE":"research","TWITTER/X":"research",
        "TELEGRAM/ФОРУМЫ":"research","GOOGLE TRENDS":"research",
        "КАРТА БОЛЕЙ":"research","ЗОЛОТЫЕ ВОЗМОЖНОСТИ":"strategy",
        "ИССЛЕДОВАНИЕ":"research","КОНКУРЕНТЫ":"research","ТРЕНДЫ":"research",
        "БОЛИ":"research","СТРАТЕГИЯ":"strategy","КАНАЛЫ":"strategy",
        "ПОЗИЦИОНИРОВАНИЕ":"strategy","РЕШЕНИЕ":"strategy","МОДЕЛЬ":"strategy",
        "ПРОДУКТ":"strategy","БИЗНЕС-МОДЕЛЬ":"strategy",
        "ПЛАН":"plan","MVP":"plan","КОД":"plan","КОНТЕНТ-ПЛАН":"plan",
        "ДОРОЖНАЯ КАРТА":"plan","ВОРОНКА":"plan","ЗАПУСК":"plan",
        "MVP 14 ДНЕЙ":"plan","MVP — 14 ДНЕЙ":"plan","МАРКЕТИНГ":"plan",
        "РЕЗУЛЬТАТ":"result","ВЫВОДЫ":"result","ВЫВОД":"result",
        "РЕКОМЕНДАЦИИ":"result","МЕТРИКИ":"result","UNIT-ЭКОНОМИКА":"result",
        "ФИНАНСЫ":"result","РИСКИ":"result","СЛЕДУЮЩИЙ ШАГ":"result",
        "РЕЗЮМЕ":"analysis","ПРОБЛЕМА":"analysis","РЫНОК":"research",
        "ЦЕЛЕВОЙ РЫНОК":"research","АРХИТЕКТУРА":"analysis",
        "ДЕПЛОЙ":"result","СРОКИ":"result","КОНТАКТ":"plan",
        "ПРЕЗЕНТАЦИЯ":"plan","ВОЗРАЖЕНИЯ":"strategy",
        "ЗАКРЫТИЕ":"result","FOLLOW-UP":"result",
        "ЛЕНДИНГ":"plan","ДОПОЛНЕНИЕ":"result",
        "ДОПОЛНИТЕЛЬНЫЙ АНАЛИЗ":"result"
    };
    var h = text
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    h = h.replace(/\[([А-ЯA-Z\s\-\/0-9—]+)\]/g, function(m, l) {
        var t = l.trim();
        var c = stepMap[t] || "default";
        return '<div class="step-label ' + c + '">[' + t + ']</div>';
    });
    h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    h = h.split('\n').map(function(l) {
        l = l.trim();
        if (!l) return '';
        if (l.startsWith('<')) return l;
        return '<p>' + l + '</p>';
    }).join('\n');
    return h;
}


function getTime() {
    return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}


function addTerminalBlock(userText, responseHtml, agentInfo, timeStr, routeInfo, modelsUsed) {
    var b = document.createElement("div");
    b.className = "term-block";
    var a = agentInfo || { icon: "🧠", name: "Agent", color: "#58a6ff" };
    var html = '<div class="term-input-line"><span class="term-prompt">' + a.icon + ' ❯</span><span class="term-command">' + userText.replace(/</g, "&lt;") + '</span></div>';
    html += '<div class="term-status"><span class="agent-badge" style="background:' + a.color + '22;color:' + a.color + '">' + a.name + '</span><span>done</span></div>';
    if (routeInfo) html += '<div class="route-info">🧠 ' + routeInfo.reason + '</div>';
    if (modelsUsed) html += '<div class="models-info">🔗 ' + modelsUsed + '</div>';
    html += '<div class="term-response">' + responseHtml + '</div>';
    html += '<div class="term-time">' + (timeStr || getTime()) + '</div>';
    b.innerHTML = html;
    terminalEl.appendChild(b);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}


function setStatus(s, t) {
    var dot = document.getElementById("statusDot");
    var txt = document.getElementById("statusText");
    dot.className = "status-dot" + (s !== "ready" ? " " + s : "");
    txt.textContent = t || "Ready";
}


function showThinking(label) {
    var d = document.createElement("div");
    d.className = "thinking";
    d.id = "thinking";
    d.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div><span>' + (label || "...") + '</span>';
    terminalEl.appendChild(d);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}


function hideThinking() {
    var el = document.getElementById("thinking");
    if (el) el.remove();
}


function completeQuest(id, name) {
    if (quests[id]) return;
    quests[id] = true;
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
    var el = document.getElementById(id);
    if (el) { el.textContent = "☑"; el.parentElement.classList.add("done"); }
    addLog("success", "🏆 " + name);
}


function loadQuests() {
    for (var id in quests) {
        if (quests[id]) {
            var el = document.getElementById(id);
            if (el) { el.textContent = "☑"; el.parentElement.classList.add("done"); }
        }
    }
}


function updateStats() {
    var mc = document.getElementById("msgCount");
    var au = document.getElementById("agentsUsed");
    var pc = document.getElementById("plansCount");
    if (mc) mc.textContent = stats.messages;
    if (au) au.textContent = stats.agents_used.length;
    if (pc) pc.textContent = stats.plans;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}


function saveHistory() {
    var blocks = [];
    document.querySelectorAll(".term-block,.fullcycle-header,.chain-separator").forEach(function(el) {
        blocks.push(el.outerHTML);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}


function loadHistory() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    var blocks = JSON.parse(saved);
    if (!blocks.length) return;
    blocks.forEach(function(html) {
        var d = document.createElement("div");
        d.innerHTML = html;
        if (d.firstChild) terminalEl.appendChild(d.firstChild);
    });
    addLog("success", "History (" + blocks.length + ")");
    terminalEl.scrollTop = terminalEl.scrollHeight;
}


function createIdeaCard(idea, index) {
    var card = document.createElement("div");
    card.className = "biz-card";
    card.dataset.title = idea.title || "";
    card.dataset.niche = idea.niche || "";

    var stars = "";
    var rating = idea.rating || 3;
    for (var s = 0; s < 5; s++) {
        stars += s < rating ? "⭐" : "☆";
    }

    card.innerHTML =
        '<div class="card-header">' +
            '<span class="card-niche">' + (idea.niche || "Бизнес") + '</span>' +
            '<span class="card-time">' + stars + '</span>' +
        '</div>' +
        '<div class="card-title">' + (idea.title || "Идея #" + (index + 1)) + '</div>' +
        '<div class="card-desc">' + (idea.problem || "") + '</div>' +
        '<div class="card-metrics">' +
            '<span class="card-metric green">' + (idea.revenue || "$?/мес") + '</span>' +
            '<span class="card-metric blue">' + (idea.format || "SaaS") + '</span>' +
            '<span class="card-metric yellow">' + (idea.time_to_mvp || "? нед") + '</span>' +
            '<span class="card-metric purple">Старт: ' + (idea.startup_cost || "$?") + '</span>' +
        '</div>' +
        '<div class="card-desc" style="font-size:10px;margin-top:4px;">' +
            '💡 ' + (idea.solution || "") +
        '</div>' +
        '<div class="card-desc" style="font-size:10px;color:var(--cyan);">' +
            '📈 ' + (idea.trend || "") +
        '</div>' +
        '<div class="card-desc" style="font-size:9px;color:var(--text-muted);margin-top:4px;">' +
            '👣 ' + (idea.first_step || "") +
        '</div>' +
        '<div class="card-actions">' +
            '<button class="card-action primary" onclick="expandIdea(this)">📋 План</button>' +
            '<button class="card-action" onclick="scanIdea(this)">📡 Скан</button>' +
            '<button class="card-action" onclick="buildIdea(this)">🛠 MVP</button>' +
        '</div>';

    return card;
}


async function loadAutoIdeas() {
    addLog("info", "🤖 Generating business ideas...");
    setStatus("working", "Generating ideas...");

    try {
        var res = await fetch("/api/auto-ideas");
        var data = await res.json();

        if (data.ideas && data.ideas.length > 0) {
            var emptyEl = document.getElementById("plansEmpty");
            if (emptyEl) emptyEl.style.display = "none";

            var existingCards = plansListEl.querySelectorAll(".biz-card");

            if (existingCards.length > 0 && !data.cached) {
                var divider = document.createElement("div");
                divider.style.cssText = "text-align:center;padding:8px;font-size:10px;color:var(--cyan);border-top:1px solid var(--border);margin-top:4px;";
                divider.textContent = "── 🔄 Новые идеи " + getTime() + " ──";
                plansListEl.insertBefore(divider, plansListEl.firstChild);
            }

            data.ideas.forEach(function(idea, index) {
                var card = createIdeaCard(idea, index);

                if (existingCards.length > 0 && !data.cached) {
                    var insertAfter = plansListEl.children[1] || null;
                    if (insertAfter) {
                        plansListEl.insertBefore(card, insertAfter);
                    } else {
                        plansListEl.appendChild(card);
                    }
                } else {
                    plansListEl.appendChild(card);
                }
            });

            var totalCards = plansListEl.querySelectorAll(".biz-card").length;
            stats.plans = totalCards;
            updateStats();
            document.getElementById("plansCardCount").textContent = totalCards;
            addLog("success", "🤖 " + data.ideas.length + " ideas" + (data.cached ? " (cached)" : " (new!)"));
        } else {
            addLog("warning", "No ideas generated");
        }
    } catch (e) {
        addLog("error", "Ideas: " + e.message);
    }

    setStatus("ready");
}


async function expandIdea(btn) {
    var card = btn.closest(".biz-card");
    var title = card.dataset.title;
    var niche = card.dataset.niche;

    sendBtn.disabled = true;
    setStatus("working", "Building plan...");
    showThinking("📋 Plan: " + title);

    try {
        var res = await fetch("/api/expand-idea", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: title, niche: niche })
        });
        var data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            card.classList.add("active");
            addTerminalBlock("📋 Plan: " + title, parseResponse(data.response), {
                icon: data.agent_icon,
                name: data.agent_name,
                color: data.agent_color
            });
            completeQuest("q3", "Бизнес-план");
            stats.messages++;
            updateStats();
            saveHistory();
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
}


function scanIdea(btn) {
    var card = btn.closest(".biz-card");
    var niche = card.dataset.niche || card.dataset.title;
    inputEl.value = "Просканируй соцсети и найди боли в нише: " + niche;
    switchAgent("scanner");
    setTimeout(function() { sendMessage(); }, 100);
}


function buildIdea(btn) {
    var card = btn.closest(".biz-card");
    var title = card.dataset.title;
    inputEl.value = "Спроектируй MVP для: " + title + ". Архитектура, код, деплой.";
    switchAgent("developer");
    setTimeout(function() { sendMessage(); }, 100);
}


async function refreshIdeas() {
    var emptyEl = document.getElementById("plansEmpty");
    if (!emptyEl) {
        var newEmpty = document.createElement("div");
        newEmpty.className = "plans-empty";
        newEmpty.id = "plansEmpty";
        newEmpty.innerHTML = '<div class="empty-icon">⏳</div><p>Генерация новых идей...</p>';
        plansListEl.insertBefore(newEmpty, plansListEl.firstChild);
    }
    await loadAutoIdeas();
}


async function quickGenerate() {
    var niche = document.getElementById("nicheInput").value.trim();
    if (!niche) {
        document.getElementById("nicheInput").focus();
        addLog("warning", "Введи нишу");
        return;
    }

    sendBtn.disabled = true;
    setStatus("working", "Ideas: " + niche);
    showThinking("💡 Generating for: " + niche);

    try {
        var res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Сгенерируй 5 бизнес-идей для ниши: " + niche,
                session_id: sessionId,
                agent: "idea_generator",
                auto_route: false
            })
        });
        var data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            addTerminalBlock("💡 Ideas: " + niche, parseResponse(data.response), {
                icon: data.agent_icon,
                name: data.agent_name,
                color: data.agent_color
            }, null, null, data.models_used);
            stats.messages++;
            updateStats();
            saveHistory();
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
}


async function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    inputEl.style.height = "auto";
    sendBtn.disabled = true;

    var isAuto = currentAgent === "auto" || document.getElementById("autoRoute").checked;
    setStatus("working", isAuto ? "Routing..." : "Working...");
    showThinking(isAuto ? "🧠 Choosing agent..." : "Working...");

    chatHistory.push({ role: "user", content: text });

    try {
        var res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                session_id: sessionId,
                agent: isAuto ? "strategist" : currentAgent,
                auto_route: isAuto,
                history: chatHistory.slice(-20)
            })
        });

        var data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            var ai = { icon: data.agent_icon, name: data.agent_name, color: data.agent_color };
            addTerminalBlock(text, parseResponse(data.response), ai, null, data.route_info, data.models_used);
            chatHistory.push({ role: "assistant", content: data.response });
            stats.messages++;
            if (stats.agents_used.indexOf(data.agent) === -1) stats.agents_used.push(data.agent);
            updateStats();
            saveHistory();

            if (data.agent === "scanner") completeQuest("q1", "Сканировать");
            if (data.agent === "business_plan") completeQuest("q3", "Бизнес-план");
            if (stats.agents_used.length >= 3) completeQuest("q4", "3+ агентов");
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
    inputEl.focus();
}


async function runFullCycle() {
    var niche = document.getElementById("nicheInput").value.trim();
    if (!niche) {
        document.getElementById("nicheInput").focus();
        addLog("warning", "Введи нишу");
        return;
    }

    sendBtn.disabled = true;
    document.getElementById("nicheInput").disabled = true;

    var hdr = document.createElement("div");
    hdr.className = "fullcycle-header";
    hdr.innerHTML = '<h3>🚀 ' + niche + '</h3><p>Скан → Идеи → План</p>';
    terminalEl.appendChild(hdr);

    setStatus("fullcycle", "Full Cycle: " + niche);
    showThinking("📡 Scanning: " + niche + "...");

    try {
        var res = await fetch("/api/fullcycle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ niche: niche, project: "default" })
        });

        var data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            data.results.forEach(function(r, i) {
                if (i > 0) {
                    var sep = document.createElement("div");
                    sep.className = "chain-separator";
                    sep.textContent = "▼ " + r.agent_icon + " " + r.agent_name;
                    terminalEl.appendChild(sep);
                }
                addTerminalBlock(
                    i === 0 ? "Scan: " + niche : "→ " + niche,
                    parseResponse(r.response),
                    { icon: r.agent_icon, name: r.agent_name, color: r.agent_color }
                );
                if (stats.agents_used.indexOf(r.agent) === -1) stats.agents_used.push(r.agent);
            });

            stats.messages += data.results.length;
            updateStats();
            saveHistory();

            completeQuest("q1", "Сканировать");
            completeQuest("q2", "Полный цикл");
            completeQuest("q3", "Бизнес-план");
            if (stats.agents_used.length >= 3) completeQuest("q4", "3+ агентов");
            addLog("success", "🚀 Done: " + niche);
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
    document.getElementById("nicheInput").disabled = false;
}


async function runChain(chainAgents, chainName) {
    var text = inputEl.value.trim();
    if (!text) {
        addLog("warning", "Введи задачу");
        inputEl.focus();
        return;
    }

    inputEl.value = "";
    sendBtn.disabled = true;

    addLog("info", "🔗 " + chainName);
    setStatus("chain", "Chain...");
    showThinking("🔗 Chain running...");

    try {
        var res = await fetch("/api/chain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, chain: chainAgents, project: "default" })
        });

        var data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            data.results.forEach(function(r, i) {
                if (i > 0) {
                    var sep = document.createElement("div");
                    sep.className = "chain-separator";
                    sep.textContent = "▼ " + r.agent_icon + " " + r.agent_name;
                    terminalEl.appendChild(sep);
                }
                addTerminalBlock(
                    i === 0 ? text : "← continued",
                    parseResponse(r.response),
                    { icon: r.agent_icon, name: r.agent_name, color: r.agent_color }
                );
                if (stats.agents_used.indexOf(r.agent) === -1) stats.agents_used.push(r.agent);
            });

            stats.messages += data.results.length;
            stats.chains_run = (stats.chains_run || 0) + 1;
            updateStats();
            saveHistory();

            if (stats.agents_used.length >= 3) completeQuest("q4", "3+ агентов");
            addLog("success", "🔗 Done");
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
    inputEl.focus();
}


async function resetChat() {
    try {
        await fetch("/api/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, project: "default" })
        });
    } catch (e) {}

    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    chatHistory = [];
    localStorage.removeItem(STORAGE_KEY);

    terminalEl.innerHTML = "";
    var w = document.createElement("div");
    w.className = "terminal-welcome";
    w.innerHTML = '<pre class="ascii-art">\n ╔═══════════════════════════════════════════╗\n ║     AI  AGENT  ARMY  v5.0                ║\n ╚═══════════════════════════════════════════╝</pre>';
    terminalEl.appendChild(w);

    plansListEl.innerHTML = '<div class="plans-empty" id="plansEmpty"><div class="empty-icon">📋</div><p>Генерация идей...</p></div>';
    document.getElementById("plansCardCount").textContent = "0";

    addLog("success", "Reset");
    loadAutoIdeas();
}


function exportChat() {
    var lines = [];
    document.querySelectorAll(".term-block").forEach(function(block) {
        var cmd = block.querySelector(".term-command");
        var badge = block.querySelector(".agent-badge");
        var resp = block.querySelector(".term-response");
        var tm = block.querySelector(".term-time");
        lines.push(
            "[" + (tm ? tm.textContent : "") + "] [" + (badge ? badge.innerText : "") + "] > " +
            (cmd ? cmd.innerText : "") + "\n\n" + (resp ? resp.innerText : "") + "\n\n---\n"
        );
    });

    if (!lines.length) { addLog("warning", "Empty"); return; }

    completeQuest("q5", "Экспорт");
    var text = "=== AI Agent Army v5 ===\n" + new Date().toLocaleString() + "\n\n" + lines.join("\n");
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "army_" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    addLog("success", "Exported " + lines.length);
}


function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
}


function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}


loadAgents();
loadCommands();
loadHistory();
updateStats();
loadQuests();
loadAutoIdeas();

setInterval(function() {
    addLog("info", "🔄 Auto-refresh ideas...");
    loadAutoIdeas();
}, 600000);
