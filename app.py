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
        temperature=0.8,
        max_tokens=2000
    )


def clean_response(reply):
    if "<think>" in reply:
        parts = reply.split("</think>")
        if len(parts) > 1:
            reply = parts[-1].strip()
    return reply


AUTO_IDEAS_PROMPT = """Ты — генератор трендовых бизнес-идей. Сгенерируй ровно 7 актуальных бизнес-идей на 2025 год.

Для КАЖДОЙ идеи ответь СТРОГО в JSON формате. Верни JSON массив.

Критерии идей:
- Можно запустить одному человеку
- Бюджет старта до $500
- Потенциал дохода от $3000/мес
- Основаны на реальных трендах и болях людей
- Разнообразные ниши (не все про IT)

Формат ответа — ТОЛЬКО JSON массив, без другого текста:
[
  {
    "title": "Название идеи (коротко, 3-5 слов)",
    "niche": "Ниша (1-2 слова)",
    "problem": "Какую боль решает (1 предложение)",
    "solution": "Что делаем (1 предложение)",
    "format": "SaaS/Бот/Курс/Агентство/Маркетплейс/Приложение",
    "revenue": "$X/мес потенциал",
    "startup_cost": "$X",
    "time_to_mvp": "X недель",
    "difficulty": 1-5,
    "trend": "Почему сейчас актуально (1 предложение)",
    "first_step": "Первый шаг прямо сейчас (1 предложение)",
    "rating": 1-5
  }
]

Верни ТОЛЬКО JSON массив. Никакого другого текста."""


AGENTS = {
    "router": {
        "name": "Диспетчер",
        "icon": "🧠",
        "color": "#58a6ff",
        "prompt": """Определи лучшего агента. Ответь ТОЛЬКО JSON: {"agent": "id", "reason": "почему"}

Агенты: scanner (соцсети, боли), researcher (рынок), idea_generator (идеи), business_plan (план), strategist (стратегия), marketer (маркетинг), developer (код), sales (продажи)

Правила: "ниша/рынок" → researcher, "боли/соцсети" → scanner, "идеи" → idea_generator, "план" → business_plan, "стратегия" → strategist, "реклама/лендинг" → marketer, "код/MVP" → developer, "продажи/скрипт" → sales"""
    },
    "scanner": {
        "name": "Сканер соцсетей",
        "icon": "📡",
        "color": "#39d2c0",
        "prompt": """РОЛЬ: Аналитик соцсетей, 10 лет опыта.

[REDDIT] 5 subreddit-ов с жалобами и цитатами
[YOUTUBE] 5 тем с болями из комментариев
[TWITTER/X] 5 горячих тем
[TELEGRAM/ФОРУМЫ] 5 обсуждений
[GOOGLE TRENDS] 5 растущих запросов
[КАРТА БОЛЕЙ] Топ-10: боль, источники, частота, готовность платить
[ЗОЛОТЫЕ ВОЗМОЖНОСТИ] 3 ниши с болью 8+/10

Конкретные названия и цифры. Отвечай на языке пользователя."""
    },
    "idea_generator": {
        "name": "Генератор идей",
        "icon": "💡",
        "color": "#f59e0b",
        "prompt": """РОЛЬ: Серийный предприниматель, 15 стартапов.

5 бизнес-идей от лучшей к худшей. Для каждой:
- Боль (с цитатой), Решение, Формат, Аудитория, Рынок TAM
- Монетизация: Free / Basic / Pro с ценами
- CAC, LTV, маржа
- Конкуренты реальные
- MVP 14 дней
- Первые 100 клиентов

Бюджет до $500, одному человеку. Отвечай на языке пользователя."""
    },
    "business_plan": {
        "name": "Бизнес-планировщик",
        "icon": "📋",
        "color": "#8b5cf6",
        "prompt": """РОЛЬ: Консультант McKinsey, 20 лет.

[РЕЗЮМЕ] [ПРОБЛЕМА] [РЕШЕНИЕ] [РЫНОК] TAM/SAM/SOM
[БИЗНЕС-МОДЕЛЬ] 3 тарифа + unit-экономика
[MVP 14 ДНЕЙ] По дням
[МАРКЕТИНГ] 4 недели
[ФИНАНСЫ] По месяцам + точка безубыточности
[РИСКИ] 5 штук
[ДОРОЖНАЯ КАРТА]
[СЛЕДУЮЩИЙ ШАГ] Что сделать сегодня

Для 1 человека с $500. Отвечай на языке пользователя."""
    },
    "researcher": {
        "name": "Исследователь",
        "icon": "🔍",
        "color": "#3fb950",
        "prompt": """РОЛЬ: Аналитик рынка, 15 лет.

[СКАНИРОВАНИЕ] Размер, стадия, рост
[АУДИТОРИЯ] 3 сегмента
[КОНКУРЕНТЫ] 5 штук с ценами
[ТРЕНДЫ] 5 с цифрами
[БОЛИ] 5 с оценкой
[ВЫВОД] Входить или нет + план

Реальные компании. Отвечай на языке пользователя."""
    },
    "strategist": {
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "prompt": """РОЛЬ: Стратег, 50+ стартапов.

[ПРОБЛЕМА] [РЕШЕНИЕ] [МОДЕЛЬ] 3 тарифа
[UNIT-ЭКОНОМИКА] CAC, LTV, маржа
[MVP] 2 недели
[GROWTH] 0→100, 100→1000, 1000→10000
[РИСКИ] 3 + план B

Конкретные цифры. Отвечай на языке пользователя."""
    },
    "marketer": {
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "prompt": """РОЛЬ: Директор маркетинга, 30+ продуктов.

[ПОЗИЦИОНИРОВАНИЕ] УТП + слоган
[КАНАЛЫ] 5 с бюджетами
[КОНТЕНТ-ПЛАН] 14 дней
[ВОРОНКА] С конверсиями
[ЛЕНДИНГ] Полный текст
[ЗАПУСК] 7 дней
[МЕТРИКИ] 5 KPI

Тексты готовы к копированию. Отвечай на языке пользователя."""
    },
    "developer": {
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "prompt": """РОЛЬ: Full-stack, 12 лет.

[АРХИТЕКТУРА] [СТРУКТУРА] [КОД] рабочий
[API] бесплатные [ДЕПЛОЙ] пошагово [СРОКИ]

Python + Flask. Отвечай на языке пользователя."""
    },
    "sales": {
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "prompt": """РОЛЬ: Директор продаж, 1000+ сделок.

[ПРОДУКТ] [АВАТАР] [КОНТАКТ] 3 скрипта
[ПРЕЗЕНТАЦИЯ] 10 слайдов
[ВОЗРАЖЕНИЯ] 10 + ответы
[ЗАКРЫТИЕ] 5 техник
[FOLLOW-UP] 5 писем

Скрипты готовы к отправке. Отвечай на языке пользователя."""
    }
}


conversations = {}
projects = {}
last_request_time = {}
system_memory = {"niches_analyzed": [], "best_ideas": []}
cached_auto_ideas = {"ideas": [], "timestamp": 0}


def get_history(session_id):
    if session_id not in conversations:
        conversations[session_id] = []
    return conversations[session_id]


def get_project(project_id):
    if project_id not in projects:
        projects[project_id] = {"knowledge_base": [], "tasks_done": []}
    return projects[project_id]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/agents", methods=["GET"])
def get_agents():
    result = {}
    for key, agent in AGENTS.items():
        if key == "router":
            continue
        result[key] = {"name": agent["name"], "icon": agent["icon"], "color": agent["color"]}
    return jsonify(result)


@app.route("/api/auto-ideas", methods=["GET"])
def auto_ideas():
    global cached_auto_ideas

    now = time.time()
    if cached_auto_ideas["ideas"] and (now - cached_auto_ideas["timestamp"]) < 300:
        return jsonify({"ideas": cached_auto_ideas["ideas"], "cached": True})

    try:
        response = ask_llm([
            {"role": "system", "content": AUTO_IDEAS_PROMPT},
            {"role": "user", "content": "Сгенерируй 7 трендовых бизнес-идей на 2025 год. Разные ниши. ТОЛЬКО JSON массив."}
        ])

        text = clean_response(response.choices[0].message.content)

        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]

        ideas = json.loads(text)

        if isinstance(ideas, list) and len(ideas) > 0:
            cached_auto_ideas = {"ideas": ideas, "timestamp": now}
            return jsonify({"ideas": ideas, "cached": False})
        else:
            return jsonify({"ideas": [], "error": "Не удалось распарсить"}), 500

    except json.JSONDecodeError:
        return jsonify({"ideas": [], "error": "JSON parse error"}), 500
    except Exception as e:
        return jsonify({"ideas": [], "error": str(e)}), 500


@app.route("/api/expand-idea", methods=["POST"])
def expand_idea():
    data = request.json
    idea_title = data.get("title", "")
    idea_niche = data.get("niche", "")

    if not idea_title:
        return jsonify({"error": "Нет идеи"}), 400

    now = time.time()
    if "expand" in last_request_time:
        diff = now - last_request_time["expand"]
        if diff < 5:
            return jsonify({"error": "Подожди " + str(int(5 - diff)) + " сек."}), 429
    last_request_time["expand"] = now

    try:
        response = ask_llm([
            {"role": "system", "content": AGENTS["business_plan"]["prompt"]},
            {"role": "user", "content": "Создай детальный бизнес-план для идеи: " + idea_title + " в нише: " + idea_niche + ". Максимум деталей, цифр, конкретики."}
        ])
        reply = clean_response(response.choices[0].message.content)

        return jsonify({
            "response": reply,
            "agent_name": "Бизнес-планировщик",
            "agent_icon": "📋",
            "agent_color": "#8b5cf6",
            "status": "ok"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


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

    now = time.time()
    if session_id in last_request_time:
        diff = now - last_request_time[session_id]
        if diff < 3:
            return jsonify({"error": "Подожди " + str(int(3 - diff)) + " сек."}), 429
    last_request_time[session_id] = now

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

        if routed_agent == "scanner":
            system_memory["niches_analyzed"].append({"content": user_message[:100] + " | " + reply[:200], "timestamp": time.time()})
        if len(server_history) > 30:
            server_history[:] = server_history[-30:]

        result = {"response": reply, "agent": routed_agent, "agent_name": agent["name"], "agent_icon": agent["icon"], "agent_color": agent["color"], "status": "ok"}
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
                context = "\n\n[ПРЕДЫДУЩИЕ АГЕНТЫ]:\n"
                for r in results:
                    context += "\n--- " + r["agent_name"] + " ---\n" + r["response"][:1500] + "\n"
                context += "\n[ДОПОЛНИ]\n\n"

            messages = [{"role": "system", "content": agent["prompt"]}, {"role": "user", "content": context + user_message}]
            response = ask_llm(messages)
            reply = clean_response(response.choices[0].message.content)

            project["knowledge_base"].append({"agent": agent["name"], "agent_id": agent_id, "summary": reply[:500], "timestamp": time.time()})
            results.append({"agent": agent_id, "agent_name": agent["name"], "agent_icon": agent["icon"], "agent_color": agent["color"], "response": reply})
            time.sleep(2)
        except Exception as e:
            results.append({"agent": agent_id, "agent_name": agent["name"], "agent_icon": agent.get("icon", "?"), "agent_color": agent.get("color", "#fff"), "response": "Ошибка: " + str(e)})
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
        ("scanner", "Просканируй соцсети, найди боли в нише: " + niche),
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

            msg = custom_msg if custom_msg else "На основе данных выше, выполни задачу для: " + niche
            messages = [{"role": "system", "content": agent["prompt"]}, {"role": "user", "content": context + msg}]
            response = ask_llm(messages)
            reply = clean_response(response.choices[0].message.content)

            project["knowledge_base"].append({"agent": agent["name"], "agent_id": agent_id, "summary": reply[:500], "timestamp": time.time()})
            results.append({"agent": agent_id, "agent_name": agent["name"], "agent_icon": agent["icon"], "agent_color": agent["color"], "response": reply, "step": i + 1})
            time.sleep(2)
        except Exception as e:
            results.append({"agent": agent_id, "agent_name": agent["name"], "agent_icon": agent["icon"], "agent_color": agent["color"], "response": "Ошибка: " + str(e), "step": i + 1})
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
        {"title": "/fullcycle", "prompt": "", "desc": "🚀 Полный цикл"},
        {"title": "/research", "prompt": "Исследуй: ", "desc": "🔍 Рынок"},
        {"title": "/landing", "prompt": "Лендинг: ", "desc": "📝 Текст"},
        {"title": "/funnel", "prompt": "Воронка: ", "desc": "📢 Воронка"},
        {"title": "/script", "prompt": "Скрипт: ", "desc": "🤝 Продажи"},
        {"title": "/mvp", "prompt": "MVP: ", "desc": "💻 Код"}
    ])


if __name__ == "__main__":
    app.run(debug=True, port=5000)
