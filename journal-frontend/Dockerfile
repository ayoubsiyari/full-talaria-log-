FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install && rm -f node_modules/papaparse/papaparse.min.js

COPY . .
RUN GENERATE_SOURCEMAP=false npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
