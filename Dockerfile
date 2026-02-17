FROM node:18-alpine AS builder

WORKDIR /app

# Copy root package
COPY package.json ./

# Install dependencies based on root package structure (monorepo-ish)
# We need to copy everything to build
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

# Copy server built files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/src/db/schema.sql ./server/dist/db/schema.sql

# Copy client built files to public/static folder in server (we need to configure server to serve this)
# OR we can just keep them separate. The prompt says "instructions for docker". 
# Easiest is running backend and frontend separately or serving static.
# Let's serve static from backend for a single container solution.
COPY --from=builder /app/client/dist ./server/public

# Install production dependencies for server
WORKDIR /app/server
RUN npm install --production

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.js"]
