#!/usr/bin/env python3
"""Auto-deploy script for Railway backend.
Checks for new commits, builds, deploys, and verifies.
Run via cronjob: `*/5 * * * * python3 /home/userland/deploy.py`
"""

import os
import subprocess
import sys
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("deploy")

REPO_DIR = "/home/userland/linux-web"
RAILWAY_SERVICE = "linux-web"
HEALTH_URL = "https://linux-web-production-dfd2.up.railway.app/health"

def run(cmd, cwd=None, check=True):
    result = subprocess.run(cmd, shell=True, cwd=cwd or REPO_DIR, capture_output=True, text=True)
    if result.returncode != 0 and check:
        log.error(f"Command failed: {cmd}\n{result.stderr}")
        return None
    return result.stdout.strip() if result.stdout else ""

def has_new_commits():
    """Check if there are new commits to deploy."""
    run("git fetch --quiet origin", check=False)
    result = run("git rev-list HEAD...origin/master --count 2>/dev/null || echo 0", check=False)
    count = int(result.strip()) if result and result.strip().isdigit() else 0
    return count > 0

def build():
    """Build project if needed."""
    log.info("🔨 Checking build requirements...")
    
    # Check if requirements.txt changed
    deps_changed = run("git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -c requirements.txt || echo 0", check=False)
    if deps_changed and int(deps_changed.strip()) > 0:
        log.info("📦 Dependencies changed - installing...")
        run("pip install -r requirements.txt --break-system-packages 2>/dev/null || uv pip install -r requirements.txt", check=False)
    
    # Check if frontend needs build
    fe_changed = run("git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -c frontend/ || echo 0", check=False)
    if fe_changed and int(fe_changed.strip()) > 0:
        log.info("🎨 Frontend changed - building...")
        run("cd frontend && npm run build 2>/dev/null || yarn build || echo 'No build needed'", check=False)

def deploy():
    """Deploy to Railway."""
    log.info(f"🚀 Deploying to Railway service: {RAILWAY_SERVICE}...")
    
    # Try Railway CLI
    result = run(f"railway up --detached 2>&1 || railway up --service {RAILWAY_SERVICE} --detach 2>&1", check=False)
    if "SUCCESS" in result or "deploys" in result:
        log.info("✅ Railway deploy command sent")
        return True
    elif "login" in result.lower() or "auth" in result.lower():
        log.error("❌ Railway not logged in - run: railway login")
        return False
    else:
        log.warning(f"⚠️ Railway CLI output: {result[:100] if result else 'empty'}")
        # Try direct deployment
        result = run(f"railway link 2>/dev/null; railway up 2>&1", check=False)
        return "SUCCESS" in result or "deploy" in result.lower()

def verify():
    """Check health endpoint."""
    log.info(f"🩺 Checking health: {HEALTH_URL}...")
    import httpx
    try:
        resp = httpx.get(HEALTH_URL, timeout=10)
        if resp.status_code == 200:
            log.info("✅ Health check passed")
            return True
        else:
            log.error(f"❌ Health check failed: {resp.status_code}")
            return False
    except Exception as e:
        log.error(f"❌ Health check error: {e}")
        return False

def main():
    log.info("🎯 Auto-deploy starting...")
    
    if not has_new_commits():
        log.info("✅ No new commits to deploy")
        return "no_change"
    
    log.info("📝 New commits detected!")
    
    build()
    
    if deploy():
        time.sleep(10)  # Wait for deploy to propagate
        if verify():
            log.info("🎉 Deployment VERIFIED and SUCCESSFUL!")
            return "success"
        else:
            log.error("❌ Deployment finished but health check failed")
            return "failed_health"
    else:
        log.error("❌ Deployment FAILED")
        return "failed"

if __name__ == "__main__":
    result = main()
    sys.exit(0 if result in ("no_change", "success") else 1)