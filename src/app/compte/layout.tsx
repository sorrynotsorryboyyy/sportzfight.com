import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mon compte',
  description:
    'Ton profil, ta progression, ta série et l’historique de tes battles.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
