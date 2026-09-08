import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ubuntu Cloud Terminal',
  description: 'Browser-based Ubuntu Linux terminal with persistent storage',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0d1117] text-[#c9d1d9]">
        {children}
      </body>
    </html>
  );
}