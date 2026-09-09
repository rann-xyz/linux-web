FROM node:20-alpine

WORKDIR /app

# Copy entire repo (Railway deploys to /app)
COPY . .

# Build backend
WORKDIR /app/backend
RUN npm install --include=dev && npx tsc

# Runtime
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/data/users

EXPOSE 8080

CMD ["node", "dist/server.js"]