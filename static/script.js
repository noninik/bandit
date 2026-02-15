const terminalEl = document.getElementById("terminal");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const agentsListEl = document.getElementById("agentsList");
const commandsListEl = document.getElementById("commandsList");
const plansListEl = document.getElementById("plansList");

const STORAGE_KEY = "ai_v5_history";
const SESSION_KEY = "ai_v5_session";
const STATS_KEY = "ai_v5_stats";
const QUESTS_KEY = "ai_v5_quests";
const PLANS_KEY = "ai_v5_plans";

let sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) { sessionId = crypto.randomUUID(); localStorage.setItem(SESSION_KEY, sessionId); }

let currentAgent = "auto";
let agents = {};
let chatHistory = [];
let stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{"messages":0,"agents_used":[],"chains_run":0,"plans":0}');
let quests = JSON.parse(localStorage.getItem(QUESTS_KEY) || '{}');
let savedPlans = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
let startTime = Date.now();

setInterval(() => {
    const d = Math.floor((Date.now() - startTime) / 1000);
    const el = document.getElementById("uptime");
    if (el) el.textContent = String(Math.floor(d/60)).padStart(2,"0") + ":" + String(d%60).padStart(2,"0");
}, 1000);

inputEl.addEventListener("input", () => { inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px"; });

// PANEL SWITCHING
function showPanel(mode) {
    const plans = document.getElementById("plansPanel");
    const term = document.getElementById("terminalPanel");
    const div = document.getElementById("panelDivider");
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

    if (mode === "plans") {
        plans.style.display = "flex"; plans.style.width = "100%";
        term.style.display = "none"; div.style.display = "none";
        document.querySelectorAll(".tab")[1].classList.add("active");
    } else if (mode === "terminal") {
        plans.style.display = "none"; div.style.display = "none";
        term.style.display = "flex"; term.style.flex = "1";
        document.querySelectorAll(".tab")[2].classList.add("active");
    } else {
        plans.style.display = "flex"; plans.style.width = "40%";
        term.style.display = "flex"; term.style.flex = "1";
        div.style.display = "block";
        document.querySelectorAll(".tab")[0].classList.add("active");
    }
}

// AGENTS
async function loadAgents() {
    try {
        const res = await fetch("/api/agents");
        agents = await res.json();
        agentsListEl.innerHTML = "";
        const auto = document.createElement("div");
        auto.className = "agent-item active"; auto.dataset.id = "auto";
        auto.innerHTML = '<span class="agent-icon">🧠</span><span class="agent-name">Auto</span><span class="agent-dot"></span>';
        auto.onclick = () => switchAgent("auto");
        agentsListEl.appendChild(auto);
        for (const [id, a] of Object.entries(agents)) {
            const d = document.createElement("div"); d.className = "agent-item"; d.dataset.id = id;
            d.innerHTML = '<span class="agent-icon">'+a.icon+'</span><span class="agent-name">'+a.name+'</span><span class="agent-dot"></span>';
            d.onclick = () => switchAgent(id);
            agentsListEl.appendChild(d);
        }
    } catch (e) { console.error(e); }
}

function switchAgent(id) {
    currentAgent = id;
    document.querySelectorAll(".agent-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
    document.getElementById("promptAgent").textContent = id === "auto" ? "🧠" : (agents[id]?.icon || "🎯");
    document.getElementById("autoRoute").checked = id === "auto";
    addLog("switch", "→ " + (id === "auto" ? "🧠 Auto" : agents[id].icon + " " + agents[id].name));
}

// COMMANDS
async function loadCommands() {
    try {
        const res = await fetch("/api/templates");
        const t = await res.json();
        commandsListEl.innerHTML = "";
        t.forEach(c => {
            const d = document.createElement("div"); d.className = "command-item";
            d.innerHTML = '<span class="command-name">'+c.title+'</span><span class="command-desc">'+c.desc+'</span>';
            d.onclick = () => { if (c.title==="/fullcycle") { document.getElementById("nicheInput").focus(); } else { inputEl.value = c.prompt; inputEl.focus(); } };
            commandsListEl.appendChild(d);
        });
    } catch (e) {}
}

function addLog(type, text) {
    const d = document.createElement("div"); d.className = "init-log";
    const i = {success:'<span class="log-success">✓</span>',info:'<span class="log-info">ℹ</span>',warning:'<span class="log-warning">⚠</span>',error:'<span class="log-error">✗</span>',switch:'<span class="log-info">→</span>'};
    d.innerHTML = (i[type]||i.info) + " " + text;
    terminalEl.appendChild(d); terminalEl.scrollTop = terminalEl.scrollHeight;
}

// PARSE
function parseResponse(text) {
    const sm = {"СКАНИРОВАНИЕ":"analysis","АНАЛИЗ":"analysis","АУДИТОРИЯ":"analysis","REDDIT":"research","YOUTUBE":"research","TWITTER/X":"research","TELEGRAM/ФОРУМЫ":"research","GOOGLE TRENDS":"research","КАРТА БОЛЕЙ":"research","ЗОЛОТЫЕ ВОЗМОЖНОСТИ":"strategy","ИССЛЕДОВАНИЕ":"research","КОНКУРЕНТЫ":"research","ТРЕНДЫ":"research","БОЛИ":"research","СТРАТЕГИЯ":"strategy","КАНАЛЫ":"strategy","ПОЗИЦИОНИРОВАНИЕ":"strategy","РЕШЕНИЕ":"strategy","МОДЕЛЬ":"strategy","ПРОДУКТ":"strategy","БИЗНЕС-МОДЕЛЬ":"strategy","ПЛАН":"plan","MVP":"plan","КОД":"plan","КОНТЕНТ-ПЛАН":"plan","ДОРОЖНАЯ КАРТА":"plan","ВОРОНКА":"plan","ЗАПУСК":"plan","MVP 14 ДНЕЙ":"plan","MVP — 14 ДНЕЙ":"plan","МАРКЕТИНГ":"plan","РЕЗУЛЬТАТ":"result","ВЫВОДЫ":"result","ВЫВОД":"result","РЕКОМЕНДАЦИИ":"result","МЕТРИКИ":"result","UNIT-ЭКОНОМИКА":"result","ФИНАНСЫ":"result","РИСКИ":"result","СЛЕДУЮЩИЙ ШАГ":"result","РЕЗЮМЕ":"analysis","ПРОБЛЕМА":"analysis","РЫНОК":"research","ЦЕЛЕВОЙ РЫНОК":"research","АРХИТЕКТУРА":"analysis","ДЕПЛОЙ":"result","СРОКИ":"result","КОНТАКТ":"plan","ПРЕЗЕНТАЦИЯ":"plan","ВОЗРАЖЕНИЯ":"strategy","ЗАКРЫТИЕ":"result","FOLLOW-UP":"result","ЛЕНДИНГ":"plan","ДОПОЛНЕНИЕ":"result","ДОПОЛНИТЕЛЬНЫЙ АНАЛИЗ":"result"};
    let h = text.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code>$2</code></pre>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^[\-\*] (.+)$/gm,'<li>$1</li>').replace(/^\d+\. (.+)$/gm,'<li>$1</li>');
    h = h.replace(/\[([А-ЯA-Z\s\-\/0-9—]+)\]/g, (m,l) => { const t=l.trim(); const c=sm[t]||"default"; return '<div class="step-label '+c+'">['+t+']</div>'; });
    h = h.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');
    h = h.split('\n').map(l => { l=l.trim(); if(!l) return ''; if(l.startsWith('<')) return l; return '<p>'+l+'</p>'; }).join('\n');
    return h;
}

function getTime() { return new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }

function addTerminalBlock(userText, responseHtml, agentInfo, timeStr, routeInfo, modelsUsed) {
    const b = document.createElement("div"); b.className = "term-block";
    const a = agentInfo || {icon:"🧠",name:"Agent",color:"#58a6ff"};
    let html = '<div class="term-input-line"><span class="term-prompt">'+a.icon+' ❯</span><span class="term-command">'+userText.replace(/</g,"&lt;")+'</span></div>';
    html += '<div class="term-status"><span class="agent-badge" style="background:'+a.color+'22;color:'+a.color+'">'+a.name+'</span><span>done</span></div>';
    if (routeInfo) html += '<div class="route-info">🧠 '+routeInfo.reason+'</div>';
    if (modelsUsed) html += '<div class="models-info">🔗 '+modelsUsed+'</div>';
    html += '<div class="term-response">'+responseHtml+'</div>';
    html += '<div class="term-time">'+(timeStr||getTime())+'</div>';
    b.innerHTML = html; terminalEl.appendChild(b); terminalEl.scrollTop = terminalEl.scrollHeight;
}

function setStatus(s, t) { document.getElementById("statusDot").className = "status-dot"+(s!=="ready"?" "+s:""); document.getElementById("statusText").textContent = t||"Ready"; }
function showThinking(l) { const d=document.createElement("div"); d.className="thinking"; d.id="thinking"; d.innerHTML='<div class="thinking-dots"><span></span><span></span><span></span></div><span>'+(l||"...")+'</span>'; terminalEl.appendChild(d); terminalEl.scrollTop=terminalEl.scrollHeight; }
function hideThinking() { const e=document.getElementById("thinking"); if(e) e.remove(); }

// QUESTS
function completeQuest(id, n) { if(quests[id]) return; quests[id]=true; localStorage.setItem(QUESTS_KEY,JSON.stringify(quests)); const e=document.getElementById(id); if(e){e.textContent="☑";e.parentElement.classList.add("done");} addLog("success","🏆 "+n); }
function loadQuests() { for(const[id,d] of Object.entries(quests)){if(d){const e=document.getElementById(id);if(e){e.textContent="☑";e.parentElement.classList.add("done");}}} }

// BUSINESS CARDS
function addBusinessCard(niche, data, fullResponses) {
    document.getElementById("plansEmpty").style.display = "none";
    const card = document.createElement("div");
    card.className = "biz-card";
    const id = "plan_" + Date.now();

    let title = niche;
    let desc = "";
    if (data && data.length > 0) {
        const text = data[data.length - 1].response || "";
        const lines = text.split("\n").filter(l => l.trim());
        if (lines[0]) title = lines[0].replace(/[#\*\[\]]/g, "").trim().substring(0, 60);
        desc = lines.slice(1, 4).join(" ").replace(/[#\*\[\]]/g, "").trim().substring(0, 120) + "...";
    }

    const agentBadges = (data || []).map(d => '<span class="card-agent-badge">' + (d.agent_icon||"🤖") + '</span>').join("");

    card.innerHTML =
        '<div class="card-header"><span class="card-niche">' + niche + '</span><span class="card-time">' + getTime() + '</span></div>' +
        '<div class="card-title">' + title + '</div>' +
        '<div class="card-desc">' + desc + '</div>' +
        '<div class="card-metrics">' +
        '<span class="card-metric green">📡 Scanned</span>' +
        '<span class="card-metric blue">💡 Ideas</span>' +
        '<span class="card-metric purple">📋 Plan</span>' +
        '</div>' +
        '<div class="card-agents">' + agentBadges + '</div>' +
        '<div class="card-actions">' +
        '<button class="card-action primary" onclick="viewPlan(\'' + id + '\')">👁 Открыть</button>' +
        '<button class="card-action" onclick="deepDive(\'' + id + '\')">🔍 Углубить</button>' +
        '<button class="card-action" onclick="exportPlan(\'' + id + '\')">📥 Export</button>' +
        '</div>';

    card.dataset.id = id;
    plansListEl.appendChild(card);

    const plan = { id: id, niche: niche, data: data, fullResponses: fullResponses, time: getTime(), timestamp: Date.now() };
    savedPlans.push(plan);
    localStorage.setItem(PLANS_KEY, JSON.stringify(savedPlans));

    stats.plans = savedPlans.length;
    updateStats();
    document.getElementById("plansCardCount").textContent = savedPlans.length;
}

function viewPlan(id) {
    const plan = savedPlans.find(p => p.id === id);
    if (!plan) return;
    document.querySelectorAll(".biz-card").forEach(c => c.classList.remove("active"));
    const card = document.querySelector('[data-id="'+id+'"]');
    if (card) card.classList.add("active");
    addLog("info", "📋 Viewing plan: " + plan.niche);
    if (plan.fullResponses) {
        plan.fullResponses.forEach((r, i) => {
            if (i > 0) { const s=document.createElement("div"); s.className="chain-separator"; s.textContent="▼ "+r.agent_icon+" "+r.agent_name; terminalEl.appendChild(s); }
            addTerminalBlock(i===0?"[Plan: "+plan.niche+"]":"← continued", parseResponse(r.response), {icon:r.agent_icon,name:r.agent_name,color:r.agent_color});
        });
    }
}

function deepDive(id) {
    const plan = savedPlans.find(p => p.id === id);
    if (!plan) return;
    inputEl.value = "Углуби анализ для бизнес-идеи в нише: " + plan.niche + ". Дай больше деталей по MVP, маркетингу и финансам.";
    inputEl.focus();
}

function exportPlan(id) {
    const plan = savedPlans.find(p => p.id === id);
    if (!plan || !plan.fullResponses) return;
    let text = "=== Бизнес-план: " + plan.niche + " ===\n" + plan.time + "\n\n";
    plan.fullResponses.forEach(r => { text += "--- " + r.agent_name + " ---\n" + r.response + "\n\n"; });
    const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download = "plan_" + plan.niche.replace(/\s+/g,"_").substring(0,20) + ".txt"; a.click();
    completeQuest("q5","Экспорт");
}

function loadSavedPlans() {
    if (savedPlans.length === 0) return;
    document.getElementById("plansEmpty").style.display = "none";
    savedPlans.forEach(plan => {
        const card = document.createElement("div"); card.className = "biz-card"; card.dataset.id = plan.id;
        let title = plan.niche;
        const agentBadges = (plan.data||[]).map(d => '<span class="card-agent-badge">'+(d.agent_icon||"🤖")+'</span>').join("");
        card.innerHTML = '<div class="card-header"><span class="card-niche">'+plan.niche+'</span><span class="card-time">'+plan.time+'</span></div><div class="card-title">'+title+'</div><div class="card-metrics"><span class="card-metric green">📡</span><span class="card-metric blue">💡</span><span class="card-metric purple">📋</span></div><div class="card-agents">'+agentBadges+'</div><div class="card-actions"><button class="card-action primary" onclick="viewPlan(\''+plan.id+'\')">👁 Открыть</button><button class="card-action" onclick="deepDive(\''+plan.id+'\')">🔍 Углубить</button><button class="card-action" onclick="exportPlan(\''+plan.id+'\')">📥 Export</button></div>';
        plansListEl.appendChild(card);
    });
    document.getElementById("plansCardCount").textContent = savedPlans.length;
}

// QUICK GENERATE
async function quickGenerate() {
    const niche = document.getElementById("nicheInput").value.trim();
    if (!niche) { document.getElementById("nicheInput").focus(); addLog("warning","Введи нишу"); return; }
    sendBtn.disabled = true;
    setStatus("working","Generating ideas...");
    showThinking("💡 Generating business ideas for: " + niche);
    try {
        const res = await fetch("/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Сгенерируй 5 бизнес-идей для ниши: "+niche,session_id:sessionId,agent:"idea_generator",auto_route:false})});
        const data = await res.json(); hideThinking();
        if (data.error) { addLog("error",data.error); }
        else {
            const ai = {icon:data.agent_icon,name:data.agent_name,color:data.agent_color};
            addTerminalBlock("Ideas: "+niche, parseResponse(data.response), ai, null, null, data.models_used);
            addBusinessCard(niche, [{agent_icon:data.agent_icon,agent_name:data.agent_name}], [{agent_icon:data.agent_icon,agent_name:data.agent_name,agent_color:data.agent_color,response:data.response}]);
            stats.messages++; updateStats();
        }
    } catch(e) { hideThinking(); addLog("error",e.message); }
    setStatus("ready"); sendBtn.disabled = false;
}

// SEND
async function sendMessage() {
    const text = inputEl.value.trim(); if (!text) return;
    inputEl.value = ""; inputEl.style.height = "auto"; sendBtn.disabled = true;
    const isAuto = currentAgent==="auto"||document.getElementById("autoRoute").checked;
    setStatus("working",isAuto?"Routing...":"Working...");
    showThinking(isAuto?"🧠 Choosing agent...":"Working...");
    chatHistory.push({role:"user",content:text});
    try {
        const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,session_id:sessionId,agent:isAuto?"strategist":currentAgent,auto_route:isAuto,history:chatHistory.slice(-20)})});
        const data = await res.json(); hideThinking();
        if (data.error) { addLog("error",data.error); }
        else {
            const ai={icon:data.agent_icon,name:data.agent_name,color:data.agent_color};
            addTerminalBlock(text, parseResponse(data.response), ai, null, data.route_info, data.models_used);
            chatHistory.push({role:"assistant",content:data.response});
            stats.messages++; if(!stats.agents_used.includes(data.agent)) stats.agents_used.push(data.agent);
            updateStats(); saveHistory();
            if(data.agent==="scanner") completeQuest("q1","Сканировать");
            if(data.agent==="business_plan") completeQuest("q3","Бизнес-план");
            if(stats.agents_used.length>=3) completeQuest("q4","3+ агентов");
        }
    } catch(e) { hideThinking(); addLog("error",e.message); }
    setStatus("ready"); sendBtn.disabled = false; inputEl.focus();
}

// FULL CYCLE
async function runFullCycle() {
    const niche = document.getElementById("nicheInput").value.trim();
    if (!niche) { document.getElementById("nicheInput").focus(); addLog("warning","Введи нишу"); return; }
    sendBtn.disabled = true; document.getElementById("nicheInput").disabled = true;
    const hdr = document.createElement("div"); hdr.className = "fullcycle-header";
    hdr.innerHTML = '<h3>🚀 '+niche+'</h3><p>Скан → Идеи → План</p>';
    terminalEl.appendChild(hdr);
    setStatus("fullcycle","Full Cycle: "+niche);
    showThinking("📡 Scanning: "+niche+"...");
    try {
        const res = await fetch("/api/fullcycle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({niche:niche,project:"default"})});
        const data = await res.json(); hideThinking();
        if (data.error) { addLog("error",data.error); }
        else {
            data.results.forEach((r,i) => {
                if(i>0){const s=document.createElement("div");s.className="chain-separator";s.textContent="▼ "+r.agent_icon+" "+r.agent_name;terminalEl.appendChild(s);}
                addTerminalBlock(i===0?"Scan: "+niche:"→ "+niche, parseResponse(r.response), {icon:r.agent_icon,name:r.agent_name,color:r.agent_color});
                if(!stats.agents_used.includes(r.agent)) stats.agents_used.push(r.agent);
            });
            addBusinessCard(niche, data.results, data.results);
            stats.messages += data.results.length;
            updateStats(); saveHistory();
            completeQuest("q1","Сканировать"); completeQuest("q2","Полный цикл"); completeQuest("q3","Бизнес-план");
            if(stats.agents_used.length>=3) completeQuest("q4","3+ агентов");
            addLog("success","🚀 Done: "+niche);
        }
    } catch(e) { hideThinking(); addLog("error",e.message); }
    setStatus("ready"); sendBtn.disabled = false; document.getElementById("nicheInput").disabled = false;
}

// CHAIN
async function runChain(ca, cn) {
    const text = inputEl.value.trim(); if(!text){addLog("warning","Введи задачу");inputEl.focus();return;}
    inputEl.value=""; sendBtn.disabled=true;
    addLog("info","🔗 "+cn); setStatus("chain","Chain..."); showThinking("🔗 Chain...");
    try {
        const res = await fetch("/api/chain",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,chain:ca,project:"default"})});
        const data = await res.json(); hideThinking();
        if(data.error){addLog("error",data.error);}
        else {
            data.results.forEach((r,i)=>{
                if(i>0){const s=document.createElement("div");s.className="chain-separator";s.textContent="▼ "+r.agent_icon+" "+r.agent_name;terminalEl.appendChild(s);}
                addTerminalBlock(i===0?text:"← continued", parseResponse(r.response), {icon:r.agent_icon,name:r.agent_name,color:r.agent_color});
                if(!stats.agents_used.includes(r.agent)) stats.agents_used.push(r.agent);
            });
            stats.messages+=data.results.length; stats.chains_run=(stats.chains_run||0)+1;
            updateStats(); saveHistory();
            if(stats.agents_used.length>=3) completeQuest("q4","3+ агентов");
            addLog("success","🔗 Done");
        }
    } catch(e){hideThinking();addLog("error",e.message);}
    setStatus("ready"); sendBtn.disabled=false; inputEl.focus();
}

// STATS
function updateStats() {
    const mc=document.getElementById("msgCount"); const au=document.getElementById("agentsUsed"); const pc=document.getElementById("plansCount");
    if(mc) mc.textContent=stats.messages; if(au) au.textContent=stats.agents_used.length; if(pc) pc.textContent=savedPlans.length;
    localStorage.setItem(STATS_KEY,JSON.stringify(stats));
}

// SAVE/LOAD
function saveHistory() {
    const b=[]; document.querySelectorAll(".term-block,.fullcycle-header,.chain-separator").forEach(e=>b.push(e.outerHTML));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(b));
}
function loadHistory() {
    const s=localStorage.getItem(STORAGE_KEY); if(!s) return;
    const b=JSON.parse(s); if(!b.length) return;
    b.forEach(h=>{const d=document.createElement("div");d.innerHTML=h;if(d.firstChild)terminalEl.appendChild(d.firstChild);});
    addLog("success","History ("+b.length+")"); terminalEl.scrollTop=terminalEl.scrollHeight;
}

// RESET
async function resetChat() {
    try{await fetch("/api/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:sessionId,project:"default"})});}catch(e){}
    sessionId=crypto.randomUUID(); localStorage.setItem(SESSION_KEY,sessionId);
    chatHistory=[]; localStorage.removeItem(STORAGE_KEY); savedPlans=[]; localStorage.setItem(PLANS_KEY,"[]");
    terminalEl.innerHTML=''; plansListEl.innerHTML='<div class="plans-empty" id="plansEmpty"><div class="empty-icon">📋</div><p>Пока нет планов</p></div>';
    document.getElementById("plansCardCount").textContent="0";
    const w=document.createElement("div");w.className="terminal-welcome";
    w.innerHTML='<pre class="ascii-art">\n ╔═══════════════════════════════════════════╗\n ║     AI  AGENT  ARMY  v5.0                ║\n ╚═══════════════════════════════════════════╝</pre>';
    terminalEl.appendChild(w); addLog("success","Reset");
}

// EXPORT
function exportChat() {
    const l=[]; document.querySelectorAll(".term-block").forEach(b=>{
        const c=b.querySelector(".term-command")?.innerText||""; const bg=b.querySelector(".agent-badge")?.innerText||"";
        const r=b.querySelector(".term-response")?.innerText||""; const t=b.querySelector(".term-time")?.textContent||"";
        l.push("["+t+"] ["+bg+"] > "+c+"\n\n"+r+"\n\n---\n");
    });
    if(!l.length){addLog("warning","Empty");return;}
    completeQuest("q5","Экспорт");
    const text="=== AI Agent Army v5 ===\n"+new Date().toLocaleString()+"\n\n"+l.join("\n");
    const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="army_"+new Date().toISOString().slice(0,10)+".txt";a.click();
    addLog("success","Exported");
}

function toggleSidebar(){document.getElementById("sidebar").classList.toggle("open");}
function handleKeyDown(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}

// INIT
loadAgents(); loadCommands(); loadHistory(); loadSavedPlans(); updateStats(); loadQuests();
