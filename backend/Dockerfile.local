FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libmagic1 tesseract-ocr libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.railway.txt .
RUN pip install --no-cache-dir -r requirements.railway.txt
COPY . .
RUN python -c "import fastapi; import uvicorn; print('imports OK')"
RUN mkdir -p /app/data/media
ENV PORT=8080
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
