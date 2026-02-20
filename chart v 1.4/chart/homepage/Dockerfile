# Homepage - Next.js Static Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build static export
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built static files
COPY --from=builder /app/out /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
