FROM node:18-alpine AS builder

WORKDIR /app

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
FROM node:18-alpine

WORKDIR /app

# Copy server build output + manifests
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/package-lock.json ./server/package-lock.json

# Copy frontend build output where the server expects it: ../../client/dist
COPY --from=builder /app/client/dist ./client/dist

# Install production dependencies for server
WORKDIR /app/server
RUN npm ci --omit=dev

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "dist/server.js"]
