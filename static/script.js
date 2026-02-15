/* ========== ELEMENTS ========== */
var terminalEl = document.getElementById("terminal");
var inputEl = document.getElementById("userInput");
var sendBtn = document.getElementById("sendBtn");
var agentsListEl = document.getElementById("agentsList");
var commandsListEl = document.getElementById("commandsList");
var plansListEl = document.getElementById("plansList");

/* ========== STORAGE KEYS ========== */
var STORAGE_KEY = "ai_v5_history";
var SESSION_KEY = "ai_v5_session";
var STATS_KEY = "ai_v5_stats";
var QUESTS_KEY = "ai_v5_quests";
var KANBAN_KEY = "ai_v5_kanban";

/* ========== SESSION ========== */
var sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
}

/* ========== STATE ========== */
var currentAgent = "auto";
var agents = {};
var chatHistory = [];
var selectedCards = [];
var niche_ratings_cache = [];
var stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{"messages":0,"agents_used":[],"chains_run":0,"plans":0}');
var quests = JSON.parse(localStorage.getItem(QUESTS_KEY) || '{}');
var kanbanData = JSON.parse(localStorage.getItem(KANBAN_KEY) || '{"ideas":[],"research":[],"mvp":[],"launch":[],"money":[]}');
var startTime = Date.now();

/* ========== UPTIME TIMER ========== */
setInterval(function () {
    var d = Math.floor((Date.now() - startTime) / 1000);
    var el = document.getElementById("uptime");
    if (el) el.textContent = String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0");
}, 1000);

/* ========== TEXTAREA AUTO RESIZE ========== */
inputEl.addEventListener("input", function () {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
});

/* ========== DELAY HELPER ========== */
function delay(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

/* ========== GET TIME ========== */
function getTime() {
    return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ========== SHOW PANEL ========== */
function showPanel(mode) {
    var dash = document.getElementById("dashPanel");
    var rank = document.getElementById("rankPanel");
    var board = document.getElementById("boardPanel");
    var split = document.getElementById("splitScreen");
    var plans = document.getElementById("plansPanel");
    var term = document.getElementById("terminalPanel");
    var div = document.getElementById("panelDivider");
    var tabs = document.querySelectorAll(".tab");

    dash.style.display = "none";
    rank.style.display = "none";
    board.style.display = "none";
    split.style.display = "none";

    tabs.forEach(function (t) {
        t.classList.remove("active");
    });

    if (mode === "dash") {
        dash.style.display = "block";
        tabs[1].classList.add("active");
        loadDashboard();
    } else if (mode === "rank") {
        rank.style.display = "block";
        tabs[2].classList.add("active");
        loadRankings();
    } else if (mode === "board") {
        board.style.display = "block";
        tabs[3].classList.add("active");
        loadKanban();
    } else if (mode === "plans") {
        split.style.display = "flex";
        plans.style.display = "flex";
        plans.style.width = "100%";
        term.style.display = "none";
        div.style.display = "none";
        tabs[4].classList.add("active");
    } else if (mode === "terminal") {
        split.style.display = "flex";
        plans.style.display = "none";
        div.style.display = "none";
        term.style.display = "flex";
        term.style.flex = "1";
        tabs[5].classList.add("active");
    } else {
        split.style.display = "flex";
        plans.style.display = "flex";
        plans.style.width = "40%";
        term.style.display = "flex";
        term.style.flex = "1";
        div.style.display = "block";
        tabs[0].classList.add("active");
    }
}

/* ========== LOAD AGENTS ========== */
async function loadAgents() {
    try {
        var res = await fetch("/api/agents");
        agents = await res.json();
        agentsListEl.innerHTML = "";

        var auto = document.createElement("div");
        auto.className = "agent-item active";
        auto.dataset.id = "auto";
        auto.innerHTML = '<span class="agent-icon">🧠</span><span class="agent-name">Auto</span><span class="agent-dot"></span>';
        auto.onclick = function () {
            switchAgent("auto");
        };
        agentsListEl.appendChild(auto);

        for (var id in agents) {
            var a = agents[id];
            var d = document.createElement("div");
            d.className = "agent-item";
            d.dataset.id = id;
            d.innerHTML = '<span class="agent-icon">' + a.icon + '</span><span class="agent-name">' + a.name + '</span><span class="agent-dot"></span>';
            d.onclick = (function (agentId) {
                return function () {
                    switchAgent(agentId);
                };
            })(id);
            agentsListEl.appendChild(d);
        }
    } catch (e) {
        console.error("loadAgents error:", e);
    }
}

/* ========== SWITCH AGENT ========== */
function switchAgent(id) {
    currentAgent = id;
    document.querySelectorAll(".agent-item").forEach(function (el) {
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

/* ========== LOAD COMMANDS ========== */
async function loadCommands() {
    try {
        var res = await fetch("/api/templates");
        var templates = await res.json();
        commandsListEl.innerHTML = "";
        templates.forEach(function (c) {
            var d = document.createElement("div");
            d.className = "command-item";
            d.innerHTML = '<span class="command-name">' + c.title + '</span><span class="command-desc">' + c.desc + '</span>';
            d.onclick = function () {
                if (c.title === "/fullcycle") {
                    document.getElementById("nicheInput").focus();
                } else {
                    inputEl.value = c.prompt;
                    inputEl.focus();
                }
            };
            commandsListEl.appendChild(d);
        });
    } catch (e) {
        console.error("loadCommands error:", e);
    }
}

/* ========== ADD LOG ========== */
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

/* ========== PARSE RESPONSE ========== */
function parseResponse(text) {
    var stepMap = {
        "СКАНИРОВАНИЕ": "analysis", "АНАЛИЗ": "analysis", "АУДИТОРИЯ": "analysis",
        "REDDIT": "research", "YOUTUBE": "research", "TWITTER/X": "research",
        "TELEGRAM/ФОРУМЫ": "research", "GOOGLE TRENDS": "research",
        "КАРТА БОЛЕЙ": "research", "ЗОЛОТЫЕ ВОЗМОЖНОСТИ": "strategy",
        "ИССЛЕДОВАНИЕ": "research", "КОНКУРЕНТЫ": "research", "ТРЕНДЫ": "research",
        "БОЛИ": "research", "СТРАТЕГИЯ": "strategy", "КАНАЛЫ": "strategy",
        "ПОЗИЦИОНИРОВАНИЕ": "strategy", "РЕШЕНИЕ": "strategy", "МОДЕЛЬ": "strategy",
        "ПРОДУКТ": "strategy", "БИЗНЕС-МОДЕЛЬ": "strategy",
        "ПЛАН": "plan", "MVP": "plan", "КОД": "plan", "КОНТЕНТ-ПЛАН": "plan",
        "ДОРОЖНАЯ КАРТА": "plan", "ВОРОНКА": "plan", "ЗАПУСК": "plan",
        "MVP 14 ДНЕЙ": "plan", "MVP — 14 ДНЕЙ": "plan", "МАРКЕТИНГ": "plan",
        "РЕЗУЛЬТАТ": "result", "ВЫВОДЫ": "result", "ВЫВОД": "result",
        "РЕКОМЕНДАЦИИ": "result", "МЕТРИКИ": "result", "UNIT-ЭКОНОМИКА": "result",
        "ФИНАНСЫ": "result", "РИСКИ": "result", "СЛЕДУЮЩИЙ ШАГ": "result",
        "РЕЗЮМЕ": "analysis", "ПРОБЛЕМА": "analysis", "РЫНОК": "research",
        "ЦЕЛЕВОЙ РЫНОК": "research", "АРХИТЕКТУРА": "analysis",
        "ДЕПЛОЙ": "result", "СРОКИ": "result", "КОНТАКТ": "plan",
        "ПРЕЗЕНТАЦИЯ": "plan", "ВОЗРАЖЕНИЯ": "strategy",
        "ЗАКРЫТИЕ": "result", "FOLLOW-UP": "result",
        "ЛЕНДИНГ": "plan", "ДОПОЛНЕНИЕ": "result",
        "ДОПОЛНИТЕЛЬНЫЙ АНАЛИЗ": "result",
        "РАУНД 1 — Первые мнения": "analysis",
        "РАУНД 2 — Дебаты": "strategy",
        "РАУНД 3 — Улучшения": "plan",
        "ВЕРДИКТ": "result",
        "ПОБЕДИТЕЛЬ": "result",
        "ПОЧЕМУ НЕ ДРУГИЕ": "strategy",
        "РЕКОМЕНДАЦИЯ": "result"
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

    h = h.replace(/\[([А-ЯA-Z\s\-\/0-9—]+)\]/g, function (m, l) {
        var t = l.trim();
        var c = stepMap[t] || "default";
        return '<div class="step-label ' + c + '">[' + t + ']</div>';
    });

    h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    h = h.split('\n').map(function (l) {
        l = l.trim();
        if (!l) return '';
        if (l.startsWith('<')) return l;
        return '<p>' + l + '</p>';
    }).join('\n');

    return h;
}

/* ========== PARSE DEBATE TEXT ========== */
function parseDebateText(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

/* ========== ADD TERMINAL BLOCK ========== */
function addTerminalBlock(userText, responseHtml, agentInfo, timeStr, routeInfo, modelsUsed) {
    var b = document.createElement("div");
    b.className = "term-block";
    var a = agentInfo || { icon: "🧠", name: "Agent", color: "#58a6ff" };

    var html = '<div class="term-input-line">';
    html += '<span class="term-prompt">' + a.icon + ' ❯</span>';
    html += '<span class="term-command">' + userText.replace(/</g, "&lt;") + '</span>';
    html += '</div>';

    html += '<div class="term-status">';
    html += '<span class="agent-badge" style="background:' + a.color + '22;color:' + a.color + '">' + a.name + '</span>';
    html += '<span>done</span>';
    html += '</div>';

    if (routeInfo) {
        html += '<div class="route-info">🧠 ' + routeInfo.reason + '</div>';
    }
    if (modelsUsed) {
        html += '<div class="models-info">🔗 ' + modelsUsed + '</div>';
    }

    html += '<div class="term-response">' + responseHtml + '</div>';
    html += '<div class="term-time">' + (timeStr || getTime()) + '</div>';

    b.innerHTML = html;
    terminalEl.appendChild(b);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

/* ========== STATUS ========== */
function setStatus(s, t) {
    var dot = document.getElementById("statusDot");
    var txt = document.getElementById("statusText");
    dot.className = "status-dot" + (s !== "ready" ? " " + s : "");
    txt.textContent = t || "Ready";
}

/* ========== THINKING ========== */
function showThinking(label) {
    hideThinking();
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

/* ========== DEBATE TYPING INDICATOR ========== */
function showDebateTyping(icon, label, color) {
    hideDebateTyping();
    var el = document.createElement("div");
    el.className = "debate-typing";
    el.id = "debateTyping";
    el.innerHTML =
        '<div class="debate-avatar" style="width:28px;height:28px;font-size:14px;border-color:' + (color || 'var(--border)') + ';background:' + (color ? color + '22' : 'transparent') + '">' + icon + '</div>' +
        '<div class="debate-typing-dots">' +
            '<span style="background:' + (color || 'var(--cyan)') + '"></span>' +
            '<span style="background:' + (color || 'var(--cyan)') + '"></span>' +
            '<span style="background:' + (color || 'var(--cyan)') + '"></span>' +
        '</div>' +
        '<span class="debate-typing-label">' + label + '</span>';
    terminalEl.appendChild(el);
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

function hideDebateTyping() {
    var el = document.getElementById("debateTyping");
    if (el) el.remove();
}

/* ========== QUESTS ========== */
function completeQuest(id, name) {
    if (quests[id]) return;
    quests[id] = true;
    localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
    var el = document.getElementById(id);
    if (el) {
        el.textContent = "☑";
        el.parentElement.classList.add("done");
    }
    addLog("success", "🏆 " + name);
}

function loadQuests() {
    for (var id in quests) {
        if (quests[id]) {
            var el = document.getElementById(id);
            if (el) {
                el.textContent = "☑";
                el.parentElement.classList.add("done");
            }
        }
    }
}

/* ========== STATS ========== */
function updateStats() {
    var mc = document.getElementById("msgCount");
    var au = document.getElementById("agentsUsed");
    var pc = document.getElementById("plansCount");
    if (mc) mc.textContent = stats.messages;
    if (au) au.textContent = stats.agents_used.length;
    if (pc) pc.textContent = stats.plans;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/* ========== SAVE / LOAD HISTORY ========== */
function saveHistory() {
    var blocks = [];
    document.querySelectorAll(".term-block,.fullcycle-header,.chain-separator,.debate-header,.debate-container").forEach(function (el) {
        blocks.push(el.outerHTML);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

function loadHistory() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    var blocks = JSON.parse(saved);
    if (!blocks.length) return;
    blocks.forEach(function (html) {
        var d = document.createElement("div");
        d.innerHTML = html;
        if (d.firstChild) terminalEl.appendChild(d.firstChild);
    });
    addLog("success", "History (" + blocks.length + ")");
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

/* ========== CREATE IDEA CARD ========== */
function createIdeaCard(idea, index) {
    var card = document.createElement("div");
    card.className = "biz-card";
    card.dataset.title = idea.title || "";
    card.dataset.niche = idea.niche || "";
    card.dataset.revenue = idea.revenue || "";

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
            '<button class="card-action" onclick="debateIdea(this)">🗣 Дебаты</button>' +
            '<button class="card-action" onclick="scanIdea(this)">📡 Скан</button>' +
            '<button class="card-action" onclick="buildIdea(this)">🛠 MVP</button>' +
            '<button class="card-action" onclick="addCardToKanban(this)">📋+</button>' +
        '</div>';

    // Клик по карточке — выделение для сравнения
    card.addEventListener("click", function (e) {
        if (e.target.tagName === "BUTTON") return;
        card.classList.toggle("selected");

        var title = card.dataset.title;
        var niche = card.dataset.niche;

        if (card.classList.contains("selected")) {
            selectedCards.push({ title: title, niche: niche });
        } else {
            selectedCards = selectedCards.filter(function (c) {
                return c.title !== title;
            });
        }

        var compareBtn = document.getElementById("compareBtn");
        if (selectedCards.length >= 2) {
            compareBtn.style.display = "inline-flex";
            compareBtn.textContent = "⚖️ Сравнить (" + selectedCards.length + ")";
        } else {
            compareBtn.style.display = "none";
        }
    });

    return card;
}

/* ========== LOAD AUTO IDEAS ========== */
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

            data.ideas.forEach(function (idea, index) {
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

/* ========== EXPAND IDEA ========== */
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
            showPanel("all");
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
}

/* ========== DEBATE IDEA (LIVE — нейронки спорят) ========== */
async function debateIdea(btn) {
    var card = btn.closest(".biz-card");
    var title = card.dataset.title;
    var niche = card.dataset.niche;
    var idea = title + " (ниша: " + niche + ")";
    startDebate(idea);
}

/* ========== START DEBATE ========== */
async function startDebate(idea) {
    sendBtn.disabled = true;
    setStatus("working", "Debate starting...");
    showPanel("terminal");

    // Заголовок дебатов
    var header = document.createElement("div");
    header.className = "debate-header";
    header.innerHTML =
        '<h3>🗣 AI-Дебаты</h3>' +
        '<p>' + idea + '</p>' +
        '<div class="debate-participants">' +
            '<span class="debate-participant"><span style="color:#f59e0b">🎯</span> Стратег</span>' +
            '<span class="debate-participant"><span style="color:#ec4899">📢</span> Маркетолог</span>' +
            '<span class="debate-participant"><span style="color:#3b82f6">💻</span> Разработчик</span>' +
            '<span class="debate-participant"><span style="color:#ef4444">🤝</span> Продажник</span>' +
        '</div>';
    terminalEl.appendChild(header);

    // Контейнер дебатов
    var debateContainer = document.createElement("div");
    debateContainer.className = "debate-container";
    debateContainer.id = "debateContainer";
    terminalEl.appendChild(debateContainer);

    // Typing indicator
    showDebateTyping("🎯", "Стратег думает...", "#f59e0b");
    terminalEl.scrollTop = terminalEl.scrollHeight;

    try {
        var res = await fetch("/api/debate-live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idea: idea })
        });
        var data = await res.json();
        hideDebateTyping();

        if (data.error) {
            addLog("error", data.error);
            setStatus("ready");
            sendBtn.disabled = false;
            return;
        }

        // Рендерим результаты с анимацией
        await renderDebateResults(debateContainer, data.results);

        completeQuest("q5", "Дебаты");
        stats.messages += data.results.length;
        updateStats();
        saveHistory();
        addLog("success", "🗣 Дебаты завершены: " + idea);

    } catch (e) {
        hideDebateTyping();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
}

/* ========== RENDER DEBATE RESULTS ========== */
async function renderDebateResults(container, results) {
    var currentRound = 0;
    var roleMap = {
        "strategist": { css: "strategist", role: "Бизнес-потенциал" },
        "marketer": { css: "marketer", role: "Продвижение" },
        "developer": { css: "developer", role: "Техническая часть" },
        "sales": { css: "sales", role: "Продажи" },
        "verdict": { css: "verdict", role: "Финальный вердикт" }
    };

    for (var i = 0; i < results.length; i++) {
        var r = results[i];

        // Лейбл раунда
        if (r.round !== currentRound) {
            currentRound = r.round;
            var roundLabel = document.createElement("div");
            if (currentRound === 1) {
                roundLabel.className = "debate-round-label";
                roundLabel.textContent = "── РАУНД 1 — Первые мнения ──";
            } else if (currentRound === 2) {
                roundLabel.className = "debate-round-label round2";
                roundLabel.textContent = "── РАУНД 2 — Дебаты и спор ──";
            } else if (currentRound === 3) {
                roundLabel.className = "debate-round-label verdict";
                roundLabel.textContent = "── ФИНАЛЬНЫЙ ВЕРДИКТ ──";
            }
            container.appendChild(roundLabel);
        }

        // Задержка для эффекта живого спора
        await delay(300);

        var info = roleMap[r.agent_id] || { css: "strategist", role: "" };

        var msg = document.createElement("div");
        msg.className = "debate-msg " + info.css + (r.agent_id === "verdict" ? " verdict-msg" : "");

        var textHtml = parseDebateText(r.response);

        msg.innerHTML =
            '<div class="debate-avatar ' + info.css + '">' + r.agent_icon + '</div>' +
            '<div class="debate-content">' +
                '<div class="debate-name" style="color:' + r.agent_color + '">' +
                    r.agent_name +
                    '<span class="debate-role">' + info.role + '</span>' +
                '</div>' +
                '<div class="debate-text">' + textHtml + '</div>' +
            '</div>';

        container.appendChild(msg);
        terminalEl.scrollTop = terminalEl.scrollHeight;
    }
}

/* ========== SCAN IDEA ========== */
function scanIdea(btn) {
    var card = btn.closest(".biz-card");
    var niche = card.dataset.niche || card.dataset.title;
    inputEl.value = "Просканируй соцсети и найди боли в нише: " + niche;
    switchAgent("scanner");
    showPanel("all");
    setTimeout(function () {
        sendMessage();
    }, 100);
}

/* ========== BUILD IDEA ========== */
function buildIdea(btn) {
    var card = btn.closest(".biz-card");
    var title = card.dataset.title;
    inputEl.value = "Спроектируй MVP для: " + title + ". Архитектура, код, деплой.";
    switchAgent("developer");
    showPanel("all");
    setTimeout(function () {
        sendMessage();
    }, 100);
}

/* ========== ADD CARD TO KANBAN ========== */
function addCardToKanban(btn) {
    var card = btn.closest(".biz-card");
    var title = card.dataset.title;
    var niche = card.dataset.niche;
    var revenue = card.dataset.revenue;
    addToKanban(title, niche, revenue);
}

/* ========== REFRESH IDEAS ========== */
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

/* ========== QUICK GENERATE ========== */
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
            showPanel("all");
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    setStatus("ready");
    sendBtn.disabled = false;
}

/* ========== SEND MESSAGE ========== */
async function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;

    // Обработка /debate
    if (text.toLowerCase().startsWith("/debate ") || text.toLowerCase().startsWith("обсудите ") || text.toLowerCase().startsWith("дебаты ")) {
        var idea = text.replace(/^\/(debate)\s*/i, "").replace(/^(обсудите|дебаты)\s*/i, "").trim();
        if (!idea) {
            addLog("warning", "Укажи идею для дебатов");
            return;
        }
        inputEl.value = "";
        inputEl.style.height = "auto";
        startDebate(idea);
        return;
    }

    // Обработка /compare
    if (text.toLowerCase().startsWith("/compare ") || text.toLowerCase().startsWith("сравни ")) {
        addLog("info", "Выдели карточки кликом и нажми ⚖️ Сравнить");
        inputEl.value = "";
        return;
    }

    // Обработка /fullcycle
    if (text.toLowerCase().startsWith("/fullcycle ") || text.toLowerCase().startsWith("/full ")) {
        var niche = text.replace(/^\/(fullcycle|full)\s*/i, "").trim();
        if (niche) {
            document.getElementById("nicheInput").value = niche;
        }
        inputEl.value = "";
        runFullCycle();
        return;
    }

    // Обычная отправка
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
            if (data.agent === "debater") completeQuest("q5", "Дебаты");
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

/* ========== FULL CYCLE ========== */
async function runFullCycle() {
    var niche = document.getElementById("nicheInput").value.trim();
    if (!niche) {
        document.getElementById("nicheInput").focus();
        addLog("warning", "Введи нишу");
        return;
    }

    sendBtn.disabled = true;
    document.getElementById("nicheInput").disabled = true;
    showPanel("terminal");

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
            data.results.forEach(function (r, i) {
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

/* ========== RUN CHAIN ========== */
async function runChain(chainAgents, chainName) {
    var text = inputEl.value.trim();
    if (!text) {
        addLog("warning", "Введи задачу");
        inputEl.focus();
        return;
    }

    inputEl.value = "";
    sendBtn.disabled = true;
    showPanel("terminal");

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
            data.results.forEach(function (r, i) {
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

/* ========== COMPARE SELECTED ========== */
async function compareSelected() {
    if (selectedCards.length < 2) {
        addLog("warning", "Выбери минимум 2 карточки");
        return;
    }

    sendBtn.disabled = true;
    setStatus("working", "Comparing...");
    showThinking("⚖️ Сравнение " + selectedCards.length + " идей...");

    try {
        var res = await fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ideas: selectedCards })
        });
        var data = await res.json();
        hideThinking();

        if (data.error) {
            addLog("error", data.error);
        } else {
            addTerminalBlock(
                "⚖️ Сравнение: " + selectedCards.map(function (c) { return c.title; }).join(" vs "),
                parseResponse(data.response),
                { icon: data.agent_icon, name: data.agent_name, color: data.agent_color }
            );
            completeQuest("q6", "Сравнение");
            stats.messages++;
            updateStats();
            saveHistory();
            showPanel("all");
        }
    } catch (e) {
        hideThinking();
        addLog("error", e.message);
    }

    // Снять выделение
    document.querySelectorAll(".biz-card.selected").forEach(function (c) {
        c.classList.remove("selected");
    });
    selectedCards = [];
    document.getElementById("compareBtn").style.display = "none";

    setStatus("ready");
    sendBtn.disabled = false;
}

/* ========== DASHBOARD ========== */
async function loadDashboard() {
    try {
        var res = await fetch("/api/dashboard");
        var data = await res.json();

        document.getElementById("dashTotalIdeas").textContent = data.total_ideas || 0;
        document.getElementById("dashAvgRating").textContent = data.avg_rating || 0;
        document.getElementById("dashMessages").textContent = data.total_messages || 0;
        document.getElementById("dashAgents").textContent = data.total_projects || 0;

        var colors = ["#58a6ff", "#3fb950", "#f59e0b", "#ec4899", "#8b5cf6", "#f97316", "#ef4444", "#06b6d4", "#84cc16", "#a855f7"];

        // Ниши
        var nicheBars = document.getElementById("dashNicheBars");
        nicheBars.innerHTML = "";
        var maxNiche = 0;
        if (data.top_niches && data.top_niches.length > 0) {
            maxNiche = data.top_niches[0][1];
        }
        (data.top_niches || []).forEach(function (item, i) {
            var pct = maxNiche > 0 ? Math.round((item[1] / maxNiche) * 100) : 0;
            var color = colors[i % colors.length];
            var row = document.createElement("div");
            row.className = "dash-bar-item";
            row.innerHTML =
                '<span class="dash-bar-label">' + item[0] + '</span>' +
                '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '<span class="dash-bar-value">' + item[1] + '</span>';
            nicheBars.appendChild(row);
        });

        if (!data.top_niches || data.top_niches.length === 0) {
            nicheBars.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:11px;">Нет данных. Сгенерируй идеи!</div>';
        }

        // Форматы
        var formatBars = document.getElementById("dashFormatBars");
        formatBars.innerHTML = "";
        var formatEntries = Object.entries(data.formats || {}).sort(function (a, b) { return b[1] - a[1]; });
        var maxFormat = formatEntries.length > 0 ? formatEntries[0][1] : 0;

        formatEntries.forEach(function (item, i) {
            var pct = maxFormat > 0 ? Math.round((item[1] / maxFormat) * 100) : 0;
            var color = colors[(i + 3) % colors.length];
            var row = document.createElement("div");
            row.className = "dash-bar-item";
            row.innerHTML =
                '<span class="dash-bar-label">' + item[0] + '</span>' +
                '<div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
                '<span class="dash-bar-value">' + item[1] + '</span>';
            formatBars.appendChild(row);
        });

        if (formatEntries.length === 0) {
            formatBars.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:11px;">Нет данных</div>';
        }

        // Топ-5
        var topList = document.getElementById("dashTopList");
        topList.innerHTML = "";
        var medals = ["🥇", "🥈", "🥉", "4", "5"];
        (data.top_rated || []).forEach(function (idea, i) {
            var row = document.createElement("div");
            row.className = "dash-top-item";
            row.innerHTML =
                '<span class="dash-top-rank">' + medals[i] + '</span>' +
                '<span class="dash-top-title">' + (idea.title || "—") + '</span>' +
                '<span class="dash-top-niche">' + (idea.niche || "") + '</span>' +
                '<span class="dash-top-rating">⭐ ' + (idea.rating || 0) + '</span>';
            topList.appendChild(row);
        });

        if (!data.top_rated || data.top_rated.length === 0) {
            topList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:11px;">Нет данных</div>';
        }

    } catch (e) {
        console.error("Dashboard error:", e);
    }
}

/* ========== RANKINGS ========== */
async function loadRankings() {
    try {
        var res = await fetch("/api/niche-ratings");
        var data = await res.json();
        var table = document.getElementById("rankTable");
        table.innerHTML = "";

        if (!data.ratings || data.ratings.length === 0) {
            table.innerHTML = '<div class="rank-empty">Генерируй идеи чтобы заполнить рейтинг</div>';
            return;
        }

        // Header
        var header = document.createElement("div");
        header.className = "rank-row header";
        header.innerHTML =
            '<span>#</span>' +
            '<span>Название</span>' +
            '<span>Ниша</span>' +
            '<span>⭐</span>' +
            '<span>💰</span>' +
            '<span>Сложн.</span>' +
            '<span>Конкур.</span>';
        table.appendChild(header);

        data.ratings.forEach(function (r, i) {
            var row = document.createElement("div");
            row.className = "rank-row";

            var diffStars = "";
            var diff = r.difficulty || 3;
            for (var d = 0; d < 5; d++) {
                diffStars += d < diff ? "🔴" : "⚪";
            }

            var compColor = r.competition === "низкая" ? "var(--green)" :
                r.competition === "высокая" ? "var(--red)" : "var(--yellow)";

            row.innerHTML =
                '<span class="rank-pos">' + (i + 1) + '</span>' +
                '<span class="rank-title">' + (r.title || "—") + '</span>' +
                '<span class="rank-niche">' + (r.niche || "") + '</span>' +
                '<span class="rank-rating">⭐ ' + (r.rating || 0) + '</span>' +
                '<span class="rank-revenue">' + (r.revenue || "$0") + '</span>' +
                '<span class="rank-difficulty">' + diffStars + '</span>' +
                '<span class="rank-competition" style="color:' + compColor + '">' + (r.competition || "?") + '</span>';
            table.appendChild(row);
        });
    } catch (e) {
        console.error("Rankings error:", e);
    }
}

/* ========== KANBAN ========== */
function saveKanban() {
    localStorage.setItem(KANBAN_KEY, JSON.stringify(kanbanData));
}

function loadKanban() {
    var cols = {
        ideas: document.getElementById("kanbanIdeas"),
        research: document.getElementById("kanbanResearch"),
        mvp: document.getElementById("kanbanMvp"),
        launch: document.getElementById("kanbanLaunch"),
        money: document.getElementById("kanbanMoney")
    };

    for (var key in cols) {
        cols[key].innerHTML = "";
    }

    // Авто-заполнение из рейтингов если пусто
    if (kanbanData.ideas.length === 0 && niche_ratings_cache.length > 0) {
        niche_ratings_cache.forEach(function (r) {
            kanbanData.ideas.push({
                id: Date.now() + Math.random(),
                title: r.title,
                niche: r.niche,
                revenue: r.revenue
            });
        });
        saveKanban();
    }

    var colNames = ["ideas", "research", "mvp", "launch", "money"];
    colNames.forEach(function (colName) {
        var list = kanbanData[colName] || [];
        list.forEach(function (card, idx) {
            var el = document.createElement("div");
            el.className = "kanban-card";
            el.innerHTML =
                '<div class="kanban-card-title">' + (card.title || "—") + '</div>' +
                '<div class="kanban-card-meta">' + (card.niche || "") + (card.revenue ? " • " + card.revenue : "") + '</div>' +
                '<div class="kanban-card-actions">' +
                    (colName !== "ideas" ? '<button class="kanban-move-btn" onclick="moveKanban(\'' + colName + '\',' + idx + ',\'left\')">◀</button>' : '') +
                    (colName !== "money" ? '<button class="kanban-move-btn" onclick="moveKanban(\'' + colName + '\',' + idx + ',\'right\')">▶</button>' : '') +
                    '<button class="kanban-move-btn" onclick="removeKanban(\'' + colName + '\',' + idx + ')" style="color:var(--red)">✕</button>' +
                '</div>';
            cols[colName].appendChild(el);
        });
    });
}

function moveKanban(fromCol, index, direction) {
    var colOrder = ["ideas", "research", "mvp", "launch", "money"];
    var fromIdx = colOrder.indexOf(fromCol);
    var toIdx = direction === "right" ? fromIdx + 1 : fromIdx - 1;
    if (toIdx < 0 || toIdx >= colOrder.length) return;

    var toCol = colOrder[toIdx];
    var card = kanbanData[fromCol].splice(index, 1)[0];
    kanbanData[toCol].push(card);
    saveKanban();
    loadKanban();
}

function removeKanban(col, index) {
    kanbanData[col].splice(index, 1);
    saveKanban();
    loadKanban();
}

function addToKanban(title, niche, revenue) {
    kanbanData.ideas.push({
        id: Date.now(),
        title: title || "Новая идея",
        niche: niche || "",
        revenue: revenue || ""
    });
    saveKanban();
    addLog("success", "📋 → Kanban: " + title);
}

/* ========== LOAD NICHE RATINGS CACHE ========== */
async function loadNicheRatingsCache() {
    try {
        var res = await fetch("/api/niche-ratings");
        var data = await res.json();
        niche_ratings_cache = data.ratings || [];
    } catch (e) {
        console.error("Niche ratings cache error:", e);
    }
}

/* ========== RESET CHAT ========== */
async function resetChat() {
    try {
        await fetch("/api/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, project: "default" })
        });
    } catch (e) { }

    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    chatHistory = [];
    selectedCards = [];
    localStorage.removeItem(STORAGE_KEY);

    terminalEl.innerHTML = "";
    var w = document.createElement("div");
    w.className = "terminal-welcome";
    w.innerHTML = '<pre class="ascii-art">\n ╔═══════════════════════════════════════════╗\n ║     AI  AGENT  ARMY  v6.0                ║\n ║     Debates + Dashboard + Kanban          ║\n ╚═══════════════════════════════════════════╝</pre>';
    terminalEl.appendChild(w);

    plansListEl.innerHTML = '<div class="plans-empty" id="plansEmpty"><div class="empty-icon">📋</div><p>Генерация идей...</p></div>';
    document.getElementById("plansCardCount").textContent = "0";
    document.getElementById("compareBtn").style.display = "none";

    addLog("success", "Reset");
    loadAutoIdeas();
}

/* ========== EXPORT CHAT ========== */
function exportChat() {
    var lines = [];
    document.querySelectorAll(".term-block").forEach(function (block) {
        var cmd = block.querySelector(".term-command");
        var badge = block.querySelector(".agent-badge");
        var resp = block.querySelector(".term-response");
        var tm = block.querySelector(".term-time");
        lines.push(
            "[" + (tm ? tm.textContent : "") + "] [" + (badge ? badge.innerText : "") + "] > " +
            (cmd ? cmd.innerText : "") + "\n\n" + (resp ? resp.innerText : "") + "\n\n---\n"
        );
    });

    // Экспорт дебатов
    document.querySelectorAll(".debate-msg").forEach(function (msg) {
        var name = msg.querySelector(".debate-name");
        var text = msg.querySelector(".debate-text");
        lines.push(
            "[DEBATE] " + (name ? name.innerText : "") + ": " + (text ? text.innerText : "") + "\n---\n"
        );
    });

    if (!lines.length) {
        addLog("warning", "Empty");
        return;
    }

    completeQuest("q7", "Экспорт");
    var text = "=== AI Agent Army v6 ===\n" + new Date().toLocaleString() + "\n\n" + lines.join("\n");
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "army_" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    addLog("success", "Exported " + lines.length);
}

/* ========== TOGGLE SIDEBAR ========== */
function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
}

/* ========== KEY DOWN ========== */
function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

/* ========== CLOSE SIDEBAR ON OUTSIDE CLICK (mobile) ========== */
document.addEventListener("click", function (e) {
    var sidebar = document.getElementById("sidebar");
    var toggle = document.querySelector(".mobile-toggle");
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove("open");
    }
});

/* ========== INIT ========== */
loadAgents();
loadCommands();
loadHistory();
updateStats();
loadQuests();
loadNicheRatingsCache();
loadAutoIdeas();

// Авто-обновление идей каждые 10 минут
setInterval(function () {
    addLog("info", "🔄 Auto-refresh ideas...");
    loadAutoIdeas();
}, 600000);
