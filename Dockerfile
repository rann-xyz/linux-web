FROM node:20-alpine

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./

# Install deps (all, since builder stage failed)
RUN npm install

# Copy source + build
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build TypeScript
RUN npx tsc

# Copy built output
COPY --from=0 /app/dist ./dist
COPY --from=0 /app/node_modules ./node_modules

# Create storage
RUN mkdir -p /data/users && chmod 755 /data

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/data/users

EXPOSE 8080

CMD ["node", "dist/server.js"]