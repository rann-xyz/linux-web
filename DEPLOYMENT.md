# Deployment Guide - Ubuntu Cloud Terminal

## Prerequisites

- Ubuntu Server (22.04 or 24.04) with Docker installed
- Vercel account for frontend
- Domain name (optional but recommended)

---

## Part 1: Backend Deployment (Ubuntu Server)

### 1.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 1.2 Setup Directory

```bash
mkdir -p /data/users
chmod 755 /data/users
```

### 1.3 Deploy Backend

```bash
cd /opt/terminal-backend

# Create .env file
cat > .env << 'EOF'
NODE_ENV=production
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/terminal
SESSION_SECRET=YOUR_VERY_LONG_RANDOM_SECRET_HERE_AT_LEAST_32_CHARS
FRONTEND_URL=https://your-frontend.vercel.app
BACKEND_URL=https://your-backend-domain.com
WS_URL=wss://your-backend-domain.com
STORAGE_ROOT=/data/users
MAX_STORAGE_GB=5
MAX_MEMORY_MB=512
MAX_CPU_CORES=1
MAX_PROCESSES=50
MAX_TERMINAL_SESSIONS=5
SESSION_IDLE_TIMEOUT_MINUTES=60
SESSION_MAX_LIFETIME_HOURS=168
MAX_UPLOAD_MB=100
EOF

# Start services
docker compose up -d --build

# Check logs
docker compose logs -f
```

### 1.4 Verify Backend

```bash
curl https://your-backend-domain.com/health
```

Expected response: `{"status":"ok","timestamp":"..."}`

---

## Part 2: Frontend Deployment (Vercel)

### 2.1 Push to GitHub

```bash
cd web-terminal/frontend
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/ubuntu-cloud-terminal.git
git push -u origin main
```

### 2.2 Deploy to Vercel

**Option A: Via Vercel CLI**

```bash
npm i -g vercel
cd frontend
vercel login
vercel --prod
```

**Option B: Via Vercel Dashboard**

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repo
4. Set environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend-domain.com`
   - `NEXT_PUBLIC_WS_URL` = `wss://your-backend-domain.com`
5. Click "Deploy"

### 2.3 Configure Domain (Optional)

In Vercel dashboard → Settings → Domains:
- Add `terminal.yourdomain.com`

---

## Part 3: Nginx Reverse Proxy (Optional but Recommended)

### 3.1 Install Nginx

```bash
sudo apt update && sudo apt install nginx certbot python3-certbot-nginx -y
```

### 3.2 Copy Nginx Config

```bash
sudo cp infrastructure/nginx/terminal.conf /etc/nginx/sites-available/terminal
sudo ln -s /etc/nginx/sites-available/terminal /etc/nginx/sites-enabled/
sudo nginx -t
```

### 3.3 Edit Config

Update `server_name` to your domain:
```bash
sudo nano /etc/nginx/sites-available/terminal
```

### 3.4 Enable SSL

```bash
sudo certbot --nginx -d terminal.yourdomain.com
```

### 3.5 Restart

```bash
sudo systemctl restart nginx
```

---

## Part 4: Docker Container Memory Limits

Edit `docker-compose.yml` to adjust limits:

```yaml
services:
  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      - MAX_MEMORY_MB=1024      # Increase if needed
      - MAX_CPU_CORES=2         # Increase if needed
      - MAX_STORAGE_GB=10       # Increase if needed
    deploy:
      resources:
        limits:
          memory: 1024M         # Docker container memory limit
          cpus: '2'
```

---

## Part 5: Troubleshooting

### Backend won't start

```bash
docker compose logs backend
docker compose exec backend sh
```

### Database connection failed

```bash
docker compose ps
docker compose logs db
docker compose exec db psql -U postgres -d terminal -c "\dt"
```

### WebSocket connection issues

Check Nginx WebSocket proxy config:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Terminal not working

Check Docker socket permissions:
```bash
ls -la /var/run/docker.sock
docker compose exec backend docker ps
```

---

## Part 6: Production Checklist

- [ ] PostgreSQL password changed from default
- [ ] SESSION_SECRET is long and random
- [ ] FRONTEND_URL set correctly
- [ ] SSL certificate active
- [ ] Nginx rate limiting enabled
- [ ] Docker resource limits set
- [ ] Backup strategy in place
- [ ] Monitoring setup (optional: use PM2, Datadog, etc.)

---

## Quick Test

After deployment, test:

1. **Register**: POST `/api/auth/register`
2. **Login**: POST `/api/auth/login`  
3. **Get User**: GET `/api/auth/me` with Bearer token
4. **Create Terminal**: POST `/api/terminal/session`
5. **WebSocket**: Connect to `wss://domain/api/terminal?token=JWT_TOKEN`
6. **List Files**: GET `/api/files`

---

## Architecture Summary

```
User Browser
    ↓ HTTPS
Vercel (Frontend - Next.js)
    ↓ HTTPS/WSS
Your Ubuntu Server
    ↓
Nginx (Reverse Proxy)
    ↓
Backend (Fastify - Port 4000)
    ↓
PostgreSQL (Port 5432)
    ↓
Docker (User Containers)
    ↓
Persistent Storage (/data/users/<user-id>/)
```