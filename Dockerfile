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

# Install build tools required for native addons (better-sqlite3 rebuilds from source on npm ci)
WORKDIR /app/server
RUN apk add --no-cache python3 make g++ sqlite-dev

# docker-cli is required: OsrmService manages OSRM containers via Docker socket at runtime.
# Mitigation: restrict /var/run/docker.sock to trusted network. Future: replace with Docker SDK over TCP+mTLS.
RUN apk add --no-cache docker-cli

RUN npm ci --omit=dev

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "dist/server.js"]
