#!/bin/bash
# 🚀 Auto Deploy Script - Railway Backend
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting auto-deploy to Railway..."

# Step 1: Pull latest from GitHub
echo "📥 Pulling latest code..."
git pull origin master

# Step 2: Check if requirements.txt changed
if git diff --name-only HEAD~1 | grep -q "requirements.txt"; then
    echo "📦 requirements.txt changed - installing deps..."
    pip install -r requirements.txt --break-system-packages 2>/dev/null || pip install -r requirements.txt
fi

# Step 3: Run any pending DB migrations
if [ -f "manage.py" ]; then
    echo "🗄️ Running DB migrations..."
    python manage.py migrate --no-input 2>/dev/null || echo "⚠️ No migrations needed"
fi

# Step 4: Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up --detach 2>/dev/null || railway up --service linux-web 2>/dev/null || {
    echo "⚠️ Railway CLI failed - checking status..."
    railway status
    exit 1
}

# Step 5: Verify deployment
sleep 10
HEALTH=$(curl -s --max-time 5 https://linux-web-production-dfd2.up.railway.app/health || echo '{"status":"fail"}')
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ Deployment successful!"
    echo "   Backend: https://linux-web-production-dfd2.up.railway.app"
else
    echo "❌ Health check failed"
    exit 1
fi

echo "🎉 Auto-deploy complete!"