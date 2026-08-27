import { createPushupDetector } from './detectors/pushup';
import { createSquatDetector } from './detectors/squat';
import { createManualDetector } from './detectors/manual';
import type { ExerciseDetector } from './types';

/**
 * The extension point for new exercises.
 *
 * Adding squats, sit-ups, burpees or pull-ups means writing one
 * ExerciseDetector and adding an entry here. The battle screen, the score
 * sync, the Firestore schema and the security rules all stay untouched —
 * `battles.exercise` is just a key into this table.
 */
export interface ExerciseSpec {
  id: string;
  label: string;
  /** Short imperative describing the goal, shown on the lobby screen. */
  tagline: string;
  emoji: string;
  /** How to place the camera for this exercise, shown before the battle. */
  setupHint: string;
  /** Camera-based counter. */
  create: () => ExerciseDetector;
  /** Tap-based counter used when the camera is unavailable. */
  createManual: () => ExerciseDetector;
  /** False for exercises not yet shipped; they render as "coming soon". */
  available: boolean;
}

export const EXERCISES: Record<string, ExerciseSpec> = {
  pushups: {
    id: 'pushups',
    label: 'Pompes',
    tagline: 'Un max de pompes en 60 secondes',
    emoji: '💪',
    setupHint:
      'Pose ton téléphone au sol, de côté, à ~2 m. Tout ton corps doit être visible.',
    create: createPushupDetector,
    createManual: () => createManualDetector('pushups', 'Pompes'),
    available: true,
  },
  squats: {
    id: 'squats',
    label: 'Squats',
    tagline: 'Un max de squats en 60 secondes',
    emoji: '🦵',
    setupHint:
      'Caméra de côté, à hauteur de hanche, à ~2 m. Pas au sol : filmé d’en bas, la profondeur est faussée.',
    create: createSquatDetector,
    createManual: () => createManualDetector('squats', 'Squats'),
    available: true,
  },
  // Planned. The battle flow already supports these the moment a detector
  // exists; only `create` and `available` need filling in.
  situps: {
    id: 'situps',
    label: 'Abdos',
    tagline: 'Un max d’abdos en 60 secondes',
    emoji: '🔥',
    setupHint:
      'Place la caméra de côté, au niveau du sol.',
    create: () => createManualDetector('situps', 'Abdos'),
    createManual: () => createManualDetector('situps', 'Abdos'),
    available: false,
  },
  burpees: {
    id: 'burpees',
    label: 'Burpees',
    tagline: 'Un max de burpees en 60 secondes',
    emoji: '⚡',
    setupHint:
      'Recule : tout ton corps doit rester dans le cadre.',
    create: () => createManualDetector('burpees', 'Burpees'),
    createManual: () => createManualDetector('burpees', 'Burpees'),
    available: false,
  },
  pullups: {
    id: 'pullups',
    label: 'Tractions',
    tagline: 'Un max de tractions en 60 secondes',
    emoji: '🏋️',
    setupHint:
      'Place la caméra face à toi, barre comprise.',
    create: () => createManualDetector('pullups', 'Tractions'),
    createManual: () => createManualDetector('pullups', 'Tractions'),
    available: false,
  },
};

export const DEFAULT_EXERCISE = 'pushups';

export const getExercise = (id: string): ExerciseSpec =>
  EXERCISES[id] ?? EXERCISES[DEFAULT_EXERCISE];

export const availableExercises = (): ExerciseSpec[] =>
  Object.values(EXERCISES).filter((e) => e.available);
