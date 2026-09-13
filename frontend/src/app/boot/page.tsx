'use client';
import { useState } from 'react';

export default function BootPage() {
  const [loading] = useState(false);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d1117] text-[#c9d1d9]">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">🐧 Linux Web Terminal</h1>
        <p className="text-gray-500">Browser-based Ubuntu Linux terminal with persistent storage</p>
      </div>
      
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <a href="/register" className="btn btn-primary w-full text-center py-3 rounded-lg">📝 Register Account</a>
        <a href="/login" className="btn btn-secondary w-full text-center py-3 rounded-lg border border-[#30363d]">🔐 Login</a>
        <a href="/terminal" className="btn btn-secondary w-full text-center py-3 rounded-lg border border-[#30363d]" onClick={() => alert('Please login first')}>🎮 Demo Mode</a>
      </div>
      
      <div className="mt-12 text-gray-600 text-sm">
        ⚡ Server: Terminal Session • 🔒 Secure • 🌐 Web Access
      </div>
    </div>
  );
}