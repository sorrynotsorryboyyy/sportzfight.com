import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Boutique',
  description:
    'Abonnements, merch et accessoires SportzFight. Les pompes et les squats restent gratuits, pour toujours.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
