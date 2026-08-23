import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/firebase/auth-context';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SportzFight — Défis sportifs en 1vs1',
  description:
    'Affronte tes amis en 1vs1. Un max de pompes en 60 secondes, comptées automatiquement par ta caméra.',
  applicationName: 'SportzFight',
};

export const viewport: Viewport = {
  themeColor: '#07090c',
  width: 'device-width',
  initialScale: 1,
  // The battle screen has large tap targets already; locking zoom keeps a
  // double-tap during effort from zooming instead of counting.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-display antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
