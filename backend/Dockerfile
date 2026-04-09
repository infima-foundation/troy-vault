FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libmagic1 tesseract-ocr libgl1 && rm -rf /var/lib/apt/lists/*
COPY requirements.railway.txt .
RUN pip install --no-cache-dir -r requirements.railway.txt
COPY . .
RUN mkdir -p /app/data/media
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
