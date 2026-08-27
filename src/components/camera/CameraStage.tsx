'use client';

import { cn } from '@/lib/utils/cn';
import { FORM_MESSAGES, type DetectorResult } from '@/lib/exercise/types';
import type { EngineError, EngineStatus } from '@/lib/exercise/runtime/PoseEngine';
import type { Landmark } from '@/lib/exercise/types';
import { PoseOverlay } from './PoseOverlay';
import { Button } from '@/components/ui/Button';

/**
 * The camera viewport plus its live coaching feedback.
 *
 * The video element is always mounted (even before start) so the engine has a
 * target to attach the stream to. Nothing here ever leaves the device.
 *
 * `fullbleed` fills its positioned parent, for the lobby and the battle split
 * where the camera IS the screen; `framed` keeps a rounded aspect-ratio box.
 * One component either way, so the tracking indicator and the error handling
 * cannot drift apart between the two.
 */
export function CameraStage({
  videoRef,
  landmarks,
  result,
  status,
  error,
  onRetry,
  variant = 'framed',
  /**
   * Which top corner the tracking pill sits in.
   *
   * A prop rather than a fixed corner because the full-bleed consumers have
   * different furniture up there: the battle lobby draws the logo top-left,
   * where the pill used to overlap it into an unreadable stack. Top-right is
   * not a global answer either — during the effort the clock owns that corner.
   */
  trackingPillPosition = 'top-left',
  className,
  children,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarks: Landmark[] | null;
  result: DetectorResult | null;
  status: EngineStatus;
  error: EngineError | null;
  onRetry?: () => void;
  variant?: 'framed' | 'fullbleed';
  trackingPillPosition?: 'top-left' | 'top-right';
  className?: string;
  children?: React.ReactNode;
}) {
  // ONLY posture drives the indicator. Rep notes ("trop rapide") are transient
  // and would otherwise flash a warning on a perfectly good rep.
  const posture = result?.postureIssues ?? [];
  const tracked = !!landmarks;
  const good = tracked && posture.length === 0;
  const fullbleed = variant === 'fullbleed';

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-ink-900',
        fullbleed
          ? 'size-full'
          : cn(
              'aspect-[3/4] w-full rounded-2xl border sm:aspect-video',
              good ? 'border-volt-500/60' : 'border-ink-800',
            ),
        className,
      )}
    >
      <video
        ref={videoRef}
        // autoPlay matters: PoseEngine also calls play(), but if the element is
        // not ready when the stream attaches, that single call is lost and the
        // video never starts — while detection keeps drawing the skeleton over
        // a black rectangle, which looks like a rendering bug rather than a
        // playback one.
        autoPlay
        playsInline
        muted
        // Mirrored so moving left on screen matches moving left in reality.
        className="size-full scale-x-[-1] object-cover"
      />

      <PoseOverlay landmarks={landmarks} valid={good} mirrored />

      {/* Tracking state. The athlete's only signal that the body is not being
          seen AT ALL: the coaching banner below stays silent in that case, and
          the `good` border does not exist on the full-bleed variant. */}
      <div
        className={cn(
          'absolute top-3 flex items-center gap-1.5 rounded-full bg-ink-950/75 px-2.5 py-1 backdrop-blur',
          trackingPillPosition === 'top-right' ? 'right-3' : 'left-3',
        )}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            good ? 'bg-volt-500' : tracked ? 'bg-gold' : 'bg-ink-600',
          )}
        />
        <span className="text-3xs font-bold uppercase tracking-widest text-ink-300">
          {good ? 'Détecté' : tracked ? 'Ajuste' : 'Recherche…'}
        </span>
      </div>

      {/* One coaching message at a time: mid-effort nobody reads a list. */}
      {tracked && posture.length > 0 && (
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-gold/95 px-3 py-2 text-center text-sm font-bold text-ink-950">
          {FORM_MESSAGES[posture[0]]}
        </div>
      )}

      {(status === 'loading-model' || status === 'requesting-camera') && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/85 p-6 text-center">
          <div>
            <span className="mx-auto mb-3 block size-8 animate-spin rounded-full border-2 border-ink-700 border-t-volt-500" />
            <p className="text-sm text-ink-300">
              {status === 'loading-model'
                ? 'Chargement du modèle de détection…'
                : 'Autorise l’accès à la caméra'}
            </p>
          </div>
        </div>
      )}

      {/* The camera is mandatory, so a failure is blocking: there is no manual
          escape hatch to offer. */}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/95 p-6">
          <div className="w-full max-w-xs text-center">
            <p className="mb-2 text-base font-bold text-ink-100">
              Caméra indisponible
            </p>
            <p className="mb-4 text-sm leading-relaxed text-ink-300">
              {error.message}
            </p>
            <p className="mb-4 text-xs leading-relaxed text-ink-500">
              SportzFight compte tes pompes avec la caméra : elle est
              indispensable pour lancer un battle.
            </p>
            {onRetry && (
              <Button size="md" onClick={onRetry}>
                Réessayer
              </Button>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
