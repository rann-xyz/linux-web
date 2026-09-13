'use client';
import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Auth check
    const token = localStorage.getItem('terminal_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    tokenRef.current = token;

    // Load XTerm
    const loadTerminal = async () => {
      const XTerm = (await import('xterm')).Terminal;
      const FitAddon = (await import('xterm-addon-fit')).FitAddon;
      const FitAddonCtor = FitAddon;

      const term = new XTerm({
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff' }
      });

      const fitAddon = new FitAddonCtor();
      term.loadAddon(fitAddon);
      term.open(termRef.current!);
      fitAddon.fit();

      // WebSocket connection
      const wsUrl = `${API_URL.replace('http', 'ws')}/api/terminal?token=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      term.writeln('\r\n\x1b[32mWelcome to Linux Web Terminal! 🐧\x1b[0m\r\n');

      ws.onopen = () => term.write('\x1b[36mConnected\x1b[0m\r\n');
      ws.onerror = () => { term.writeln('\r\n[Connection error]'); }
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') term.write(msg.data);
        else if (msg.type === 'exit') term.writeln(`\r\n[Session exited]`);
      };

      term.onKey((e) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: e.source }));
        }
      });

      window.addEventListener('resize', () => fitAddon.fit());
    };

    loadTerminal();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      <div className="flex-1 overflow-hidden">
        <div ref={termRef} className="w-full h-full" />
      </div>
    </div>
  );
}