'use client';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function RegisterPage() {
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullname, email, password })
      });
      const data = await res.json();
      if (data.success) {
        alert('Account created! Please login.');
        window.location.href = '/login';
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch {
      setError('Connection error');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-[#c9d1d9]">
      <form onSubmit={handleRegister} className="bg-[#161b22] p-8 rounded-lg border border-[#30363d] w-full max-w-md">
        <h1 className="text-xl font-bold mb-2">Create Your Account</h1>
        <p className="text-sm text-gray-500 mb-6">Fill in your details to get started</p>
        
        {error && <div className="bg-red-900/30 border border-red-500 text-red-300 px-3 py-2 rounded mb-4 text-sm">{error}</div>}
        
        <div className="mb-4">
          <label className="block text-sm mb-1">Nama Lengkap</label>
          <input type="text" value={fullname} onChange={e => setFullname(e.target.value)} placeholder="John Doe"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-[#c9d1d9] focus:border-[#58a6ff] outline-none" required />
        </div>
        <div className="mb-4">
          <label className="block text-sm mb-1">Email Address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-[#c9d1d9] focus:border-[#58a6ff] outline-none" required />
        </div>
        <div className="mb-6">
          <label className="block text-sm mb-1">Password (min 6 chars)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-[#c9d1d9] focus:border-[#58a6ff] outline-none" required minLength={6} />
        </div>
        <button type="submit" disabled={loading} className="w-full bg-[#238636] hover:bg-[#2ea043] text-white py-2 rounded font-medium">
          {loading ? 'Registering...' : 'Register'}
        </button>
        <p className="text-center text-sm mt-4 text-gray-500">
          Already have an account? <a href="/login" className="text-[#58a6ff]">Login</a> | <a href="/boot" className="text-[#58a6ff]">← Back</a>
        </p>
      </form>
    </div>
  );
}