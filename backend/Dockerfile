# ─────────────────────────────────────────────
# Stage 1: Build TypeScript
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy ALL files (for source files like schema.sql)
COPY . .

# Install dependencies
RUN npm install

# Build TypeScript → JavaScript
RUN npx tsc

# ─────────────────────────────────────────────
# Stage 2: Production runtime
# ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built output + source files needed at runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Create user data directory (persistent storage)
RUN mkdir -p /data/users && chmod 755 /data

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV STORAGE_ROOT=/data/users

# Expose port
EXPOSE 4000

# Start the server
CMD ["node", "dist/server.js"]