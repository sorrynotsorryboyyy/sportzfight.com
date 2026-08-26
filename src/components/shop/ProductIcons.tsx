import type { ProductIcon } from '@/lib/shop/catalog';

/**
 * Line-drawn product marks.
 *
 * public/ holds no images and next/image is unused across the project, so the
 * catalogue is illustrated the way everything else is: inline SVG on
 * currentColor, matching the stroke weight of the BottomNav icons.
 *
 * These are placeholders for real product photography, not a substitute for it.
 */

const box = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const PATHS: Record<ProductIcon, React.ReactNode> = {
  bottle: (
    <>
      <path d="M10 2h4v3h-4z" />
      <path d="M9 5h6l1 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z" />
      <path d="M8 12h8" />
    </>
  ),
  towel: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M8 5v14M4 9h4M4 13h4" />
    </>
  ),
  tee: (
    <>
      <path d="M9 3 4 6l2 4 2-1v12h8V9l2 1 2-4-5-3z" />
      <path d="M9 3a3 3 0 0 0 6 0" />
    </>
  ),
  tank: (
    <>
      <path d="M9 3 6 5v16h12V5l-3-2" />
      <path d="M9 3a3 3 0 0 0 6 0" />
      <path d="M9 3v4M15 3v4" />
    </>
  ),
  hoodie: (
    <>
      <path d="M9 4 4 7l2 4 2-1v10h8V10l2 1 2-4-5-3z" />
      <path d="M9 4a3 3 0 0 0 6 0" />
      <path d="M12 10v5" />
    </>
  ),
  shorts: (
    <>
      <path d="M5 5h14l-1 15h-5l-1-8-1 8H6z" />
      <path d="M5 9h14" />
    </>
  ),
  bag: (
    <>
      <path d="M3 8h18v11H3z" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
  rope: (
    <>
      <path d="M6 4v5M18 4v5" />
      <path d="M6 9c0 7 3 10 6 10s6-3 6-10" />
      <path d="M5 4h2M17 4h2" />
    </>
  ),
  mat: (
    <>
      <path d="M4 7a3 3 0 0 1 3-3h13v16H7a3 3 0 0 1-3-3z" />
      <path d="M7 4a3 3 0 0 0 0 6h3V4" />
    </>
  ),
};

export function ProductMark({
  icon,
  className,
}: {
  icon: ProductIcon;
  className?: string;
}) {
  return (
    <svg {...box} className={className} aria-hidden>
      {PATHS[icon]}
    </svg>
  );
}
