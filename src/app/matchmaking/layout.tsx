import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recherche d’adversaire',
  description:
    'Recherche d’un adversaire pour un battle en 60 secondes.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
