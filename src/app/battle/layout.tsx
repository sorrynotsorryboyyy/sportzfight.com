import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Battle',
  // A battle URL is personal and ephemeral; it should never reach an index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#07090c',
  width: 'device-width',
  initialScale: 1,
  // Locked HERE and nowhere else: mid-effort a double-tap must count a rep,
  // not zoom the page. The rest of the site keeps pinch-zoom (WCAG 1.4.4).
  maximumScale: 1,
};

export default function BattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
