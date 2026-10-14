FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_UPSTREAM=http://backend:5001
ENV NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM
EXPOSE 80
