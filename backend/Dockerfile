FROM python:3.12

RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    psycopg2-binary \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
