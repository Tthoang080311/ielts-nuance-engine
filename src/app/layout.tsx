import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IELTS Nuance Mastery & Real-Time Omni-Sync Engine',
  description:
    'Doubt-Driven Offline-First IELTS Writing Task 2, Speaking Naturalizer & 15,000+ Virtualized Vocab SM-2 Engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-background text-textPrimary antialiased">
        {children}
      </body>
    </html>
  );
}