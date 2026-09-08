'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal } from '@/components/Terminal/Terminal';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Header } from '@/components/Header/Header';
import { SystemStats } from '@/components/SystemStats/SystemStats';
import { Auth } from '@/components/Auth/Auth';
import { FileManager } from '@/components/FileManager/FileManager';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface User {
  id: string;
  email: string;
  role: string;
  status: string;
  email_verified: boolean;
}

interface SystemInfo {
  os: string;
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  storageUsed: number;
  storageTotal: number;
  uptime: number;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('terminal');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  // Check for existing session
  useEffect(() => {
    const savedToken = localStorage.getItem('terminal_token');
    if (savedToken) {
      validateToken(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Fetch system info periodically
  useEffect(() => {
    if (!user || !token) return;

    const fetchSystemInfo = async () => {
      try {
        const res = await fetch(`${API_URL}/api/system/info`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSystemInfo(data);
        }
      } catch {
        // Ignore errors
      }
    };

    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 10000);
    return () => clearInterval(interval);
  }, [user, token]);

  const validateToken = async (t: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setToken(t);
      } else {
        localStorage.removeItem('terminal_token');
      }
    } catch {
      localStorage.removeItem('terminal_token');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('terminal_token', data.token);
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  };

  const handleRegister = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  };

  const handleLogout = async () => {
    if (token) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('terminal_token');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#8b949e]">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      {/* Header */}
      <Header
        user={user}
        connectionStatus={connectionStatus}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'terminal' ? (
            <Terminal
              token={token!}
              onConnectionChange={setConnectionStatus}
            />
          ) : (
            <FileManager
              token={token!}
              currentPath=""
              onPathChange={() => {}}
            />
          )}
        </main>
      </div>

      {/* System Stats */}
      <SystemStats systemInfo={systemInfo} />
    </div>
  );
}