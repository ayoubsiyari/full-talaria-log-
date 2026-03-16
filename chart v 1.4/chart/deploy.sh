#!/bin/bash

# Trading Chart - Deployment Script
# Usage: ./deploy.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="trading-chart"
CONTAINER_NAME="trading-chart-app"

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Build the Docker image
build() {
    print_status "Building Docker image..."
    docker-compose build
    print_status "Build complete!"
}

# Start the application
start() {
    print_status "Starting Trading Chart..."
    docker-compose up -d
    
    # Wait for health check
    sleep 3
    
    if curl -s http://localhost:${HOST_PORT:-8000}/api/status > /dev/null; then
        print_status "Application is running!"
        echo ""
        echo "  📊 Sessions: http://localhost:${HOST_PORT:-8000}/sessions.html"
        echo "  📈 Chart:    http://localhost:${HOST_PORT:-8000}/index.html"
        echo "  📚 API Docs: http://localhost:${HOST_PORT:-8000}/docs"
    else
        print_warning "Application may still be starting... Check logs with: docker-compose logs -f"
    fi
}

# Stop the application
stop() {
    print_status "Stopping Trading Chart..."
    docker-compose down
    print_status "Application stopped!"
}

# Restart the application
restart() {
    stop
    start
}

# Show logs
logs() {
    docker-compose logs -f
}

# Show status
status() {
    echo ""
    echo "Container Status:"
    docker-compose ps
    echo ""
    
    if curl -s http://localhost:${HOST_PORT:-8000}/api/status > /dev/null; then
        print_status "API is healthy"
    else
        print_warning "API is not responding"
    fi
}

# Clean up
clean() {
    print_warning "This will remove all containers and volumes!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v --rmi local
        print_status "Cleanup complete!"
    else
        print_status "Cleanup cancelled"
    fi
}

# Backup data
backup() {
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    print_status "Creating backup in $BACKUP_DIR..."
    
    # Backup uploads
    if [ -d "uploads" ]; then
        cp -r uploads "$BACKUP_DIR/"
        print_status "Uploads backed up"
    fi
    
    # Backup database from container
    if docker ps -q -f name=$CONTAINER_NAME > /dev/null 2>&1; then
        docker cp $CONTAINER_NAME:/app/db/chart_data.db "$BACKUP_DIR/" 2>/dev/null || true
        print_status "Database backed up"
    fi
    
    print_status "Backup complete: $BACKUP_DIR"
}

# Push to registry
push() {
    REGISTRY=${1:-""}
    TAG=${2:-"latest"}
    
    if [ -z "$REGISTRY" ]; then
        print_error "Usage: ./deploy.sh push <registry> [tag]"
        print_error "Example: ./deploy.sh push docker.io/myuser latest"
        exit 1
    fi
    
    print_status "Building and pushing to $REGISTRY/$IMAGE_NAME:$TAG..."
    docker build -t "$REGISTRY/$IMAGE_NAME:$TAG" .
    docker push "$REGISTRY/$IMAGE_NAME:$TAG"
    print_status "Image pushed successfully!"
}

# Show help
help() {
    echo ""
    echo "Trading Chart - Deployment Script"
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build       Build the Docker image"
    echo "  start       Start the application"
    echo "  stop        Stop the application"
    echo "  restart     Restart the application"
    echo "  logs        View application logs"
    echo "  status      Show application status"
    echo "  clean       Remove containers and volumes"
    echo "  backup      Backup data and database"
    echo "  push        Push image to registry"
    echo "  help        Show this help message"
    echo ""
}

# Main
case "${1:-help}" in
    build)      build ;;
    start)      start ;;
    stop)       stop ;;
    restart)    restart ;;
    logs)       logs ;;
    status)     status ;;
    clean)      clean ;;
    backup)     backup ;;
    push)       push "$2" "$3" ;;
    help|*)     help ;;
esac
