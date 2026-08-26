import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Footer } from '@/components/ui/Footer';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Logo className="text-2xl" />
      <div>
        <p className="text-6xl font-black leading-none tracking-tighter text-volt-500">
          404
        </p>
        <h1 className="mt-3 text-2xl font-black uppercase tracking-tighter">
          Cette page n’existe pas
        </h1>
        <p className="mt-2 text-ink-400">
          Le lien est peut-être périmé, ou l’adresse mal recopiée.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/">
          <Button>Retour à l’accueil</Button>
        </Link>
        <Link href="/matchmaking">
          <Button variant="ghost">Battle</Button>
        </Link>
      </div>
      <Footer className="mt-4" />
    </main>
  );
}
