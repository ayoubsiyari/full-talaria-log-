# Trading Chart Application - Docker Image
FROM node:18-alpine AS homepage_builder

WORKDIR /homepage

# Copy package files
COPY homepage/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY homepage/ ./

# Build static export
RUN npm run build

FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Copy built homepage static export into the runtime image
COPY --from=homepage_builder /homepage/out /app/homepage/out

# Create necessary directories and set permissions
RUN mkdir -p uploads uploads/aggregates data && \
    chmod -R 755 /app

# Expose the port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/status || exit 1

# Run the application
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]
