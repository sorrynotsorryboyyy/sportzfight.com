import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion',
  description:
    'Connecte-toi à SportzFight avec Google. Aucun mot de passe, gratuit.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
