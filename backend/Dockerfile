FROM python:3.10-slim

WORKDIR /app

# Install dependencies needed for Firebird client
RUN apt-get update && apt-get install -y \
    gcc \
    libfbclient2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Adjust for Flask development server or WSGI
CMD ["python", "server.py"]
