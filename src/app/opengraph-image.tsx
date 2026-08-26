import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/site';

/**
 * The link preview card.
 *
 * Generated rather than shipped as a PNG: it stays editable like code, tracks
 * the theme tokens, and adds no binary to the repo. Rendered at build time and
 * cached, so it costs nothing per request.
 *
 * This matters more here than on most sites — the whole product is "challenge
 * someone", and until now a shared link showed nothing at all.
 */

export const alt = 'SportzFight — le sport sans excuse';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#07090c',
          // A hint of the volt glow the app uses, so the card looks like the
          // product rather than a generic dark rectangle.
          backgroundImage:
            'radial-gradient(circle at 78% 18%, rgba(154,230,0,0.20), transparent 55%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#9ae600',
          }}
        >
          60 secondes chrono
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 28,
            fontSize: 116,
            fontWeight: 900,
            letterSpacing: '-0.045em',
            lineHeight: 1,
            textTransform: 'uppercase',
            color: '#e6ecf3',
          }}
        >
          <span>Le sport</span>
          <span style={{ color: '#9ae600' }}>sans excuse.</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 36,
            fontSize: 34,
            lineHeight: 1.35,
            color: '#a7b4c4',
            maxWidth: 820,
          }}
        >
          Affronte quelqu’un en direct. Ta caméra compte les répétitions.
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 'auto',
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: '#e6ecf3',
          }}
        >
          Sportz<span style={{ color: '#9ae600' }}>Fight</span>
          <span style={{ marginLeft: 22, fontWeight: 500, color: '#4d5c70' }}>
            {SITE_NAME.toLowerCase()}.com
          </span>
        </div>
      </div>
    ),
    size,
  );
}
