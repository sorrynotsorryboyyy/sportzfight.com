'use client';

import { useEffect, useRef } from 'react';
import { useLatest } from '@/lib/utils/useLatest';
import { LM, type Landmark } from '@/lib/exercise/types';

/** The skeleton edges worth drawing for a pushup: arms and the body line. */
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
];

const JOINTS = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
  LM.LEFT_WRIST, LM.RIGHT_WRIST,
  LM.LEFT_HIP, LM.RIGHT_HIP,
] as const;

/**
 * Draws the tracked skeleton over the video.
 *
 * This is the athlete's only feedback that the camera actually sees them, so
 * it is colour-coded by validity: green when the pose is good enough to count,
 * amber when something is wrong with the form. Rendering happens on a canvas
 * driven by the same landmark stream as the detector, never by React state —
 * re-rendering a component tree at 30fps would be wasteful and janky.
 */
export function PoseOverlay({
  landmarks,
  valid,
  mirrored = true,
}: {
  landmarks: Landmark[] | null;
  valid: boolean;
  mirrored?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The draw loop runs at display rate and must see the newest landmarks
  // without being rebuilt on every frame.
  const lmRef = useLatest(landmarks);
  const validRef = useLatest(valid);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(draw);

      const parent = canvas.parentElement;
      if (parent) {
        // Match the backing store to the displayed size so lines stay crisp.
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const lms = lmRef.current;
      if (!lms) return;

      const px = (l: Landmark) => ({
        x: (mirrored ? 1 - l.x : l.x) * width,
        y: l.y * height,
      });

      const colour = validRef.current ? '#9ae600' : '#ffc93c';
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      for (const [a, b] of EDGES) {
        const la = lms[a];
        const lb = lms[b];
        if (!la || !lb) continue;
        if (la.visibility < 0.5 || lb.visibility < 0.5) continue;
        const pa = px(la);
        const pb = px(lb);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      for (const j of JOINTS) {
        const l = lms[j];
        if (!l || l.visibility < 0.5) continue;
        const p = px(l);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [mirrored, lmRef, validRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    />
  );
}
