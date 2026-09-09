# Root Dockerfile — Railway deploys entire repo, this builds backend/
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only backend files needed for build
COPY backend/package*.json ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Build TypeScript in backend/
WORKDIR /app/backend
RUN npm install && npx tsc

# ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production deps for backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy built output + source from builder
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/src ./src

# Create persistent storage directory
RUN mkdir -p /data/users && chmod 755 /data

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/data/users

EXPOSE 8080

CMD ["node", "dist/server.js"]