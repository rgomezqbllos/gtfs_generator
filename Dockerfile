FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native dependencies (like better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-dev

COPY . .

# Install and Build Client
WORKDIR /app/client
RUN npm install
RUN npm run build

# Install Server
WORKDIR /app/server
RUN npm install
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Copy server build output + manifests
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/package-lock.json ./server/package-lock.json

# Copy frontend build output where the server expects it: ../../client/dist
COPY --from=builder /app/client/dist ./client/dist

# Install production dependencies for server (requires build tools for native addons like better-sqlite3)
WORKDIR /app/server
RUN apk add --no-cache python3 make g++ sqlite-dev docker-cli
RUN npm ci --omit=dev

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "dist/server.js"]
