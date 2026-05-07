FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt httpx psycopg2-binary

COPY . .

ENV PYTHONPATH=/app
CMD pip list && uvicorn app.main:app --host 0.0.0.0 --port 8000

