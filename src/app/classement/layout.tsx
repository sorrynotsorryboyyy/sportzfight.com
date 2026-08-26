import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Top Mondial',
  description:
    'Le classement mondial SportzFight : les meilleurs joueurs par victoires et par nombre de répétitions.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
