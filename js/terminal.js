/**
 * Terminal Client - Handles WebSocket connection and terminal UI
 */

class TerminalClient {
  constructor() {
    this.term = null;
    this.fitAddon = null;
    this.ws = null;
    this.connected = false;
    this.sessionId = null;
    this.init();
  }

  async init() {
    // Check authentication
    if (!Utils.isAuthenticated()) {
      window.location.href = '/login.html';
      return;
    }

    // Initialize terminal
    this.initializeTerminal();
    this.setupEventListeners();
  }

  initializeTerminal() {
    // Create XTerm instance
    this.term = new XTerm({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Monaco', 'Courier New', monospace",
      fontSize: 14,
      theme: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        cursor: '#3b82f6',
        selection: 'rgba(59, 130, 246, 0.3)',
      },
      scrollback: 1000,
    });

    // Add addons
    this.fitAddon = new XTerm.FitAddon();
    this.term.loadAddons([this.fitAddon]);

    // Open terminal
    this.term.open(document.getElementById('terminal-container'));
    this.fitAddon.fit();

    // Set up input handling
    this.term.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'input',
            data: data,
          })
        );
      }
    });

    // Handle terminal resize
    this.term.onResize(({ cols, rows }) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'resize',
            cols: cols,
            rows: rows,
          })
        );
      }
    });

    // Connect WebSocket
    this.connectWebSocket();
  }

  connectWebSocket() {
    const token = Utils.getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${CONFIG.API_BASE_URL}/terminal?token=${token}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.connected = true;
      this.updateStatus('connected', 'Connected');
      this.term.writeln('\x1b[32m✓ Connected to terminal\x1b[0m\n');
      this.loadSystemInfo();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };

    this.ws.onerror = (e) => {
      console.error('WebSocket error:', e);
      this.term.writeln('\x1b[31m✗ WebSocket error\x1b[0m');
      this.updateStatus('disconnected', 'Connection Error');
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.connected = false;
      this.updateStatus('disconnected', 'Disconnected');
      this.term.writeln('\x1b[31m✗ Connection closed\x1b[0m');
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'output':
        this.term.write(msg.data);
        break;
      case 'error':
        this.term.writeln(`\x1b[31m✗ Error: ${msg.message}\x1b[0m`);
        break;
      case 'info':
        document.getElementById('serverName').textContent = msg.message;
        break;
      default:
        console.warn('Unknown message type:', msg.type);
    }
  }

  updateStatus(status, text) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (status === 'connected') {
      statusDot.className = 'status-dot connected';
      statusText.innerHTML = '<span class="status connected">●</span> Connected';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = text;
    }
  }

  async loadSystemInfo() {
    try {
      const data = await Utils.request('/system/info');
      if (data) {
        this.updateStats(data);
      }
    } catch (e) {
      console.error('Failed to load system info:', e);
    }
  }

  updateStats(data) {
    const statsContent = document.getElementById('stats-content');
    statsContent.innerHTML = `
      <div class="stats-grid">
        <div>
          <span class="stat-label">OS</span>
          <div>${data.os || 'Unknown'}</div>
        </div>
        <div>
          <span class="stat-label">CPU</span>
          <div>${(data.cpuUsage || 0).toFixed(1)}%</div>
        </div>
        <div>
          <span class="stat-label">RAM</span>
          <div>${Utils.formatBytes(data.memoryUsed || 0)} / ${Utils.formatBytes(data.memoryTotal || 0)}</div>
        </div>
        <div>
          <span class="stat-label">Storage</span>
          <div>${Utils.formatBytes(data.storageUsed || 0)} / ${Utils.formatBytes(data.storageTotal || 0)}</div>
        </div>
        <div>
          <span class="stat-label">Uptime</span>
          <div>${Utils.formatTime(data.uptime || 0)}</div>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    // Handle window resize
    window.addEventListener(
      'resize',
      Utils.debounce(() => {
        if (this.fitAddon) {
          this.fitAddon.fit();
        }
      }, 200)
    );
  }

  newSession() {
    if (this.ws) {
      this.ws.close();
    }
    this.term.clear();
    this.term.writeln('\x1b[33m⟳ Starting new session...\x1b[0m\n');
    setTimeout(() => this.connectWebSocket(), 500);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.term.clear();
    this.updateStatus('disconnected', 'Disconnected');
    this.term.writeln('\x1b[33m→ Disconnected from terminal\x1b[0m');
  }

  logout() {
    Utils.removeToken();
    if (this.ws) {
      this.ws.close();
    }
    window.location.href = '/boot.html';
  }
}

// Initialize on page load
let terminalClient;
document.addEventListener('DOMContentLoaded', () => {
  terminalClient = new TerminalClient();

  // Expose functions globally for button clicks
  window.newSession = () => terminalClient.newSession();
  window.disconnect = () => terminalClient.disconnect();
  window.logout = () => terminalClient.logout();
});
