# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies (often needed for node-gyp or specific packages)
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
# Clean install to ensure reproducible builds
RUN npm ci

COPY . .

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/mongoConfig.js ./
COPY --from=builder /app/sharedConfig.js ./
# Copy core directories
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/models ./models
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/workers ./workers

# (Optional) If you have more files needed for production, they will be copied above, 
# but we are explicitly avoiding copying test scripts.
# Since the backend uses ES modules and many loosely coupled files, 
# it's safer to copy all .js files, but exclude tests via .dockerignore.
# We'll override the explicit copies above and just copy everything that .dockerignore allows:
COPY --from=builder /app ./

# Change ownership to the restricted node user
RUN chown -R node:node /app
USER node

# Expose the standard backend port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
