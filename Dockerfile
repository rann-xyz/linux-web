FROM node:20-alpine

WORKDIR /app

# Copy entire repo
COPY . .

# Railway injects these env vars automatically
# $PORT, $RAILWAY_PRIVATE_DOMAIN, $POSTGRES_*, etc.

# Build and run from backend/
WORKDIR /app/backend
RUN npm install
RUN npx tsc

EXPOSE 8080

CMD ["node", "dist/server.js"]