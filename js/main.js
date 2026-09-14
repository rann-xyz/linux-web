/**
 * Main JavaScript for Linux Web Terminal
 * Handles common functionality across pages
 */

// Environment Configuration
const CONFIG = {
  API_BASE_URL: window.location.origin + '/api',
  WS_BASE_URL: (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host,
  TOKEN_KEY: 'terminal_token',
  TIMEOUT: 5000,
};

// Utils
const Utils = {
  /**
   * Get auth token from localStorage
   */
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  },

  /**
   * Set auth token
   */
  setToken(token) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
  },

  /**
   * Remove auth token
   */
  removeToken() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.getToken();
  },

  /**
   * API request helper
   */
  async request(endpoint, options = {}) {
    const { method = 'GET', body = null, headers = {} } = options;
    const token = this.getToken();

    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, config);

      if (response.status === 401) {
        this.removeToken();
        window.location.href = '/boot.html';
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error: ${endpoint}`, error);
      throw error;
    }
  },

  /**
   * Show toast notification
   */
  toast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 0.5rem;
      z-index: 10000;
      animation: slideInLeft 0.3s ease-out;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Format time
   */
  formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Copy to clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Copied to clipboard!', 'success');
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  },
};

// Make Utils available globally
window.Utils = Utils;
window.CONFIG = CONFIG;

console.log('✅ Main.js loaded');
