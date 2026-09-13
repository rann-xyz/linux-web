'use client';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('terminal_token', data.token);
        window.location.href = '/terminal';
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Connection error');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-[#c9d1d9]">
      <form onSubmit={handleLogin} className="bg-[#161b22] p-8 rounded-lg border border-[#30363d] w-full max-w-md">
        <h1 className="text-xl font-bold mb-2">Login to Linux Web Terminal</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue</p>
        
        {error && <div className="bg-red-900/30 border border-red-500 text-red-300 px-3 py-2 rounded mb-4 text-sm">{error}</div>}
        
        <div className="mb-4">
          <label className="block text-sm mb-1">Email Address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-[#c9d1d9] focus:border-[#58a6ff] outline-none" required />
        </div>
        <div className="mb-6">
          <label className="block text-sm mb-1">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-[#c9d1d9] focus:border-[#58a6ff] outline-none" required />
        </div>
        <button type="submit" disabled={loading} className="w-full bg-[#238636] hover:bg-[#2ea043] text-white py-2 rounded font-medium">
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
        <p className="text-center text-sm mt-4 text-gray-500">
          Don't have an account? <a href="/register" className="text-[#58a6ff]">Register</a> | <a href="/boot" className="text-[#58a6ff]">← Back</a>
        </p>
      </form>
    </div>
  );
}