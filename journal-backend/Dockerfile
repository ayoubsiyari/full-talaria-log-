# syntax=docker/dockerfile:1.4
# Build context MUST be ./journal-backend (see docker-compose.yml additional_contexts).
# CI passes talaria-security=./securty/python as an extra build context.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UPLOAD_FOLDER=/app/uploads

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY --from=talaria-security . /opt/talaria_security_lib
ENV PYTHONPATH=/opt/talaria_security_lib

COPY . /app/

RUN addgroup --system app && adduser --system --ingroup app --home /app app \
    && mkdir -p /app/uploads/screenshots /app/uploads/strategy-images \
    && chown -R app:app /app /opt/talaria_security_lib \
    && chmod +x /app/docker-entrypoint.sh

RUN FLASK_ENV=development FLASK_DEBUG=True \
    DATABASE_URL=sqlite:////tmp/journal-build-check.db \
    SECRET_KEY=local-docker-journal-secret-minimum-32-characters-long \
    JWT_SECRET_KEY=local-docker-journal-jwt-secret-minimum-32-characters \
    python -c "from app import app; print('journal-backend import OK')"

# Entrypoint runs as root to chown the uploads volume, then drops to `app`.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 5000

CMD ["gunicorn", "-c", "gunicorn.conf.py", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
