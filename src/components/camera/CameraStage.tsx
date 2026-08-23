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
 */
export function CameraStage({
  videoRef,
  landmarks,
  result,
  status,
  error,
  onRetry,
  onUseManual,
  className,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarks: Landmark[] | null;
  result: DetectorResult | null;
  status: EngineStatus;
  error: EngineError | null;
  onRetry?: () => void;
  onUseManual?: () => void;
  className?: string;
}) {
  const issues = result?.formFeedback ?? [];
  const tracked = !!landmarks;
  const good = tracked && issues.length === 0;

  return (
    <div
      className={cn(
        'relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-ink-900 sm:aspect-video',
        good ? 'border-volt-500/60' : 'border-ink-800',
        className,
      )}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        // Mirrored so moving left on screen matches moving left in reality.
        className="size-full scale-x-[-1] object-cover"
      />

      <PoseOverlay landmarks={landmarks} valid={good} mirrored />

      {/* Tracking state, top-left */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-ink-950/75 px-2.5 py-1 backdrop-blur">
        <span
          className={cn(
            'size-1.5 rounded-full',
            good ? 'bg-volt-500' : tracked ? 'bg-gold' : 'bg-ink-600',
          )}
        />
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-300">
          {good ? 'Détecté' : tracked ? 'Ajuste' : 'Recherche…'}
        </span>
      </div>

      {/* Form coaching, bottom. One message at a time: mid-effort nobody reads
          a list. */}
      {tracked && issues.length > 0 && (
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-gold/95 px-3 py-2 text-center text-sm font-bold text-ink-950">
          {FORM_MESSAGES[issues[0]]}
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

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/95 p-6">
          <div className="w-full max-w-xs text-center">
            <p className="mb-4 text-sm leading-relaxed text-ink-200">
              {error.message}
            </p>
            <div className="flex flex-col gap-2">
              {onRetry && (
                <Button size="md" onClick={onRetry}>
                  Réessayer
                </Button>
              )}
              {onUseManual && (
                <Button size="md" variant="secondary" onClick={onUseManual}>
                  Compter manuellement
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
