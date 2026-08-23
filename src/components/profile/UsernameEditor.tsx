'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import {
  USERNAME_MESSAGES,
  USERNAME_MAX,
  sanitizeToUsername,
  validateUsername,
} from '@/lib/utils/username';
import {
  UsernameError,
  changeUsername,
  isUsernameAvailable,
} from '@/lib/firebase/profile';

type Availability = 'idle' | 'checking' | 'free' | 'taken';

/**
 * Pseudo editor with a live availability check.
 *
 * Uniqueness is ultimately decided by the lock transaction, not by this check —
 * two people can pass the check and still race. The check exists so the common
 * case gives instant feedback instead of a failed submit.
 */
export function UsernameEditor({
  uid,
  current,
  /** Legacy name that must be replaced before the player can do anything else. */
  forced = false,
  onDone,
}: {
  uid: string;
  current: string;
  forced?: boolean;
  onDone?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(forced);
  const [value, setValue] = useState(() =>
    forced ? sanitizeToUsername(current) : current,
  );
  const [availability, setAvailability] = useState<Availability>('checking');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const problem = validateUsername(value);
  const unchanged = value === current;

  // Debounced availability probe. `seq` discards out-of-order responses so a
  // slow early request cannot overwrite a fast later one.
  // Nothing worth probing while the name is invalid or unchanged; that state
  // is derived below rather than written from the effect.
  const probeable = editing && !problem && !unchanged;

  useEffect(() => {
    if (!probeable) return;
    const mine = ++seq.current;

    const t = setTimeout(async () => {
      const free = await isUsernameAvailable(value, uid);
      if (seq.current === mine) setAvailability(free ? 'free' : 'taken');
    }, 350);

    return () => clearTimeout(t);
  }, [value, probeable, uid]);

  // While a probe is outstanding for the current value, show "checking".
  const shown: Availability = !probeable ? 'idle' : availability;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await changeUsername(uid, value.trim(), forced ? null : current);
      setEditing(false);
      onDone?.(value.trim());
    } catch (e) {
      setError(
        e instanceof UsernameError
          ? e.message
          : 'Impossible de changer le pseudo.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span className="truncate text-2xl font-black tracking-tight text-ink-100">
          {current}
        </span>
        <button
          onClick={() => {
            setValue(current);
            setEditing(true);
          }}
          className="shrink-0 rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-ink-400 transition-colors hover:border-volt-500 hover:text-volt-400"
        >
          Modifier
        </button>
      </div>
    );
  }

  const canSave =
    !problem && !unchanged && shown !== 'taken' && !saving;

  return (
    <div className="flex flex-col gap-2">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setAvailability('checking');
          setError(null);
        }}
        autoFocus
        maxLength={USERNAME_MAX}
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Pseudo"
        className={cn(
          'h-14 w-full rounded-xl border bg-ink-850 px-4 text-lg font-bold text-ink-100',
          'focus:outline-none focus:ring-2 focus:ring-cyan-glow/70',
          problem || shown === 'taken'
            ? 'border-flare-500'
            : shown === 'free'
              ? 'border-volt-500'
              : 'border-ink-700',
        )}
      />

      <p className="min-h-5 text-xs">
        {problem ? (
          <span className="text-flare-400">{USERNAME_MESSAGES[problem]}</span>
        ) : shown === 'checking' ? (
          <span className="text-ink-500">Vérification…</span>
        ) : shown === 'taken' ? (
          <span className="text-flare-400">Ce pseudo est déjà pris.</span>
        ) : shown === 'free' ? (
          <span className="text-volt-400">Disponible !</span>
        ) : (
          <span className="text-ink-600">
            3 à 16 caractères, lettres/chiffres/_
          </span>
        )}
      </p>

      {error && <p className="text-sm text-flare-400">{error}</p>}

      <div className="flex gap-2">
        <Button size="md" onClick={() => void save()} disabled={!canSave} loading={saving}>
          Enregistrer
        </Button>
        {!forced && (
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              setValue(current);
              setEditing(false);
              setError(null);
            }}
          >
            Annuler
          </Button>
        )}
      </div>
    </div>
  );
}
