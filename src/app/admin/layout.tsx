import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Banc de réglage',
  description:
    'Outil interne de réglage des détecteurs.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
