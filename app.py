import os
import time
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = """Ты — AI-агент для бизнеса. Твои возможности:

1. АНАЛИЗ РЫНКА: Когда пользователь описывает нишу, ты анализируешь:
   - Целевую аудиторию
   - Конкурентов
   - Потенциальные проблемы клиентов

2. ГЕНЕРАЦИЯ ИДЕЙ: Предлагаешь конкретные бизнес-идеи с:
   - Описанием продукта/сервиса
   - Моделью монетизации
   - Первыми шагами для запуска

3. ДЕКОМПОЗИЦИЯ ЗАДАЧ: Любую большую задачу разбиваешь на конкретные шаги.

4. СОЗДАНИЕ КОНТЕНТА: Пишешь тексты для лендингов, постов, email-рассылок.

Отвечай структурированно. Используй маркированные списки и заголовки.
Будь конкретным — никакой воды. Давай actionable советы.
Отвечай на том языке, на котором пишет пользователь."""

conversations = {}
last_request_time = {}


def get_history(session_id):
    if session_id not in conversations:
        conversations[session_id] = []
    return conversations[session_id]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message", "").strip()
    session_id = data.get("session_id", "default")

    if not user_message:
        return jsonify({"error": "Пустое сообщение"}), 400

    now = time.time()
    if session_id in last_request_time:
        diff = now - last_request_time[session_id]
        if diff < 3:
            return jsonify({
                "error": f"Подожди {int(3 - diff)} сек."
            }), 429
    last_request_time[session_id] = now

    try:
        history = get_history(session_id)
        history.append({"role": "user", "content": user_message})

        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
            max_tokens=4096
        )

        reply = response.choices[0].message.content
        history.append({"role": "assistant", "content": reply})

        if len(history) > 20:
            history[:] = history[-20:]

        return jsonify({
            "response": reply,
            "status": "ok"
        })

    except Exception as e:
        error_msg = str(e)
        if "rate_limit" in error_msg.lower() or "429" in error_msg:
            return jsonify({
                "error": "Слишком много запросов. Подожди минуту."
            }), 429
        return jsonify({"error": error_msg}), 500


@app.route("/api/reset", methods=["POST"])
def reset():
    data = request.json
    session_id = data.get("session_id", "default")
    if session_id in conversations:
        del conversations[session_id]
    return jsonify({"status": "reset"})


@app.route("/api/templates", methods=["GET"])
def get_templates():
    templates = [
        {
            "title": "Анализ ниши",
            "prompt": "Проанализируй нишу: [ОПИШИ НИШУ]. Дай анализ целевой аудитории, конкурентов и возможностей."
        },
        {
            "title": "Генерация идей",
            "prompt": "Предложи 5 бизнес-идей для человека с бюджетом [СУММА] и навыками в [ОБЛАСТЬ]. Для каждой идеи укажи модель монетизации и первые 3 шага."
        },
        {
            "title": "Декомпозиция",
            "prompt": "Разбей задачу на конкретные шаги: [ОПИШИ ЗАДАЧУ]. Для каждого шага укажи время выполнения и необходимые ресурсы."
        },
        {
            "title": "Лендинг",
            "prompt": "Напиши текст для лендинга продукта: [ОПИШИ ПРОДУКТ]. Включи заголовок, подзаголовок, 3 преимущества, CTA и блок FAQ."
        },
        {
            "title": "Бизнес-план",
            "prompt": "Составь краткий бизнес-план для: [ОПИШИ ИДЕЮ]. Включи: проблема, решение, аудитория, каналы привлечения, монетизация, метрики успеха."
        }
    ]
    return jsonify(templates)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
