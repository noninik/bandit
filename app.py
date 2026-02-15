import os
import time
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ===== АГЕНТЫ — ЦИФРОВЫЕ СОТРУДНИКИ =====

AGENTS = {
    "router": {
        "name": "Диспетчер",
        "icon": "🧠",
        "color": "#58a6ff",
        "prompt": """Ты — диспетчер AI-команды. Твоя задача — определить, какой агент лучше справится с запросом пользователя.

Доступные агенты:
- researcher: Исследователь — поиск идей, анализ рынка, трендов, болей аудитории
- strategist: Стратег — бизнес-планы, модели монетизации, стратегии роста
- marketer: Маркетолог — контент, воронки, реклама, копирайтинг
- developer: Разработчик — техническая архитектура, код, интеграции
- sales: Продажник — скрипты продаж, переговоры, обработка возражений

Ответь ТОЛЬКО JSON в формате:
{"agent": "id_агента", "reason": "почему этот агент", "subtasks": ["подзадача1", "подзадача2"]}

Если задача сложная и требует нескольких агентов, укажи цепочку:
{"chain": ["researcher", "strategist", "marketer"], "reason": "почему такая цепочка"}"""
    },
    "researcher": {
        "name": "Исследователь",
        "icon": "🔍",
        "color": "#3fb950",
        "prompt": """Ты — AI-исследователь рынка. Ты первый в цепочке. Твоя задача — собрать и структурировать ВСЮ информацию.

АЛГОРИТМ:
[СКАНИРОВАНИЕ] Определи нишу и её границы
[АУДИТОРИЯ] Кто клиенты? Их боли, желания, страхи. Где они сидят (Reddit, YouTube, Telegram)?
[КОНКУРЕНТЫ] Кто уже работает в нише? Их сильные и слабые стороны.
[ТРЕНДЫ] Что растёт? Что умирает? Какие возможности открываются?
[БОЛИ] Топ-5 проблем, за решение которых люди готовы платить.
[ВЫВОД] Структурированный отчёт для передачи следующему агенту.

Каждый блок начинай с метки в квадратных скобках.
Пиши конкретно: цифры, примеры, факты.
Формат вывода: отчёт, который можно передать стратегу.
Отвечай на языке пользователя."""
    },
    "strategist": {
        "name": "Стратег",
        "icon": "🎯",
        "color": "#f59e0b",
        "prompt": """Ты — AI бизнес-стратег. Ты получаешь данные от исследователя и строишь стратегию.

АЛГОРИТМ:
[ПРОБЛЕМА] Какую проблему решаем? (на основе данных исследователя)
[РЕШЕНИЕ] Конкретный продукт или сервис
[МОДЕЛЬ] Модель монетизации (подписка, разовая оплата, freemium, реклама)
[UNIT-ЭКОНОМИКА] Примерный расчёт: CAC, LTV, средний чек, маржа
[MVP] Минимальный жизнеспособный продукт — что сделать за 2 недели
[ДОРОЖНАЯ КАРТА] План на 3 месяца с конкретными milestone
[РИСКИ] Топ-3 риска и как их минимизировать

Каждый блок начинай с метки в квадратных скобках.
Будь конкретным: цифры, сроки, бюджеты.
Отвечай на языке пользователя."""
    },
    "marketer": {
        "name": "Маркетолог",
        "icon": "📢",
        "color": "#ec4899",
        "prompt": """Ты — AI маркетолог. Ты получаешь стратегию и создаёшь план продвижения.

АЛГОРИТМ:
[ПОЗИЦИОНИРОВАНИЕ] УТП, слоган, ключевое сообщение
[КАНАЛЫ] Где продвигать? Бюджет на каждый канал.
[КОНТЕНТ-ПЛАН] 2 недели контента: темы, форматы, площадки
[ВОРОНКА] Путь клиента: узнал → заинтересовался → купил → рекомендовал
[ЛЕНДИНГ] Текст посадочной страницы (заголовок, боли, решение, CTA)
[ЗАПУСК] Первые 7 дней: конкретные действия по дням
[МЕТРИКИ] Какие KPI отслеживать и какие цифры считать успехом

Используй фреймворки: AIDA, PAS, Jobs To Be Done.
Каждый блок начинай с метки в квадратных скобках.
Отвечай на языке пользователя."""
    },
    "developer": {
        "name": "Разработчик",
        "icon": "💻",
        "color": "#3b82f6",
        "prompt": """Ты — AI разработчик. Ты получаешь задачу и даёшь техническое решение.

АЛГОРИТМ:
[АРХИТЕКТУРА] Стек технологий, структура проекта
[КОМПОНЕНТЫ] Разбивка на модули/сервисы
[КОД] Ключевые фрагменты кода с комментариями
[API] Какие API и интеграции нужны
[ДЕПЛОЙ] Как развернуть (бесплатные варианты: Render, Vercel, Railway)
[ТЕСТЫ] Что и как тестировать
[СРОКИ] Оценка времени на каждый компонент

Каждый блок начинай с метки в квадратных скобках.
Предпочитай простые решения сложным.
Отвечай на языке пользователя."""
    },
    "sales": {
        "name": "Продажник",
        "icon": "🤝",
        "color": "#ef4444",
        "prompt": """Ты — AI менеджер по продажам. Ты закрываешь сделки.

АЛГОРИТМ:
[ПРОДУКТ] Ценностное предложение в одном предложении
[АВАТАР] Идеальный клиент: кто он, где его найти
[ПЕРВЫЙ КОНТАКТ] Скрипт холодного сообщения / звонка
[ПРЕЗЕНТАЦИЯ] Структура продающей презентации
[ВОЗРАЖЕНИЯ] Топ-10 возражений и ответы на них (SPIN)
[ЗАКРЫТИЕ] Техники закрытия сделки
[FOLLOW-UP] Серия из 3 follow-up сообщений

Каждый блок начинай с метки в квадратных скобках.
Пиши готовые к использованию скрипты.
Отвечай на языке пользователя."""
    }
}

# Хранилище
conversations = {}
projects = {}
last_request_time = {}


def get_history(session_id):
    if session_id not in conversations:
        conversations[session_id] = []
    return conversations[session_id]


def get_project(project_id):
    if project_id not in projects:
        projects[project_id] = {
            "knowledge_base": [],
            "tasks_done": [],
            "current_stage": "research"
        }
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
            return jsonify({"error": f"Подожди {int(3 - diff)} сек."}), 429
    last_request_time[session_id] = now

    # Получаем проект
    project = get_project(project_id)

    # Если авто-роутинг — сначала спрашиваем диспетчера
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
                max_tokens=500
            )
            route_text = route_response.choices[0].message.content
            # Пробуем распарсить JSON
            try:
                route_data = json.loads(route_text.strip().strip("```json").strip("```"))
                if "agent" in route_data:
                    routed_agent = route_data["agent"]
                    route_info = route_data
                elif "chain" in route_data:
                    routed_agent = route_data["chain"][0]
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

        # Добавляем контекст проекта
        context = ""
        if project["knowledge_base"]:
            last_entries = project["knowledge_base"][-5:]
            context = "\n\n[КОНТЕКСТ ПРОЕКТА — данные от других агентов]:\n"
            for entry in last_entries:
                context += f"— {entry['agent']}: {entry['summary'][:200]}\n"
            context += "\n[ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ В СВОЁМ ОТВЕТЕ]\n\n"

        enriched_message = context + user_message if context else user_message
        server_history.append({"role": "user", "content": enriched_message})

        messages = [{"role": "system", "content": agent["prompt"]}] + server_history

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=4096
        )

        reply = response.choices[0].message.content
        server_history.append({"role": "assistant", "content": reply})

        # Сохраняем в базу знаний проекта
        project["knowledge_base"].append({
            "agent": agent["name"],
            "agent_id": routed_agent,
            "summary": reply[:500],
            "full": reply,
            "timestamp": time.time()
        })
        project["tasks_done"].append({
            "task": user_message[:100],
            "agent": routed_agent,
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
            return jsonify({"error": "Слишком много запросов. Подожди минуту."}), 429
        return jsonify({"error": error_msg}), 500


# Цепочка агентов — запустить последовательно
@app.route("/api/chain", methods=["POST"])
def chain():
    data = request.json
    user_message = data.get("message", "").strip()
    chain_agents = data.get("chain", ["researcher", "strategist", "marketer"])
    project_id = data.get("project", "default")

    if not user_message:
        return jsonify({"error": "Пустое сообщение"}), 400

    project = get_project(project_id)
    results = []
    accumulated_context = user_message

    for agent_id in chain_agents:
        agent = AGENTS.get(agent_id)
        if not agent:
            continue

        try:
            context = ""
            if results:
                context = "\n\n[РЕЗУЛЬТАТЫ ПРЕДЫДУЩИХ АГЕНТОВ]:\n"
                for r in results:
                    context += f"\n--- {r['agent_name']} ---\n{r['response'][:800]}\n"
                context += "\n[ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ. ДОПОЛНИ И РАЗВЕЙ ИХ.]\n\n"

            messages = [
                {"role": "system", "content": agent["prompt"]},
                {"role": "user", "content": context + accumulated_context}
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
                "full": reply,
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
                "agent_icon": agent["icon"],
                "agent_color": agent["color"],
                "response": f"❌ Ошибка: {str(e)}"
            })
            break

    return jsonify({"results": results, "status": "ok"})


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
        {"title": "/research", "prompt": "Исследуй нишу: ", "desc": "Полный анализ рынка"},
        {"title": "/strategy", "prompt": "Построй стратегию для: ", "desc": "Бизнес-стратегия"},
        {"title": "/fullcycle", "prompt": "/chain Запусти полный цикл для бизнес-идеи: ", "desc": "🔥 Цепочка всех агентов"},
        {"title": "/landing", "prompt": "Напиши продающий лендинг для: ", "desc": "Текст лендинга"},
        {"title": "/competitors", "prompt": "Анализ конкурентов в нише: ", "desc": "Разбор конкурентов"},
        {"title": "/mvp", "prompt": "Спроектируй MVP для: ", "desc": "Минимальный продукт"},
        {"title": "/funnel", "prompt": "Построй воронку продаж для: ", "desc": "Воронка продаж"},
        {"title": "/script", "prompt": "Напиши скрипт продаж для: ", "desc": "Скрипт продаж"}
    ]
    return jsonify(templates)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
