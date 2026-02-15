import os
import time
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ===== АГЕНТЫ =====

AGENTS = {
    "router": {
        "name": "Диспетчер",
        "icon": "🧠",
        "color": "#58a6ff",
        "prompt": """Ты — диспетчер AI-команды. Определи лучшего агента для задачи.

Агенты:
- researcher: анализ рынка, трендов, болей
- strategist: бизнес-планы, стратегии, монетизация
- marketer: контент, воронки, реклама
- developer: код, архитектура, MVP
- sales: скрипты продаж, переговоры

Ответь ТОЛЬКО JSON:
{"agent": "id", "reason": "почему"}"""
    },
    "scanner": {
        "name": "Сканер соцсетей",
        "icon": "📡",
        "color": "#39d2c0",
        "prompt": """Ты — AI-сканер социальных сетей и форумов. Ты имитируешь глубокий анализ данных из Reddit, YouTube, Twitter, Facebook, Telegram, форумов.

Когда получаешь нишу или тему, ты ДОЛЖЕН:

1. [REDDIT] Найди 5 реальных типичных жалоб/запросов из subreddit-ов по теме. Формат:
   - r/название — "цитата жалобы" (upvotes: число)
   
2. [YOUTUBE] Найди 5 популярных видео-тем с комментариями-болями:
   - "Название видео" — 100K views — боль из комментариев

3. [TWITTER/X] Найди 5 трендовых обсуждений:
   - "Твит/пост" — количество реакций — суть боли

4. [TELEGRAM/ФОРУМЫ] Найди 5 обсуждений из тематических чатов:
   - Чат/форум — "суть обсуждения" — количество участников

5. [GOOGLE TRENDS] Покажи 5 растущих поисковых запросов:
   - "запрос" — рост за год — объём

6. [КАРТА БОЛЕЙ] Сведи всё в топ-10 болей аудитории, отсортированных по частоте:
   Формат: Боль | Источники | Частота | Готовность платить (1-10)

7. [БИЗНЕС-ВОЗМОЖНОСТИ] На основе болей предложи 3 конкретные идеи продуктов/сервисов.

Будь максимально конкретным и реалистичным. Используй реальные названия subreddit-ов, каналов, форумов.
Давай цифры, даже приблизительные.
Отвечай на языке пользователя."""
    },
    "idea_generator": {
        "name": "Генератор идей",
        "icon": "💡",
        "color": "#f59e0b",
        "prompt": """Ты — AI генератор бизнес-идей. Ты получаешь данные от сканера соцсетей (боли аудитории) и создаёшь готовые бизнес-карточки.

Для КАЖДОЙ идеи создай карточку:

═══════════════════════════════
💡 ИДЕЯ: [Название]
═══════════════════════════════
▸ Проблема: [Какую боль решает]
▸ Решение: [Что делает продукт]
▸ Формат: [SaaS / Приложение / Сервис / Курс / Бот]
▸ Аудитория: [Кто клиент]
▸ Размер рынка: [Оценка в $]
▸ Монетизация: [Как зарабатывать]
▸ Средний чек: [$]
▸ Стоимость запуска: [$]
▸ Время до MVP: [недели]
▸ Конкуренты: [кто уже есть]
▸ Преимущество: [почему мы лучше]
▸ Первые 3 шага:
  1. [шаг]
  2. [шаг]
  3. [шаг]
▸ Потенциал: [⭐⭐⭐⭐⭐] (1-5 звёзд)
═══════════════════════════════

Создай 5 таких карточек, от самой перспективной к наименее.
Будь конкретным. Реальные цифры, реальные конкуренты.
Отвечай на языке пользователя."""
    },
    "business_plan": {
        "name": "Бизнес-планировщик",
        "icon": "📋",
        "color": "#8b5cf6",
        "prompt": """Ты — AI бизнес-планировщик. Ты создаёшь детальные бизнес-планы на основе идей.

СТРУКТУРА БИЗНЕС-ПЛАНА:

[РЕЗЮМЕ]
Краткое описание в 3 предложениях.

[ПРОБЛЕМА]
Детальное описание боли клиента с цифрами.

[РЕШЕНИЕ]
Что делает продукт. Ключевые функции (5 штук).

[РЫНОК]
- TAM (Total Addressable Market)
- SAM (Serviceable Addressable Market)
- SOM (Serviceable Obtainable Market)

[БИЗНЕС-МОДЕЛЬ]
- Модель монетизации
- Ценовые планы (3 тарифа)
- Unit-экономика: CAC, LTV, средний чек, маржа

[MVP — 2 НЕДЕЛИ]
День 1-3: [задачи]
День 4-7: [задачи]
День 8-10: [задачи]
День 11-14: [задачи]

[МАРКЕТИНГ]
- Каналы привлечения (5 штук с бюджетом)
- Контент-стратегия
- Первые 100 клиентов: пошаговый план

[ФИНАНСЫ]
- Месяц 1-3: прогноз
- Месяц 4-6: прогноз
- Месяц 7-12: прогноз
- Точка безубыточности

[КОМАНДА]
Кто нужен, какие роли, когда нанимать.

[РИСКИ]
Топ-5 рисков и митигация.

[ДОРОЖНАЯ КАРТА]
Месяц 1 → Месяц 3 → Месяц 6 → Месяц 12

Будь максимально конкретным. Цифры, сроки, бюджеты.
Отвечай на языке пользователя."""
    },
    "researcher": {
        "name": "Исследователь",
        "icon": "🔍",
        "color": "#3fb950",
        "prompt": """Ты — AI-исследователь рынка.

АЛГОРИТМ:
[СКАНИРОВАНИЕ] Определи нишу и её границы
[АУДИТОРИЯ] Кто клиенты? Их боли, желания, страхи.
[КОНКУРЕНТЫ] Кто уже работает? Сильные и слабые стороны.
[ТРЕНДЫ] Что растёт? Какие возможности?
[БОЛИ] Топ-5 проблем, за решение которых готовы платить.
[ВЫВОД] Структурированный отчёт.

Каждый блок начинай с метки в квадратных скобках.
Отвечай на языке пользователя."""
    },
    "strategist": {
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "prompt": """Ты — AI бизнес-стратег.

АЛГОРИТМ:
[ПРОБЛЕМА] Какую проблему решаем?
[РЕШЕНИЕ] Конкретный продукт/сервис
[МОДЕЛЬ] Монетизация
[UNIT-ЭКОНОМИКА] CAC, LTV, чек, маржа
[MVP] Что сделать за 2 недели
[ДОРОЖНАЯ КАРТА] План на 3 месяца
[РИСКИ] Топ-3 риска

Каждый блок начинай с метки в квадратных скобках.
Отвечай на языке пользователя."""
    },
    "marketer": {
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "prompt": """Ты — AI маркетолог.

АЛГОРИТМ:
[ПОЗИЦИОНИРОВАНИЕ] УТП, слоган
[КАНАЛЫ] Где продвигать? Бюджеты.
[КОНТЕНТ-ПЛАН] 2 недели контента
[ВОРОНКА] Путь клиента
[ЛЕНДИНГ] Текст лендинга
[ЗАПУСК] 7 дней по дням
[МЕТРИКИ] KPI

Каждый блок начинай с метки в квадратных скобках.
Отвечай на языке пользователя."""
    },
    "developer": {
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "prompt": """Ты — AI разработчик.

АЛГОРИТМ:
[АРХИТЕКТУРА] Стек технологий
[КОМПОНЕНТЫ] Модули/сервисы
[КОД] Ключевые фрагменты
[API] Интеграции
[ДЕПЛОЙ] Инструкция запуска
[ТЕСТЫ] Тестирование
[СРОКИ] Оценка времени

Каждый блок начинай с метки в квадратных скобках.
Отвечай на языке пользователя."""
    },
    "sales": {
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "prompt": """Ты — AI менеджер по продажам.

АЛГОРИТМ:
[ПРОДУКТ] Ценностное предложение
[АВАТАР] Идеальный клиент
[ПЕРВЫЙ КОНТАКТ] Скрипт
[ПРЕЗЕНТАЦИЯ] Структура
[ВОЗРАЖЕНИЯ] Топ-10 и ответы
[ЗАКРЫТИЕ] Техники
[FOLLOW-UP] 3 сообщения

Каждый блок начинай с метки в квадратных скобках.
Отвечай на языке пользователя."""
    }
}

conversations = {}
projects = {}
last_request_time = {}


def get_history(session_id):
    if session_id not in conversations:
        conversations[session_id] = []
    return conversations[session_id]


def get_project(project_id):
    if project_id not in projects:
        projects[project_id] = {"knowledge_base": [], "tasks_done": [], "scans": []}
    return projects[project_id]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/agents", methods=["GET"])
def get_agents():
    result = {}
    for key, agent in AGENTS.items():
        if key in ("router",):
            continue
        result[key] = {"name": agent["name"], "icon": agent["icon"], "color": agent["color"]}
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
            return jsonify({"error": f"Подожди {int(3 - diff)} сек."}), 429
    last_request_time[session_id] = now

    project = get_project(project_id)
    routed_agent = agent_id
    route_info = None

    if auto_route:
        try:
            route_response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": AGENTS["router"]["prompt"]},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.3,
                max_tokens=300
            )
            route_text = route_response.choices[0].message.content
            try:
                route_data = json.loads(route_text.strip().strip("```json").strip("```"))
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
                context += f"— {entry['agent']}: {entry['summary'][:200]}\n"
            context += "\n"

        enriched = context + user_message if context else user_message
        server_history.append({"role": "user", "content": enriched})

        messages = [{"role": "system", "content": agent["prompt"]}] + server_history

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=4096
        )

        reply = response.choices[0].message.content
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
            return jsonify({"error": "Подожди минуту — лимит запросов."}), 429
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
                    context += f"\n--- {r['agent_name']} ---\n{r['response'][:1000]}\n"
                context += "\n[ДОПОЛНИ И РАЗВЕЙ ЭТИ ДАННЫЕ]\n\n"

            messages = [
                {"role": "system", "content": agent["prompt"]},
                {"role": "user", "content": context + user_message}
            ]

            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                temperature=0.7,
                max_tokens=4096
            )

            reply = response.choices[0].message.content

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

            time.sleep(1)

        except Exception as e:
            results.append({
                "agent": agent_id,
                "agent_name": agent["name"],
                "agent_icon": agent.get("icon", "?"),
                "agent_color": agent.get("color", "#fff"),
                "response": f"Ошибка: {str(e)}"
            })
            break

    return jsonify({"results": results, "status": "ok"})


# Полный цикл: скан соцсетей → идеи → бизнес-план
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
        ("scanner", f"Просканируй соцсети и найди боли аудитории в нише: {niche}"),
        ("idea_generator", None),
        ("business_plan", None)
    ]

    for i, (agent_id, custom_msg) in enumerate(steps):
        agent = AGENTS[agent_id]

        try:
            context = ""
            if results:
                context = "\n\n[ДАННЫЕ ОТ ПРЕДЫДУЩИХ АГЕНТОВ]:\n"
                for r in results:
                    context += f"\n--- {r['agent_name']} ---\n{r['response'][:1500]}\n"
                context += "\n[НА ОСНОВЕ ЭТИХ ДАННЫХ ВЫПОЛНИ СВОЮ ЗАДАЧУ]\n\n"

            msg = custom_msg if custom_msg else f"На основе данных выше, выполни свою задачу для ниши: {niche}"

            messages = [
                {"role": "system", "content": agent["prompt"]},
                {"role": "user", "content": context + msg}
            ]

            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                temperature=0.7,
                max_tokens=4096
            )

            reply = response.choices[0].message.content

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

            time.sleep(1)

        except Exception as e:
            error_msg = str(e)
            if "rate_limit" in error_msg.lower() or "429" in error_msg:
                results.append({
                    "agent": agent_id,
                    "agent_name": agent["name"],
                    "agent_icon": agent["icon"],
                    "agent_color": agent["color"],
                    "response": "⏳ Лимит API. Подожди минуту и запусти снова.",
                    "step": i + 1
                })
            else:
                results.append({
                    "agent": agent_id,
                    "agent_name": agent["name"],
                    "agent_icon": agent["icon"],
                    "agent_color": agent["color"],
                    "response": f"Ошибка: {error_msg}",
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
    templates = [
        {"title": "/scan", "prompt": "Просканируй соцсети в нише: ", "desc": "📡 Анализ Reddit, YouTube, Twitter"},
        {"title": "/ideas", "prompt": "Сгенерируй бизнес-идеи для ниши: ", "desc": "💡 5 идей с карточками"},
        {"title": "/plan", "prompt": "Составь бизнес-план для: ", "desc": "📋 Детальный бизнес-план"},
        {"title": "/fullcycle", "prompt": "", "desc": "🚀 Полный цикл: скан → идеи → план"},
        {"title": "/research", "prompt": "Исследуй нишу: ", "desc": "🔍 Глубокий анализ рынка"},
        {"title": "/landing", "prompt": "Напиши лендинг для: ", "desc": "📝 Продающий текст"},
        {"title": "/funnel", "prompt": "Построй воронку для: ", "desc": "📢 Воронка продаж"},
        {"title": "/script", "prompt": "Скрипт продаж для: ", "desc": "🤝 Скрипт переговоров"},
        {"title": "/mvp", "prompt": "Спроектируй MVP для: ", "desc": "💻 Техническое решение"}
    ]
    return jsonify(templates)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
