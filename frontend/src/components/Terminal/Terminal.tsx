'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

interface TerminalProps {
  token: string;
  onConnectionChange: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export function Terminal({ token, onConnectionChange }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    onConnectionChange('connecting');

    const ws = new WebSocket(`${WS_URL}/api/terminal?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      onConnectionChange('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'output':
            xtermRef.current?.write(msg.data);
            break;
          case 'ready':
            setIsReady(true);
            break;
          case 'exit':
            xtermRef.current?.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n');
            break;
          case 'error':
            xtermRef.current?.write(`\r\n\x1b[31mError: ${msg.message}\x1b[0m\r\n`);
            break;
          case 'pong':
            // Heartbeat response
            break;
        }
      } catch {
        // Raw output (for backwards compatibility)
        xtermRef.current?.write(event.data);
      }
    };

    ws.onclose = () => {
      onConnectionChange('disconnected');
      wsRef.current = null;
      // Attempt reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      onConnectionChange('disconnected');
    };
  }, [token, onConnectionChange]);

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#3fb950',
        cursorAccent: '#0d1117',
        selectionBackground: '#3b5070',
        black: '#0d1117',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        const dims = { cols: term.cols, rows: term.rows };
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', ...dims }));
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial resize
    setTimeout(handleResize, 100);

    // Connect WebSocket after terminal is ready
    connectWebSocket();

    return () => {
      window.removeEventListener('resize', handleResize);
      wsRef.current?.close();
      term.dispose();
    };
  }, [connectWebSocket]);

  // Handle terminal shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'c' && xtermRef.current?.hasSelection()) {
        // Copy selection
        document.execCommand('copy');
        xtermRef.current.clearSelection();
      }
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        xtermRef.current?.clear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#f85149]" />
            <div className="w-3 h-3 rounded-full bg-[#d29922]" />
            <div className="w-3 h-3 rounded-full bg-[#3fb950]" />
          </div>
          <span className="ml-2 text-sm text-[#8b949e]">Ubuntu 24.04 LTS</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => xtermRef.current?.clear()}
            className="px-2 py-1 text-xs bg-[#21262d] hover:bg-[#30363d] rounded text-[#8b949e]"
          >
            Clear
          </button>
          <button
            onClick={() => fitAddonRef.current?.fit()}
            className="px-2 py-1 text-xs bg-[#21262d] hover:bg-[#30363d] rounded text-[#8b949e]"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div ref={terminalRef} className="flex-1 overflow-hidden" />

      {/* Mobile Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 bg-[#161b22] border-t border-[#30363d] md:hidden">
        {['Ctrl', 'Tab', 'Esc', '↑', '↓', '←', '→', '/', '~', '|', '&'].map((key) => (
          <button
            key={key}
            className="px-2 py-1 text-xs bg-[#21262d] hover:bg-[#30363d] rounded text-[#8b949e]"
            onClick={() => {
              if (key === 'Esc') {
                xtermRef.current?.write('\x1b');
              } else if (key === '↑') {
                xtermRef.current?.write('\x1b[A');
              } else if (key === '↓') {
                xtermRef.current?.write('\x1b[B');
              } else if (key === '→') {
                xtermRef.current?.write('\x1b[C');
              } else if (key === '←') {
                xtermRef.current?.write('\x1b[D');
              } else {
                xtermRef.current?.write(key.toLowerCase());
              }
            }}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}