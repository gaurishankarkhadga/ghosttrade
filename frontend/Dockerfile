# Stage 1: Build the React/Vite application
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine AS production

# Copy the build output to replace the default nginx contents
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy the custom Nginx configuration to support SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
