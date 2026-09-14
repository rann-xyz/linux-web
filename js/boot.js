/**
 * Boot Page Handler
 */

const loginBtn = document.getElementById('btnLogin');
const demoBtn = document.getElementById('btnDemo');
const settingsBtn = document.getElementById('btnSettings');

if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    window.location.href = './login.html';
  });
}

if (demoBtn) {
  demoBtn.addEventListener('click', () => {
    showModal('🎮 Demo Mode', 'Demo mode coming soon! Login for full access.', 'info');
  });
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    showModal('⚙️ Settings', 'Settings panel coming soon! Check back later.', 'info');
  });
}

function showModal(title, message, type = 'info') {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5000;
    backdrop-filter: blur(5px);
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    padding: 2rem;
    max-width: 400px;
    text-align: center;
    animation: fadeIn 0.3s ease-out;
  `;

  content.innerHTML = `
    <h3 style="margin-bottom: 1rem; color: var(--text-primary);">${title}</h3>
    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">${message}</p>
    <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">Close</button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}
