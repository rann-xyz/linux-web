'use client';

import { useState } from 'react';

interface AuthProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export function Auth({ onLogin, onRegister }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await onLogin(email, password);
        if (!result.success) {
          setError(result.error || 'Login failed');
        }
      } else {
        const result = await onRegister(email, password);
        if (!result.success) {
          setError(result.error || 'Registration failed');
        } else {
          setSuccess('Account created! Please log in.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⌨️</div>
          <h1 className="text-2xl font-bold text-[#c9d1d9] mb-2">
            Ubuntu Cloud Terminal
          </h1>
          <p className="text-[#8b949e]">
            Real Linux terminal in your browser
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          {/* Mode Toggle */}
          <div className="flex mb-6 bg-[#0d1117] rounded-lg p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-[#21262d] text-[#c9d1d9]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register'
                  ? 'bg-[#21262d] text-[#c9d1d9]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              Register
            </button>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-[#238636]/20 border border-[#238636]/50 rounded-lg text-[#3fb950] text-sm">
              {success}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-[#da3633]/20 border border-[#da3633]/50 rounded-lg text-[#f85149] text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-[#8b949e] mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-[#c9d1d9] placeholder-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] outline-none"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-[#8b949e] mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-[#c9d1d9] placeholder-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] outline-none"
                disabled={loading}
              />
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm text-[#8b949e] mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-[#c9d1d9] placeholder-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] outline-none"
                  disabled={loading}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#6e7681] text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Processing...
                </span>
              ) : mode === 'login' ? (
                'Login'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Password Requirements */}
          {mode === 'register' && (
            <div className="mt-4 p-3 bg-[#0d1117] rounded-lg text-xs text-[#6e7681]">
              <p className="font-medium text-[#8b949e] mb-1">Password requirements:</p>
              <ul className="space-y-0.5">
                <li className={password.length >= 8 ? 'text-[#3fb950]' : ''}>
                  ✓ At least 8 characters
                </li>
                <li className={/[A-Z]/.test(password) ? 'text-[#3fb950]' : ''}>
                  ✓ One uppercase letter
                </li>
                <li className={/[a-z]/.test(password) ? 'text-[#3fb950]' : ''}>
                  ✓ One lowercase letter
                </li>
                <li className={/[0-9]/.test(password) ? 'text-[#3fb950]' : ''}>
                  ✓ One number
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-[#6e7681]">
          <p>Persistent storage • Isolated containers • Real Linux</p>
        </div>
      </div>
    </div>
  );
}