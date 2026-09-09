# Simple single-stage Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy entire repo (Railway deploys repo to /app)
COPY . .

# Install deps and build
RUN cd backend && npm install && npx tsc

# Set working dir to backend for runtime
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/data/users

EXPOSE 8080

CMD ["node", "dist/server.js"]