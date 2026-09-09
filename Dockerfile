# Root-level Dockerfile for Railway
# Railway deploys entire repo to /app, Dockerfile at root triggers Docker build

FROM node:20-alpine AS builder

WORKDIR /app

# Copy only backend files for build
COPY backend/package*.json ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Build TypeScript
WORKDIR /app/backend
RUN npm install --include=dev && npx tsc

# ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy built artifacts and source
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/src ./src

# Create storage directory
RUN mkdir -p /data/users && chmod 755 /data

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/data/users

EXPOSE 8080

CMD ["node", "dist/server.js"]