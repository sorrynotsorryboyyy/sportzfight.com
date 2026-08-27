import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The camera has to survive every phase transition on the battle screen.
 *
 * Asserted on the source rather than by rendering: the failure is a JSX
 * structure mistake, and a render test would not catch it without jsdom video
 * support and a fake MediaStream. The same precedent is set in bot.test.ts,
 * where a dependency-array bug is caught by reading the hook's text.
 */
const CAMERA_TAG = '<CameraStage';
const COUNTDOWN_TAG = '<Countdown';
const BLOCK_COMMENT = new RegExp('\\/\\*[\\s\\S]*?\\*\\/', 'g');
const LINE_COMMENT = new RegExp('^\\s*\\/\\/.*$', 'gm');

const PAGE = readFileSync('src/app/battle/[id]/page.tsx', 'utf8');

/**
 * Strip comments, so prose ABOUT CameraStage does not count as a call site —
 * and this file's own explanation of the bug is long.
 */
const CODE = PAGE.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');

describe('the camera survives every phase transition', () => {
  /**
   * The bug that shipped, twice.
   *
   * <CameraStage> was rendered from two mutually exclusive returns, lobby and
   * in-play. React reconciles children by position, and the in-play branch put
   * <Countdown/> at index 0 — displacing the camera — so crossing
   * waiting -> countdown destroyed the <video> node and built a new one.
   * videoRef repointed to the new element, nothing re-assigned srcObject, and
   * PoseEngine kept pumping the old detached node, which still had a live
   * MediaStream. Landmarks kept flowing, so the athlete watched a pose
   * skeleton drawn over a black rectangle for the entire battle.
   *
   * An earlier fix added autoPlay and playback retries, addressing a real but
   * DIFFERENT cause of the same symptom. This is the structural one.
   */
  it('renders CameraStage exactly once', () => {
    const uses = CODE.split(CAMERA_TAG).length - 1;
    expect(
      uses,
      'two CameraStage call sites means two <video> elements, and crossing ' +
        'between them destroys the camera mid-battle',
    ).toBe(1);
  });

  it('puts the countdown after the camera, never before it', () => {
    // Child index 0 is the camera's reconciliation slot. A conditional sibling
    // placed ahead of it displaces the whole subtree on the phase change.
    const camera = CODE.indexOf(CAMERA_TAG);
    const countdown = CODE.lastIndexOf(COUNTDOWN_TAG);
    expect(camera).toBeGreaterThan(-1);
    expect(countdown).toBeGreaterThan(camera);
  });

  it('never restarts the camera to recover from a phase change', () => {
    // startCamera() disposes the engine and re-requests getUserMedia: a black
    // flash, and on some browsers a fresh permission prompt mid-countdown. It
    // belongs on mount and on the explicit retry button, nowhere else.
    const starts = CODE.split('startCamera()').length - 1;
    expect(starts).toBeLessThanOrEqual(2);
  });
});
