# Trading Chart - Docker Deployment Guide

## Quick Start

### 1. Build and Run (Development)

```bash
# Build the image
docker-compose build

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f
```

The application will be available at: `http://localhost:8000`

### 2. Stop the Application

```bash
docker-compose down
```

---

## Production Deployment

### Option A: Basic Deployment

```bash
# Copy and configure environment
cp .env.example .env

# Build and run
docker-compose up -d --build
```

### Option B: With Nginx Reverse Proxy

```bash
# Start with production profile (includes Nginx)
docker-compose --profile production up -d --build
```

This adds:
- Nginx reverse proxy on port 80
- Rate limiting for API endpoints
- Gzip compression
- Security headers
- Static file caching

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Application port |
| `NGINX_PORT` | `80` | Nginx HTTP port |
| `NGINX_SSL_PORT` | `443` | Nginx HTTPS port |
| `DATABASE_URL` | `sqlite:///./db/chart_data.db` | Database connection URL |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

### Custom Port

```bash
PORT=3000 docker-compose up -d
```

---

## Data Persistence

Data is persisted in:
- `./uploads/` - Uploaded CSV files
- `./data/` - Application data
- `chart_db` volume - SQLite database

### Backup Data

```bash
# Backup uploads
tar -czf uploads-backup.tar.gz uploads/

# Backup database
docker cp trading-chart-app:/app/db/chart_data.db ./backup/
```

---

## Deployment to Server

### 1. Push to Docker Registry

```bash
# Tag the image
docker tag trading-chart:latest your-registry.com/trading-chart:latest

# Push to registry
docker push your-registry.com/trading-chart:latest
```

### 2. Deploy on Server

```bash
# SSH to server
ssh user@your-server.com

# Pull the image
docker pull your-registry.com/trading-chart:latest

# Run with docker-compose
docker-compose up -d
```

### 3. Deploy with Docker Stack (Swarm)

```bash
# Initialize swarm (if not already)
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml trading-chart
```

---

## SSL/HTTPS Setup

1. Place your SSL certificates in `./ssl/`:
   - `fullchain.pem`
   - `privkey.pem`

2. Uncomment the HTTPS server block in `nginx.conf`

3. Restart with production profile:
   ```bash
   docker-compose --profile production up -d
   ```

---

## Useful Commands

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f trading-chart

# Restart container
docker-compose restart trading-chart

# Rebuild and restart
docker-compose up -d --build

# Shell into container
docker exec -it trading-chart-app /bin/bash

# Check health
curl http://localhost:8000/api/status

# Remove everything (including volumes)
docker-compose down -v
```

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs trading-chart

# Verify Dockerfile
docker build -t trading-chart:test .
```

### Port already in use
```bash
# Change port in .env or command line
PORT=8080 docker-compose up -d
```

### Permission issues with uploads
```bash
# Fix permissions
chmod -R 755 uploads/
```

### Database issues
```bash
# Reset database
docker-compose down -v
docker-compose up -d
```

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│     Client      │────▶│      Nginx      │ (optional, production)
│    Browser      │     │   Port 80/443   │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  Trading Chart  │
                        │  FastAPI App    │
                        │   Port 8000     │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
     │   Static Files  │ │   SQLite    │ │    Uploads      │
     │  HTML/JS/CSS    │ │   Database  │ │   CSV Files     │
     └─────────────────┘ └─────────────┘ └─────────────────┘
```
