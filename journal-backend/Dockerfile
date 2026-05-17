FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app/

RUN FLASK_ENV=development FLASK_DEBUG=True \
    DATABASE_URL=sqlite:////tmp/journal-build-check.db \
    SECRET_KEY=local-docker-journal-secret-minimum-32-characters-long \
    JWT_SECRET_KEY=local-docker-journal-jwt-secret-minimum-32-characters \
    python -c "from app import app; print('journal-backend import OK')"

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
