# Root Dockerfile — Railway deploys entire repo
FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Build TypeScript
WORKDIR /app/backend
RUN npm install --legacy-peer-deps && npx tsc --noEmit false

# ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production deps
COPY backend/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy built output + source
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/src ./src

# Create storage
RUN mkdir -p /data/users && chmod 755 /data

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/data/users

EXPOSE 8080

# Clear npm cache in final image
RUN npm cache clean --force

CMD ["node", "dist/server.js"]