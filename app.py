import os
import time
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODEL = "llama-3.3-70b-versatile"


# ========== LLM FUNCTIONS ==========

def ask_llm(messages):
    return client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=4096
    )


def ask_fast(messages):
    return client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.3,
        max_tokens=1000
    )


def clean_response(reply):
    if "<think>" in reply:
        parts = reply.split("</think>")
        if len(parts) > 1:
            reply = parts[-1].strip()
    return reply


# ========== PROMPTS ==========

AUTO_IDEAS_PROMPT = """Ты — генератор трендовых бизнес-идей. Сгенерируй ровно 7 актуальных бизнес-идей на 2025 год.

Критерии:
- Можно запустить одному человеку
- Бюджет старта до $500
- Потенциал от $3000/мес
- Основаны на реальных трендах и болях
- Разнообразные ниши

Ответь ТОЛЬКО JSON массив:
[
  {
    "title": "Название (3-5 слов)",
    "niche": "Ниша (1-2 слова)",
    "problem": "Боль (1 предложение)",
    "solution": "Решение (1 предложение)",
    "format": "SaaS/Бот/Курс/Агентство/Маркетплейс",
    "revenue": "$X/мес",
    "startup_cost": "$X",
    "time_to_mvp": "X недель",
    "difficulty": 3,
    "trend": "Почему актуально (1 предложение)",
    "first_step": "Первый шаг (1 предложение)",
    "rating": 4,
    "market_size": "$XM",
    "competition": "низкая/средняя/высокая"
  }
]

ТОЛЬКО JSON."""


DEBATE_PROMPT = """Ты ведёшь дебаты AI-команды. В команде 4 агента:
- 🎯 Стратег: оценивает бизнес-потенциал
- 📢 Маркетолог: оценивает продвижение и аудиторию  
- 💻 Разработчик: оценивает техническую сложность
- 🤝 Продажник: оценивает возможность продать

Когда получаешь бизнес-идею:

1. Каждый агент высказывает своё мнение (2-3 предложения)
2. Агенты спорят и критикуют друг друга
3. Находят компромисс
4. Выносят общий вердикт

Формат:

[РАУНД 1 — Первые мнения]

🎯 Стратег: "мнение"
📢 Маркетолог: "мнение"
💻 Разработчик: "мнение"
🤝 Продажник: "мнение"

[РАУНД 2 — Дебаты]

🎯 Стратег: "не согласен с... потому что..."
📢 Маркетолог: "но если посмотреть на..."
💻 Разработчик: "технически это значит..."
🤝 Продажник: "клиенты скажут что..."

[РАУНД 3 — Улучшения]

Каждый предлагает 1 улучшение идеи.

[ВЕРДИКТ]

Общая оценка: X/10
Главный риск: ...
Главное преимущество: ...
Рекомендация: запускать / доработать / отказаться
Первый шаг: ...

Пиши как реальный спор живых людей. С эмоциями, несогласием, аргументами.
Отвечай на языке пользователя."""


COMPARE_PROMPT = """Ты — аналитик. Сравни бизнес-идеи по критериям:

Для КАЖДОЙ идеи оцени от 1 до 10:
| Критерий | Идея 1 | Идея 2 | Идея 3 |
|----------|--------|--------|--------|
| Размер рынка | | | |
| Простота запуска | | | |
| Потенциал дохода | | | |
| Конкуренция (10=мало) | | | |
| Скорость до первых денег | | | |
| Масштабируемость | | | |
| Требуемые навыки (10=мало) | | | |
| Стартовый бюджет (10=мало) | | | |
| ИТОГО | | | |

После таблицы:

[ПОБЕДИТЕЛЬ]
Какая идея лучше и почему.

[ПОЧЕМУ НЕ ДРУГИЕ]
По 1 предложению почему остальные хуже.

[РЕКОМЕНДАЦИЯ]
Конкретный план действий для победителя.

Будь объективным. Конкретные аргументы. Отвечай на языке пользователя."""


# ========== AGENTS ==========

AGENTS = {
    "router": {
        "name": "Диспетчер",
        "icon": "🧠",
        "color": "#58a6ff",
        "prompt": """Определи агента. JSON: {"agent": "id", "reason": "почему"}
Агенты: scanner, researcher, idea_generator, business_plan, strategist, marketer, developer, sales, debater, comparator
- "спор/дебаты/обсудить" → debater
- "сравни/сравнение/что лучше" → comparator
- "ниша/рынок" → researcher
- "боли/соцсети" → scanner
- "идеи" → idea_generator
- "план" → business_plan
- "стратегия" → strategist
- "реклама/лендинг" → marketer
- "код/MVP" → developer
- "продажи/скрипт" → sales"""
    },
    "debater": {
        "name": "AI-Дебаты",
        "icon": "🗣",
        "color": "#f59e0b",
        "prompt": DEBATE_PROMPT
    },
    "comparator": {
        "name": "Сравнение",
        "icon": "⚖️",
        "color": "#8b5cf6",
        "prompt": COMPARE_PROMPT
    },
    "scanner": {
        "name": "Сканер соцсетей",
        "icon": "📡",
        "color": "#39d2c0",
        "prompt": """РОЛЬ: Аналитик соцсетей, 10 лет.
[REDDIT] 5 subreddit-ов с жалобами
[YOUTUBE] 5 тем с болями
[TWITTER/X] 5 горячих тем
[TELEGRAM/ФОРУМЫ] 5 обсуждений
[GOOGLE TRENDS] 5 запросов
[КАРТА БОЛЕЙ] Топ-10
[ЗОЛОТЫЕ ВОЗМОЖНОСТИ] 3 ниши 8+/10
Конкретика и цифры. Отвечай на языке пользователя."""
    },
    "idea_generator": {
        "name": "Генератор идей",
        "icon": "💡",
        "color": "#f59e0b",
        "prompt": """РОЛЬ: Серийный предприниматель, 15 стартапов.
5 идей: боль, решение, формат, аудитория, TAM, монетизация (3 тарифа), CAC/LTV, конкуренты, MVP 14 дней, первые 100 клиентов.
Бюджет до $500. Отвечай на языке пользователя."""
    },
    "business_plan": {
        "name": "Бизнес-план",
        "icon": "📋",
        "color": "#8b5cf6",
        "prompt": """РОЛЬ: McKinsey, 20 лет.
[РЕЗЮМЕ][ПРОБЛЕМА][РЕШЕНИЕ][РЫНОК] TAM/SAM/SOM [БИЗНЕС-МОДЕЛЬ] 3 тарифа + unit-экономика [MVP 14 ДНЕЙ] по дням [МАРКЕТИНГ] 4 недели [ФИНАНСЫ] по месяцам [РИСКИ] 5 штук [ДОРОЖНАЯ КАРТА][СЛЕДУЮЩИЙ ШАГ]
Для 1 человека с $500. Отвечай на языке пользователя."""
    },
    "researcher": {
        "name": "Исследователь",
        "icon": "🔍",
        "color": "#3fb950",
        "prompt": """РОЛЬ: Аналитик, 15 лет.
[СКАНИРОВАНИЕ] размер, рост [АУДИТОРИЯ] 3 сегмента [КОНКУРЕНТЫ] 5 штук [ТРЕНДЫ] 5 [БОЛИ] 5 [ВЫВОД] входить или нет.
Реальные компании. Отвечай на языке пользователя."""
    },
    "strategist": {
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "prompt": """РОЛЬ: Стратег, 50+ стартапов.
[ПРОБЛЕМА][РЕШЕНИЕ][МОДЕЛЬ] 3 тарифа [UNIT-ЭКОНОМИКА][MVP] 2 недели [GROWTH] 0→100→1000→10000 [РИСКИ] 3 + план B.
Конкретика. Отвечай на языке пользователя."""
    },
    "marketer": {
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "prompt": """РОЛЬ: Директор маркетинга, 30+ продуктов.
[ПОЗИЦИОНИРОВАНИЕ][КАНАЛЫ] 5 [КОНТЕНТ-ПЛАН] 14 дней [ВОРОНКА][ЛЕНДИНГ][ЗАПУСК] 7 дней [МЕТРИКИ] 5 KPI.
Готовые тексты. Отвечай на языке пользователя."""
    },
    "developer": {
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "prompt": """РОЛЬ: Full-stack, 12 лет.
[АРХИТЕКТУРА][СТРУКТУРА][КОД] рабочий [API][ДЕПЛОЙ][СРОКИ].
Python + Flask. Отвечай на языке пользователя."""
    },
    "sales": {
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "prompt": """РОЛЬ: Директор продаж, 1000+ сделок.
[ПРОДУКТ][АВАТАР][КОНТАКТ] 3 скрипта [ПРЕЗЕНТАЦИЯ] 10 слайдов [ВОЗРАЖЕНИЯ] 10 [ЗАКРЫТИЕ] 5 техник [FOLLOW-UP] 5 писем.
Готовые скрипты. Отвечай на языке пользователя."""
    }
}


# ========== LIVE DEBATE PROMPTS ==========

LIVE_DEBATERS = [
    {
        "id": "strategist",
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "prompt": """Ты — Стратег с 15-летним опытом запуска стартапов. Ты оцениваешь бизнес-потенциал идей.

Тебе дали бизнес-идею. Ты ПЕРВЫЙ высказываешься.

Правила:
- Говори от первого лица
- Будь эмоциональным, как живой человек
- Оцени: размер рынка, бизнес-модель, потенциал роста
- Укажи 1 главный плюс и 1 главный риск
- 3-5 предложений максимум
- Заверши фразой к другим: задай вопрос или брось вызов

Отвечай на языке пользователя."""
    },
    {
        "id": "marketer",
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "prompt": """Ты — Маркетолог, 10 лет в digital-маркетинге. Ты оцениваешь продвижение и аудиторию.

Тебе дали бизнес-идею. Ты видишь что сказал Стратег. Ты можешь СОГЛАСИТЬСЯ или СПОРИТЬ.

Правила:
- Говори от первого лица
- Реагируй на слова Стратега (согласись, поспорь, дополни)
- Оцени: целевая аудитория, каналы продвижения, стоимость привлечения
- Будь конкретным: "я бы запустил рекламу в...", "аудитория будет..."
- 3-5 предложений
- Заверши вопросом к Разработчику или Продажнику

Отвечай на языке пользователя."""
    },
    {
        "id": "developer",
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "prompt": """Ты — Разработчик, 12 лет full-stack. Ты оцениваешь техническую сложность.

Тебе дали бизнес-идею. Ты видишь что сказали Стратег и Маркетолог. Можешь СПОРИТЬ с ними.

Правила:
- Говори от первого лица
- Реагируй на предыдущих ("Стратег говорит X, но технически...")
- Оцени: сложность MVP, стек технологий, сроки, подводные камни
- Будь честным: если сложно — скажи прямо
- 3-5 предложений
- Заверши мнением: реально ли сделать MVP за 2 недели?

Отвечай на языке пользователя."""
    },
    {
        "id": "sales",
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "prompt": """Ты — Продажник, 1000+ закрытых сделок. Ты оцениваешь — купят ли это люди.

Тебе дали бизнес-идею. Ты видишь что сказали Стратег, Маркетолог и Разработчик.

Правила:
- Говори от первого лица
- Реагируй на ВСЕХ предыдущих, спорь или соглашайся
- Оцени: кто заплатит, сколько, как продавать, главное возражение
- Будь практичным: "я бы позвонил первым 10 клиентам и..."
- 3-5 предложений

Отвечай на языке пользователя."""
    }
]

ROUND2_PROMPTS = [
    {
        "id": "strategist",
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "prompt": "Ты Стратег. Ты услышал мнения всех. Ответь на критику, защити свою позицию или измени мнение. 2-3 предложения. Будь эмоциональным."
    },
    {
        "id": "marketer",
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "prompt": "Ты Маркетолог. Ты услышал всех. Спорь или соглашайся. Предложи 1 конкретное улучшение. 2-3 предложения."
    },
    {
        "id": "developer",
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "prompt": "Ты Разработчик. Ты услышал всех. Скажи что реально, а что нет. Предложи техническое решение. 2-3 предложения."
    },
    {
        "id": "sales",
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "prompt": "Ты Продажник. Финальное слово. Купят или нет? Что изменить чтобы продавалось? 2-3 предложения."
    }
]

VERDICT_PROMPT = """Ты — модератор дебатов. Ты видел спор 4 экспертов о бизнес-идее.

На основе ВСЕХ мнений вынеси вердикт:

Формат:
[ВЕРДИКТ]
Общая оценка: X/10
Главный риск: ...
Главное преимущество: ...
Рекомендация: запускать / доработать / отказаться
Первый конкретный шаг: ...
Кто был прав больше всех: ...

Будь объективным. 3-5 предложений. Отвечай на языке пользователя."""


# ========== STATE ==========

conversations = {}
projects = {}
last_request_time = {}
system_memory = {"niches_analyzed": [], "best_ideas": []}
cached_auto_ideas = {"ideas": [], "timestamp": 0}
niche_ratings = []


# ========== HELPERS ==========

def get_history(session_id):
    if session_id not in conversations:
        conversations[session_id] = []
    return conversations[session_id]


def get_project(project_id):
    if project_id not in projects:
        projects[project_id] = {"knowledge_base": [], "tasks_done": []}
    return projects[project_id]


def add_niche_rating(idea):
    global niche_ratings
    rating_entry = {
        "title": idea.get("title", ""),
        "niche": idea.get("niche", ""),
        "rating": idea.get("rating", 3),
        "revenue": idea.get("revenue", "$0"),
        "difficulty": idea.get("difficulty", 3),
        "competition": idea.get("competition", "средняя"),
        "market_size": idea.get("market_size", "$0"),
        "format": idea.get("format", ""),
        "timestamp": time.time()
    }
    niche_ratings.append(rating_entry)
    niche_ratings.sort(key=lambda x: x.get("rating", 0), reverse=True)
    if len(niche_ratings) > 50:
        niche_ratings = niche_ratings[:50]


def check_rate_limit(key, cooldown=5):
    now = time.time()
    if key in last_request_time:
        diff = now - last_request_time[key]
        if diff < cooldown:
            return False, int(cooldown - diff)
    last_request_time[key] = now
    return True, 0


# ========== ROUTES ==========

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/agents", methods=["GET"])
def get_agents():
    result = {}
    for key, agent in AGENTS.items():
        if key == "router":
            continue
        result[key] = {
            "name": agent["name"],
            "icon": agent["icon"],
            "color": agent["color"]
        }
    return jsonify(result)


@app.route("/api/auto-ideas", methods=["GET"])
def auto_ideas():
    global cached_auto_ideas

    now = time.time()
    if cached_auto_ideas["ideas"] and (now - cached_auto_ideas["timestamp"]) < 120:
        return jsonify({"ideas": cached_auto_ideas["ideas"], "cached": True})

    try:
        response = ask_llm([
            {"role": "system", "content": AUTO_IDEAS_PROMPT},
            {"role": "user", "content": "Сгенерируй 7 трендовых бизнес-идей на 2025 год. Разные ниши. ТОЛЬКО JSON."}
        ])
        text = clean_response(response.choices[0].message.content)
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]
        ideas = json.loads(text)
        if isinstance(ideas, list) and len(ideas) > 0:
            cached_auto_ideas = {"ideas": ideas, "timestamp": now}
            for idea in ideas:
                add_niche_rating(idea)
            return jsonify({"ideas": ideas, "cached": False})
        return jsonify({"ideas": [], "error": "Parse error"}), 500
    except json.JSONDecodeError:
        return jsonify({"ideas": [], "error": "JSON error"}), 500
    except Exception as e:
        return jsonify({"ideas": [], "error": str(e)}), 500


@app.route("/api/expand-idea", methods=["POST"])
def expand_idea():
    data = request.json
    idea_title = data.get("title", "")
    idea_niche = data.get("niche", "")

    if not idea_title:
        return jsonify({"error": "Нет идеи"}), 400

    allowed, wait = check_rate_limit("expand")
    if not allowed:
        return jsonify({"error": "Подожди " + str(wait) + " сек."}), 429

    try:
        response = ask_llm([
            {"role": "system", "content": AGENTS["business_plan"]["prompt"]},
            {"role": "user", "content": "Детальный бизнес-план для: " + idea_title + " в нише: " + idea_niche}
        ])
        reply = clean_response(response.choices[0].message.content)
        return jsonify({
            "response": reply,
            "agent_name": "Бизнес-план",
            "agent_icon": "📋",
            "agent_color": "#8b5cf6",
            "status": "ok"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/debate", methods=["POST"])
def debate():
    data = request.json
    idea = data.get("idea", "").strip()

    if not idea:
        return jsonify({"error": "Укажи идею"}), 400

    allowed, wait = check_rate_limit("debate")
    if not allowed:
        return jsonify({"error": "Подожди " + str(wait) + " сек."}), 429

    try:
        response = ask_llm([
            {"role": "system", "content": DEBATE_PROMPT},
            {"role": "user", "content": "Обсудите эту бизнес-идею командой: " + idea}
        ])
        reply = clean_response(response.choices[0].message.content)
        return jsonify({
            "response": reply,
            "agent_name": "AI-Дебаты",
            "agent_icon": "🗣",
            "agent_color": "#f59e0b",
            "status": "ok"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/debate-live", methods=["POST"])
def debate_live():
    data = request.json
    idea = data.get("idea", "").strip()

    if not idea:
        return jsonify({"error": "Укажи идею"}), 400

    allowed, wait = check_rate_limit("debate_live")
    if not allowed:
        return jsonify({"error": "Подожди " + str(wait) + " сек."}), 429

    results = []
    conversation = []

    try:
        # ===== РАУНД 1 — Первые мнения =====
        for debater in LIVE_DEBATERS:
            context = ""
            if conversation:
                context = "\n\nЧто сказали до тебя:\n"
                for prev in conversation:
                    context += prev["icon"] + " " + prev["name"] + ": " + prev["text"] + "\n"

            messages = [
                {"role": "system", "content": debater["prompt"]},
                {"role": "user", "content": "Бизнес-идея: " + idea + context}
            ]

            response = ask_fast(messages)
            reply = clean_response(response.choices[0].message.content)

            conversation.append({
                "name": debater["name"],
                "icon": debater["icon"],
                "text": reply
            })

            results.append({
                "agent_id": debater["id"],
                "agent_name": debater["name"],
                "agent_icon": debater["icon"],
                "agent_color": debater["color"],
                "response": reply,
                "round": 1
            })

            time.sleep(1)

        # ===== РАУНД 2 — Дебаты и спор =====
        full_context = "\n\nВся дискуссия:\n"
        for prev in conversation:
            full_context += prev["icon"] + " " + prev["name"] + ": " + prev["text"] + "\n"

        for r2 in ROUND2_PROMPTS:
            messages = [
                {"role": "system", "content": r2["prompt"] + "\nОтвечай на языке пользователя."},
                {"role": "user", "content": "Идея: " + idea + full_context}
            ]

            response = ask_fast(messages)
            reply = clean_response(response.choices[0].message.content)

            conversation.append({
                "name": r2["name"],
                "icon": r2["icon"],
                "text": reply
            })

            results.append({
                "agent_id": r2["id"],
                "agent_name": r2["name"],
                "agent_icon": r2["icon"],
                "agent_color": r2["color"],
                "response": reply,
                "round": 2
            })

            time.sleep(1)

        # ===== РАУНД 3 — Вердикт =====
        full_debate = "\n\nПолная дискуссия:\n"
        for prev in conversation:
            full_debate += prev["icon"] + " " + prev["name"] + ": " + prev["text"] + "\n"

        verdict_messages = [
            {"role": "system", "content": VERDICT_PROMPT},
            {"role": "user", "content": "Идея: " + idea + full_debate}
        ]

        verdict_response = ask_fast(verdict_messages)
        verdict_reply = clean_response(verdict_response.choices[0].message.content)

        results.append({
            "agent_id": "verdict",
            "agent_name": "Вердикт",
            "agent_icon": "⚖️",
            "agent_color": "#8b5cf6",
            "response": verdict_reply,
            "round": 3
        })

        return jsonify({
            "results": results,
            "idea": idea,
            "status": "ok"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/compare", methods=["POST"])
def compare():
    data = request.json
    ideas = data.get("ideas", [])

    if len(ideas) < 2:
        return jsonify({"error": "Выбери минимум 2 идеи"}), 400

    allowed, wait = check_rate_limit("compare")
    if not allowed:
        return jsonify({"error": "Подожди " + str(wait) + " сек."}), 429

    ideas_text = ""
    for i, idea in enumerate(ideas):
        ideas_text += "\nИдея " + str(i + 1) + ": " + idea.get("title", "") + " (ниша: " + idea.get("niche", "") + ")"

    try:
        response = ask_llm([
            {"role": "system", "content": COMPARE_PROMPT},
            {"role": "user", "content": "Сравни эти бизнес-идеи:" + ideas_text}
        ])
        reply = clean_response(response.choices[0].message.content)
        return jsonify({
            "response": reply,
            "agent_name": "Сравнение",
            "agent_icon": "⚖️",
            "agent_color": "#8b5cf6",
            "status": "ok"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/niche-ratings", methods=["GET"])
def get_niche_ratings():
    return jsonify({"ratings": niche_ratings})


@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    total_ideas = len(niche_ratings)
    niches = {}
    for r in niche_ratings:
        n = r.get("niche", "Другое")
        if n not in niches:
            niches[n] = 0
        niches[n] += 1

    top_niches = sorted(niches.items(), key=lambda x: x[1], reverse=True)[:10]

    avg_rating = 0
    if niche_ratings:
        avg_rating = round(sum(r.get("rating", 0) for r in niche_ratings) / len(niche_ratings), 1)

    formats = {}
    for r in niche_ratings:
        f = r.get("format", "Другое")
        if f not in formats:
            formats[f] = 0
        formats[f] += 1

    return jsonify({
        "total_ideas": total_ideas,
        "top_niches": top_niches,
        "avg_rating": avg_rating,
        "formats": formats,
        "top_rated": niche_ratings[:5] if niche_ratings else [],
        "total_messages": sum(len(h) for h in conversations.values()),
        "total_projects": len(projects)
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message", "").strip()
    session_id = data.get("session_id", "default")
    agent_id = data.get("agent", "strategist")
    project_id = data.get("project", "default")
    history_from_client = data.get("history", [])
    auto_route = data.get("auto_route", False)

    if not user_message:
        return jsonify({"error": "Пустое сообщение"}), 400

    allowed, wait = check_rate_limit(session_id, 3)
    if not allowed:
        return jsonify({"error": "Подожди " + str(wait) + " сек."}), 429

    project = get_project(project_id)
    routed_agent = agent_id
    route_info = None

    if auto_route:
        try:
            route_response = ask_fast([
                {"role": "system", "content": AGENTS["router"]["prompt"]},
                {"role": "user", "content": user_message}
            ])
            route_text = route_response.choices[0].message.content
            try:
                clean = route_text.strip()
                if "<think>" in clean:
                    clean = clean.split("</think>")[-1].strip()
                s = clean.find("{")
                e = clean.rfind("}") + 1
                if s >= 0 and e > s:
                    clean = clean[s:e]
                route_data = json.loads(clean)
                if "agent" in route_data:
                    routed_agent = route_data["agent"]
                    route_info = route_data
            except json.JSONDecodeError:
                pass
        except Exception:
            pass

    agent = AGENTS.get(routed_agent, AGENTS["strategist"])

    try:
        server_history = get_history(session_id)
        if not server_history and history_from_client:
            server_history.extend(history_from_client)
            conversations[session_id] = server_history

        context = ""
        if project["knowledge_base"]:
            last_entries = project["knowledge_base"][-5:]
            context = "\n\n[КОНТЕКСТ]:\n"
            for entry in last_entries:
                context += "- " + entry["agent"] + ": " + entry["summary"][:300] + "\n"
            context += "\n"

        enriched = context + user_message if context else user_message
        server_history.append({"role": "user", "content": enriched})

        messages = [{"role": "system", "content": agent["prompt"]}] + server_history
        response = ask_llm(messages)
        reply = clean_response(response.choices[0].message.content)

        server_history.append({"role": "assistant", "content": reply})
        project["knowledge_base"].append({
            "agent": agent["name"],
            "agent_id": routed_agent,
            "summary": reply[:500],
            "timestamp": time.time()
        })

        if len(server_history) > 30:
            server_history[:] = server_history[-30:]

        result = {
            "response": reply,
            "agent": routed_agent,
            "agent_name": agent["name"],
            "agent_icon": agent["icon"],
            "agent_color": agent["color"],
            "status": "ok"
        }
        if route_info:
            result["route_info"] = route_info
        return jsonify(result)

    except Exception as e:
        error_msg = str(e)
        if "rate_limit" in error_msg.lower() or "429" in error_msg:
            return jsonify({"error": "Подожди минуту."}), 429
        return jsonify({"error": error_msg}), 500


@app.route("/api/chain", methods=["POST"])
def chain():
    data = request.json
    user_message = data.get("message", "").strip()
    chain_agents = data.get("chain", [])
    project_id = data.get("project", "default")

    if not user_message:
        return jsonify({"error": "Пустое сообщение"}), 400

    project = get_project(project_id)
    results = []

    for agent_id in chain_agents:
        agent = AGENTS.get(agent_id)
        if not agent:
            continue
        try:
            context = ""
            if results:
                context = "\n\n[ПРЕДЫДУЩИЕ]:\n"
                for r in results:
                    context += "\n--- " + r["agent_name"] + " ---\n" + r["response"][:1500] + "\n"
                context += "\n[ДОПОЛНИ]\n\n"
            messages = [
                {"role": "system", "content": agent["prompt"]},
                {"role": "user", "content": context + user_message}
            ]
            response = ask_llm(messages)
            reply = clean_response(response.choices[0].message.content)
            project["knowledge_base"].append({
                "agent": agent["name"],
                "agent_id": agent_id,
                "summary": reply[:500],
                "timestamp": time.time()
            })
            results.append({
                "agent": agent_id,
                "agent_name": agent["name"],
                "agent_icon": agent["icon"],
                "agent_color": agent["color"],
                "response": reply
            })
            time.sleep(2)
        except Exception as e:
            results.append({
                "agent": agent_id,
                "agent_name": agent["name"],
                "agent_icon": agent.get("icon", "?"),
                "agent_color": agent.get("color", "#fff"),
                "response": "Ошибка: " + str(e)
            })
            break

    return jsonify({"results": results, "status": "ok"})


@app.route("/api/fullcycle", methods=["POST"])
def fullcycle():
    data = request.json
    niche = data.get("niche", "").strip()
    project_id = data.get("project", "default")

    if not niche:
        return jsonify({"error": "Укажи нишу"}), 400

    project = get_project(project_id)
    results = []

    steps = [
        ("scanner", "Просканируй соцсети, найди боли: " + niche),
        ("idea_generator", None),
        ("business_plan", None)
    ]

    for i, (agent_id, custom_msg) in enumerate(steps):
        agent = AGENTS[agent_id]
        try:
            context = ""
            if results:
                context = "\n\n[ДАННЫЕ]:\n"
                for r in results:
                    context += "\n--- " + r["agent_name"] + " ---\n" + r["response"][:2000] + "\n"
                context += "\n[ИСПОЛЬЗУЙ]\n\n"
            msg = custom_msg if custom_msg else "На основе данных, задача для: " + niche
            messages = [
                {"role": "system", "content": agent["prompt"]},
                {"role": "user", "content": context + msg}
            ]
            response = ask_llm(messages)
            reply = clean_response(response.choices[0].message.content)
            project["knowledge_base"].append({
                "agent": agent["name"],
                "agent_id": agent_id,
                "summary": reply[:500],
                "timestamp": time.time()
            })
            results.append({
                "agent": agent_id,
                "agent_name": agent["name"],
                "agent_icon": agent["icon"],
                "agent_color": agent["color"],
                "response": reply,
                "step": i + 1
            })
            time.sleep(2)
        except Exception as e:
            results.append({
                "agent": agent_id,
                "agent_name": agent["name"],
                "agent_icon": agent["icon"],
                "agent_color": agent["color"],
                "response": "Ошибка: " + str(e),
                "step": i + 1
            })
            break

    return jsonify({"results": results, "niche": niche, "status": "ok"})


@app.route("/api/reset", methods=["POST"])
def reset():
    data = request.json
    session_id = data.get("session_id", "default")
    project_id = data.get("project", None)
    if session_id in conversations:
        del conversations[session_id]
    if project_id and project_id in projects:
        del projects[project_id]
    return jsonify({"status": "reset"})


@app.route("/api/templates", methods=["GET"])
def get_templates():
    return jsonify([
        {"title": "/scan", "prompt": "Просканируй соцсети: ", "desc": "📡 Соцсети"},
        {"title": "/ideas", "prompt": "Идеи для: ", "desc": "💡 Идеи"},
        {"title": "/plan", "prompt": "Бизнес-план: ", "desc": "📋 План"},
        {"title": "/debate", "prompt": "Обсудите командой идею: ", "desc": "🗣 Дебаты"},
        {"title": "/compare", "prompt": "Сравни идеи: ", "desc": "⚖️ Сравнение"},
        {"title": "/fullcycle", "prompt": "", "desc": "🚀 Полный цикл"},
        {"title": "/research", "prompt": "Исследуй: ", "desc": "🔍 Рынок"},
        {"title": "/landing", "prompt": "Лендинг: ", "desc": "📝 Текст"},
        {"title": "/mvp", "prompt": "MVP: ", "desc": "💻 Код"}
    ])


# ========== RUN ==========

if __name__ == "__main__":
    app.run(debug=True, port=5000)
