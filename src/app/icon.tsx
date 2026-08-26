import { ImageResponse } from 'next/og';

/**
 * The app icon, generated.
 *
 * Referenced by the manifest for home-screen installs. Kept deliberately simple
 * — an "S" mark reads at 48px where a wordmark would not.
 */

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07090c',
          color: '#9ae600',
          fontSize: 340,
          fontWeight: 900,
          letterSpacing: '-0.06em',
        }}
      >
        S
      </div>
    ),
    size,
  );
}
