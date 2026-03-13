FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install && rm -f node_modules/papaparse/papaparse.min.js && \
    node -e "\
    const fs=require('fs'),p='node_modules/react-scripts/config/webpack.config.js';\
    let c=fs.readFileSync(p,'utf8');\
    c=c.replace('resolve: {','resolve: {fallback:{stream:false,buffer:false,crypto:false,path:false,os:false,fs:false,http:false,https:false,zlib:false},');\
    fs.writeFileSync(p,c);\
    "

COPY . .
RUN CI=false GENERATE_SOURCEMAP=false npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
