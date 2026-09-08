# ─────────────────────────────────────────────
# Stage 1: Build TypeScript
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev)
RUN npm install

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

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

# Copy built output from builder stage
COPY --from=builder /app/dist ./dist

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