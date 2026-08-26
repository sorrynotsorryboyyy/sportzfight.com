'use client';

import { useEffect } from 'react';
import { rememberReferral } from '@/lib/partners/attribution';

/**
 * Remembers which partner sent this visitor.
 *
 * A client component because the code has to survive the round trip through
 * Google sign-in and land back here, and because attribution can only be
 * written once the visitor actually has an account.
 *
 * Renders nothing.
 */
export function RememberCode({ code }: { code: string }) {
  useEffect(() => {
    rememberReferral(code);
  }, [code]);

  return null;
}
