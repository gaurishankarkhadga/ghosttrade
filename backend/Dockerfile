# Stage 1: Builder
FROM node:24-alpine AS builder
WORKDIR /app

# Install build dependencies (often needed for node-gyp or specific packages)
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
# Clean install to ensure reproducible builds
RUN npm ci

COPY . .

# Stage 2: Production
FROM node:24-alpine AS production
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Copy the entire app from the builder stage. 
# We don't need to explicitly copy node_modules and then /app again.
# Kaniko fails when you try to overwrite symlinks twice.
COPY --from=builder /app ./

# Change ownership to the restricted node user
RUN chown -R node:node /app
USER node

# Expose the standard backend port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
