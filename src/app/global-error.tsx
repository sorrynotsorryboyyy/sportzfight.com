'use client';

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * This component REPLACES the root layout, so it must render its own <html>
 * and <body>, and it cannot rely on globals.css having loaded. Hence the inline
 * styles — using Tailwind classes here would risk an unstyled white page at the
 * exact moment things are already going wrong.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: '#07090c',
          color: '#e6ecf3',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: '26rem', width: '100%' }}>
          <p
            style={{
              fontSize: '1.25rem',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Sportz<span style={{ color: '#9ae600' }}>Fight</span>
          </p>
          <h1
            style={{
              marginTop: '1.5rem',
              fontSize: '1.5rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '-0.03em',
            }}
          >
            Le site est momentanément indisponible
          </h1>
          <p style={{ marginTop: '0.5rem', color: '#a7b4c4', lineHeight: 1.5 }}>
            Une erreur est survenue au chargement. Réessayez dans un instant.
          </p>
          {error.digest && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#4d5c70' }}>
              Code de l’erreur : {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              width: '100%',
              height: '3.5rem',
              border: 0,
              borderRadius: '1rem',
              background: '#9ae600',
              color: '#07090c',
              fontSize: '1rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
