'use client';

import { Suspense } from 'react';
import { AuthForm } from '@/components/auth/AuthForm';
import { SetupNotice } from '@/components/ui/SetupNotice';
import { Spinner } from '@/components/ui/Spinner';
import { isFirebaseConfigured } from '@/lib/firebase/client';

export default function Page() {
  if (!isFirebaseConfigured) return <SetupNotice />;
  return (
    <Suspense fallback={<Spinner />}>
      <AuthForm />
    </Suspense>
  );
}
