# Root Dockerfile - builds backend from backend/ subdirectory
FROM node:20-alpine AS builder

WORKDIR /app

# Copy entire repo
COPY . .

# Build only backend
WORKDIR /app/backend
RUN npm install && npx tsc

# ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production deps
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy built output + source
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/src ./src

# Create storage
RUN mkdir -p /data/users && chmod 755 /data

ENV NODE_ENV=production
ENV PORT=4000
ENV STORAGE_ROOT=/data/users

EXPOSE 4000

CMD ["node", "dist/server.js"]