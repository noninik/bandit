import os
import time
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODELS = {
    "smart": "llama-3.3-70b-versatile",
    "fast": "llama-3.1-8b-instant",
    "analytic": "gemma2-9b-it"
}


def ask_smart(messages):
    return client.chat.completions.create(
        model=MODELS["smart"],
        messages=messages,
        temperature=0.7,
        max_tokens=4096
    )


def ask_fast(messages):
    return client.chat.completions.create(
        model=MODELS["fast"],
        messages=messages,
        temperature=0.3,
        max_tokens=1000
    )


def ask_analytic(messages):
    return client.chat.completions.create(
        model=MODELS["analytic"],
        messages=messages,
        temperature=0.4,
        max_tokens=2000
    )


def clean_response(reply):
    if "<think>" in reply:
        parts = reply.split("</think>")
        if len(parts) > 1:
            reply = parts[-1].strip()
    return reply


def enhance_response(original_reply, user_message, agent_name):
    try:
        check = ask_fast([
            {"role": "system", "content": """Ты — контролёр качества. Проверь ответ AI-агента.

Если ответ хороший — верни его БЕЗ ИЗМЕНЕНИЙ.
Если чего-то не хватает — ДОПОЛНИ в конце блоком:

[ДОПОЛНЕНИЕ]
- то что упущено

Не переписывай ответ. Только дополни если нужно.
Отвечай на языке оригинального ответа."""},
            {"role": "user", "content": "Запрос: " + user_message[:200] + "\n\nАгент " + agent_name + " ответил:\n" + original_reply[:1500] + "\n\nПроверь и дополни если нужно."}
        ])
        addition = check.choices[0].message.content.strip()
        if "[ДОПОЛНЕНИЕ]" in addition:
            extra = addition.split("[ДОПОЛНЕНИЕ]")[-1].strip()
            if extra and len(extra) > 20:
                return original_reply + "\n\n[ДОПОЛНЕНИЕ от контролёра качества]\n" + extra
        return original_reply
    except Exception:
        return original_reply


def dual_analysis(user_message, agent_prompt):
    try:
        response1 = ask_smart([
            {"role": "system", "content": agent_prompt},
            {"role": "user", "content": user_message}
        ])
        answer1 = clean_response(response1.choices[0].message.content)

        response2 = ask_analytic([
            {"role": "system", "content": "Ты — аналитик. Прочитай ответ другого AI и добавь то, что он упустил. Если он всё покрыл — напиши 'Ответ полный'. Будь краток. Отвечай на языке ответа."},
            {"role": "user", "content": "Вопрос: " + user_message[:300] + "\n\nОтвет:\n" + answer1[:1500] + "\n\nЧто упущено?"}
        ])
        check = response2.choices[0].message.content.strip()

        if "полный" in check.lower() or "complete" in check.lower() or len(check) < 30:
            return answer1
        else:
            return answer1 + "\n\n[ДОПОЛНИТЕЛЬНЫЙ АНАЛИЗ]\n" + check

    except Exception:
        response = ask_smart([
            {"role": "system", "content": agent_prompt},
            {"role": "user", "content": user_message}
        ])
        return clean_response(response.choices[0].message.content)


AGENTS = {
    "router": {
        "name": "Диспетчер",
        "icon": "🧠",
        "color": "#58a6ff",
        "prompt": """Ты — диспетчер. Определи лучшего агента.

Агенты:
- scanner: соцсети, боли, Reddit/YouTube/Twitter
- researcher: анализ рынка и ниши
- idea_generator: бизнес-идеи
- business_plan: бизнес-план
- strategist: стратегия роста
- marketer: маркетинг, воронки
- developer: код, MVP
- sales: продажи, скрипты

Правила:
- "ниша", "рынок", "тренды" → researcher
- "боли", "соцсети", "Reddit" → scanner
- "идеи", "что создать" → idea_generator
- "план", "финансы" → business_plan
- "стратегия", "рост" → strategist
- "реклама", "контент", "лендинг" → marketer
- "код", "приложение", "MVP" → developer
- "продажи", "скрипт" → sales

Ответь ТОЛЬКО JSON:
{"agent": "id", "reason": "почему"}"""
    },
    "scanner": {
        "name": "Сканер соцсетей",
        "icon": "📡",
        "color": "#39d2c0",
        "dual": True,
        "prompt": """РОЛЬ: Лучший аналитик соцсетей, 10 лет опыта.

ФОРМАТ:

[REDDIT]
5 subreddit-ов:
- r/название (~подписчики)
- Жалоба: "цитата как пишут люди"
- Upvotes/комментарии
- Вывод для бизнеса

[YOUTUBE]
5 типов контента:
- Тема — просмотры — боль из комментариев

[TWITTER/X]
5 тем:
- Тренд — обсуждения — суть боли

[TELEGRAM/ФОРУМЫ]
5 тем:
- Сообщество — тема — участники

[GOOGLE TRENDS]
5 запросов:
- "запрос" — рост % — объём

[КАРТА БОЛЕЙ]
Топ-10:
| # | Боль | Источники | Частота | Готовность платить (1-10) |

[ЗОЛОТЫЕ ВОЗМОЖНОСТИ]
3 ниши с болью 8+/10 и готовностью платить 7+/10.

Конкретные названия и цифры. Отвечай на языке пользователя."""
    },
    "idea_generator": {
        "name": "Генератор идей",
        "icon": "💡",
        "color": "#f59e0b",
        "dual": True,
        "prompt": """РОЛЬ: Серийный предприниматель, 15 стартапов, 5 сделали $1M+.

5 бизнес-идей от лучшей к худшей:

═══════════════════════════════
ИДЕЯ #N: [Название]
Потенциал: (N/5)
═══════════════════════════════
- Боль: [с цитатой]
- Решение: [1 предложение]
- Формат: [SaaS/Бот/Курс/Маркетплейс]
- Для кого: [возраст, профессия, доход]
- Рынок: [TAM в $]
- Монетизация: Free / Basic $X/мес / Pro $X/мес
- CAC: $X | LTV: $X | Маржа: X%
- Конкуренты: [2-3 реальных + слабости]
- MVP 14 дней: по периодам
- Первые 100 клиентов: 3 канала
═══════════════════════════════

Бюджет до $500, одному человеку. Отвечай на языке пользователя."""
    },
    "business_plan": {
        "name": "Бизнес-планировщик",
        "icon": "📋",
        "color": "#8b5cf6",
        "dual": True,
        "prompt": """РОЛЬ: Консультант уровня McKinsey, 20 лет опыта.

[РЕЗЮМЕ] 3 предложения.
[ПРОБЛЕМА] Боль + масштаб + плохие решения.
[РЕШЕНИЕ] Продукт + 5 функций + отличия.
[РЫНОК] TAM/SAM/SOM + аватар.
[БИЗНЕС-МОДЕЛЬ] 3 тарифа + CAC, LTV, маржа.
[MVP 14 ДНЕЙ] По дням.
[МАРКЕТИНГ] 4 недели: канал, действие, бюджет, результат.
[ФИНАНСЫ] Месяц 1-3, 4-6, 7-12. Точка безубыточности.
[РИСКИ] 5 рисков + митигация.
[ДОРОЖНАЯ КАРТА] Месяц 1, 3, 6, 12.
[СЛЕДУЮЩИЙ ШАГ] Что сделать СЕГОДНЯ за 1 час.

Для 1 человека с $500. Отвечай на языке пользователя."""
    },
    "researcher": {
        "name": "Исследователь",
        "icon": "🔍",
        "color": "#3fb950",
        "dual": True,
        "prompt": """РОЛЬ: Аналитик рынка, 15 лет.

[СКАНИРОВАНИЕ] Размер в $, стадия, рост %.
[АУДИТОРИЯ] 3 сегмента: демография, боли, бюджет.
[КОНКУРЕНТЫ] 5 штук: выручка, сильные/слабые, цены.
[ТРЕНДЫ] 5 трендов с цифрами.
[БОЛИ] 5 проблем + готовность платить.
[ВЫВОД] Входить или нет + план.

Реальные компании и цифры. Отвечай на языке пользователя."""
    },
    "strategist": {
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "dual": False,
        "prompt": """РОЛЬ: Стратег, 50+ стартапов до $10M ARR.

[ПРОБЛЕМА] 1 предложение + масштаб.
[РЕШЕНИЕ] Продукт + 3 отличия.
[МОДЕЛЬ] 3 тарифа + upsell.
[UNIT-ЭКОНОМИКА] CAC, LTV, маржа, payback.
[MVP] 2 недели → первый платящий клиент.
[GROWTH] 0→100, 100→1000, 1000→10000.
[РИСКИ] 3 + план B.

Конкретные цифры. Отвечай на языке пользователя."""
    },
    "marketer": {
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "dual": False,
        "prompt": """РОЛЬ: Директор по маркетингу, 30+ продуктов.

[ПОЗИЦИОНИРОВАНИЕ] УТП + слоган.
[КАНАЛЫ] 5 каналов: бюджет, CAC, действия.
[КОНТЕНТ-ПЛАН] 14 дней.
[ВОРОНКА] С конверсиями.
[ЛЕНДИНГ] Hero, Problem, Solution, Benefits, CTA, FAQ.
[ЗАПУСК] 7 дней.
[МЕТРИКИ] 5 KPI.

Тексты готовы к копированию. Отвечай на языке пользователя."""
    },
    "developer": {
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "dual": False,
        "prompt": """РОЛЬ: Full-stack, 12 лет, быстрый MVP.

[АРХИТЕКТУРА] Стек + почему.
[СТРУКТУРА] Дерево файлов.
[КОД] Рабочий код.
[API] Бесплатные.
[ДЕПЛОЙ] Пошагово.
[СРОКИ] Задача → часы.

Python + Flask. Отвечай на языке пользователя."""
    },
    "sales": {
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "dual": False,
        "prompt": """РОЛЬ: Директор продаж, 1000+ сделок.

[ПРОДУКТ] Ценность.
[АВАТАР] Клиент.
[КОНТАКТ] 3 скрипта: email, LinkedIn, DM.
[ПРЕЗЕНТАЦИЯ] 10 слайдов.
[ВОЗРАЖЕНИЯ] 10 + ответы.
[ЗАКРЫТИЕ] 5 техник.
[FOLLOW-UP] 5 писем.

Скрипты готовы к отправке. Отвечай на языке пользователя."""
    }
}


conversations = {}
projects = {}
last_request_time = {}
system_memory = {
    "niches_analyzed": [],
    "best_ideas": []
}


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
        result[key] = {
            "name": agent["name"],
            "icon": agent["icon"],
            "color": agent["color"]
        }
    return jsonify(result)


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
                start = clean.find("{")
                end = clean.rfind("}") + 1
                if start >= 0 and end > start:
                    clean = clean[start:end]
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
            context = "\n\n[КОНТЕКСТ ПРОЕКТА]:\n"
            for entry in last_entries:
                context += "- " + entry["agent"] + ": " + entry["summary"][:300] + "\n"
            context += "\n"

        if system_memory["niches_analyzed"]:
            context += "[ПАМЯТЬ]:\n"
            for mem in system_memory["niches_analyzed"][-3:]:
                context += "- " + mem["content"][:200] + "\n"
            context += "\n"

        enriched = context + user_message if context else user_message

        use_dual = agent.get("dual", False)

        if use_dual:
            reply = dual_analysis(enriched, agent["prompt"])
        else:
            server_history.append({"role": "user", "content": enriched})
            messages = [{"role": "system", "content": agent["prompt"]}] + server_history
            response = ask_smart(messages)
            reply = clean_response(response.choices[0].message.content)

        if not use_dual:
            pass
        else:
            server_history.append({"role": "user", "content": enriched})

        server_history.append({"role": "assistant", "content": reply})

        project["knowledge_base"].append({
            "agent": agent["name"],
            "agent_id": routed_agent,
            "summary": reply[:500],
            "timestamp": time.time()
        })

        if routed_agent == "scanner":
            system_memory["niches_analyzed"].append({
                "content": "Ниша: " + user_message[:100] + " | " + reply[:200],
                "timestamp": time.time()
            })
        elif routed_agent == "idea_generator":
            system_memory["best_ideas"].append({
                "content": reply[:300],
                "timestamp": time.time()
            })

        if len(system_memory["niches_analyzed"]) > 20:
            system_memory["niches_analyzed"] = system_memory["niches_analyzed"][-20:]
        if len(system_memory["best_ideas"]) > 20:
            system_memory["best_ideas"] = system_memory["best_ideas"][-20:]
        if len(server_history) > 30:
            server_history[:] = server_history[-30:]

        models_used = "dual (llama-3.3-70b + gemma2-9b)" if use_dual else "llama-3.3-70b"

        result = {
            "response": reply,
            "agent": routed_agent,
            "agent_name": agent["name"],
            "agent_icon": agent["icon"],
            "agent_color": agent["color"],
            "models_used": models_used,
            "status": "ok"
        }
        if route_info:
            result["route_info"] = route_info

        return jsonify(result)

    except Exception as e:
        error_msg = str(e)
        if "rate_limit" in error_msg.lower() or "429" in error_msg:
            return jsonify({"error": "Подожди минуту — лимит."}), 429
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
                context = "\n\n[РЕЗУЛЬТАТЫ ПРЕДЫДУЩИХ АГЕНТОВ]:\n"
                for r in results:
                    context += "\n--- " + r["agent_name"] + " ---\n" + r["response"][:1500] + "\n"
                context += "\n[ДОПОЛНИ И РАЗВЕЙ]\n\n"

            full_message = context + user_message

            if agent.get("dual", False):
                reply = dual_analysis(full_message, agent["prompt"])
            else:
                messages = [
                    {"role": "system", "content": agent["prompt"]},
                    {"role": "user", "content": full_message}
                ]
                response = ask_smart(messages)
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
        ("scanner", "Просканируй соцсети и найди боли в нише: " + niche),
        ("idea_generator", None),
        ("business_plan", None)
    ]

    for i, (agent_id, custom_msg) in enumerate(steps):
        agent = AGENTS[agent_id]

        try:
            context = ""
            if results:
                context = "\n\n[ДАННЫЕ ПРЕДЫДУЩИХ АГЕНТОВ]:\n"
                for r in results:
                    context += "\n--- " + r["agent_name"] + " ---\n" + r["response"][:2000] + "\n"
                context += "\n[ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ]\n\n"

            if custom_msg:
                msg = custom_msg
            else:
                msg = "На основе данных выше выполни задачу для: " + niche

            full_message = context + msg

            if agent.get("dual", False):
                reply = dual_analysis(full_message, agent["prompt"])
            else:
                messages = [
                    {"role": "system", "content": agent["prompt"]},
                    {"role": "user", "content": full_message}
                ]
                response = ask_smart(messages)
                reply = clean_response(response.choices[0].message.content)

            project["knowledge_base"].append({
                "agent": agent["name"],
                "agent_id": agent_id,
                "summary": reply[:500],
                "timestamp": time.time()
            })

            system_memory["niches_analyzed"].append({
                "content": "Ниша: " + niche + " | " + agent["name"] + " | " + reply[:200],
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


@app.route("/api/memory", methods=["GET"])
def get_memory():
    return jsonify(system_memory)


@app.route("/api/templates", methods=["GET"])
def get_templates():
    templates = [
        {"title": "/scan", "prompt": "Просканируй соцсети в нише: ", "desc": "📡 Reddit, YouTube, Twitter"},
        {"title": "/ideas", "prompt": "Сгенерируй идеи для: ", "desc": "💡 5 идей"},
        {"title": "/plan", "prompt": "Бизнес-план для: ", "desc": "📋 План"},
        {"title": "/fullcycle", "prompt": "", "desc": "🚀 Скан + Идеи + План"},
        {"title": "/research", "prompt": "Исследуй нишу: ", "desc": "🔍 Анализ"},
        {"title": "/landing", "prompt": "Лендинг для: ", "desc": "📝 Текст"},
        {"title": "/funnel", "prompt": "Воронка для: ", "desc": "📢 Воронка"},
        {"title": "/script", "prompt": "Скрипт продаж для: ", "desc": "🤝 Продажи"},
        {"title": "/mvp", "prompt": "MVP для: ", "desc": "💻 Код"}
    ]
    return jsonify(templates)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
