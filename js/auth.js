/**
 * Login/Register Handler - Client Side
 */

const API_BASE = window.location.origin;
const LOGIN_FORM = document.getElementById('loginForm');
const SHOW_REGISTER_LINK = document.getElementById('showRegister');

if (LOGIN_FORM) {
  LOGIN_FORM.addEventListener('submit', handleLogin);
}

if (SHOW_REGISTER_LINK) {
  SHOW_REGISTER_LINK.addEventListener('click', switchToRegister);
}

async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('email')?.value;
  const password = document.getElementById('password')?.value;

  if (!email || !password) {
    showError('Email and password are required');
    return;
  }

  const btn = document.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Processing...';

  try {
    const endpoint = btn.textContent.includes('Register') ? '/api/auth/register' : '/api/auth/login';
    const payload = { email, password };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem('terminal_token', data.token);
      localStorage.setItem('user_email', email);
      showSuccess('✅ ' + data.message);
      setTimeout(() => {
        window.location.href = './terminal.html';
      }, 1500);
    } else {
      showError(data.error || 'Authentication failed');
    }
  } catch (err) {
    console.error('Auth error:', err);
    showError('Connection failed. Check console.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function switchToRegister(e) {
  e.preventDefault();

  const form = document.getElementById('loginForm');
  const title = document.querySelector('.login-title');
  const subtitle = document.querySelector('.login-subtitle');
  const btn = form.querySelector('button[type="submit"]');

  // Update title
  if (title) title.textContent = '📝 Create Account';
  if (subtitle) subtitle.textContent = 'Join Linux Web Terminal';

  // Clear and update form
  form.innerHTML = `
    <div class="form-group">
      <label>Email Address</label>
      <input type="email" id="email" placeholder="you@example.com" required>
    </div>
    <div class="form-group">
      <label>Password (min 6 characters)</label>
      <input type="password" id="password" placeholder="••••••••" required>
    </div>
    <button type="submit" class="btn btn-primary btn-large">📝 Register</button>
  `;

  // Re-attach event listener
  form.addEventListener('submit', handleLogin);

  // Update switch mode links
  const switchMode = document.querySelector('.switch-mode');
  if (switchMode) {
    switchMode.innerHTML = `
      <p>Already have an account? <a href="#" id="showLogin">Login →</a></p>
      <p><a href="./boot.html">← Back to Home</a></p>
    `;
    document.getElementById('showLogin')?.addEventListener('click', switchToLogin);
  }
}

function switchToLogin(e) {
  e.preventDefault();
  window.location.reload();
}

function showError(message) {
  removeNotification();
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = message;
  LOGIN_FORM?.parentElement?.insertBefore(div, LOGIN_FORM);
  setTimeout(removeNotification, 5000);
}

function showSuccess(message) {
  removeNotification();
  const div = document.createElement('div');
  div.className = 'success-message';
  div.textContent = message;
  LOGIN_FORM?.parentElement?.insertBefore(div, LOGIN_FORM);
}

function removeNotification() {
  const existing = document.querySelector('.error-message, .success-message');
  if (existing) existing.remove();
}
