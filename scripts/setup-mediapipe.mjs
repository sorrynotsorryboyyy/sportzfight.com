#!/usr/bin/env node
/**
 * Stages the MediaPipe runtime into public/ so the app never depends on a CDN.
 *
 * These files are large (~22MB of WASM plus a 5.8MB model) and are byte-for-byte
 * derivable from the installed package, so they are generated at install time
 * rather than committed. That keeps the repo small and guarantees the WASM
 * always matches the @mediapipe/tasks-vision version in package.json.
 *
 * Only the variants the loader can actually request are copied:
 * `FilesetResolver.forVisionTasks(path)` builds `vision_wasm_internal.*` when
 * the browser has SIMD and `vision_wasm_nosimd_internal.*` when it does not.
 * The `_module_` variant is only used by the worker-module entry point, which
 * this app does not use.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, stat, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmOut = join(root, 'public', 'mediapipe', 'wasm');
const modelOut = join(root, 'public', 'models');

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const MODEL = {
  name: 'pose_landmarker_lite.task',
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  minBytes: 4_000_000,
};

const exists = async (p) => {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
};

async function copyWasm() {
  await mkdir(wasmOut, { recursive: true });
  let copied = 0;
  for (const f of WASM_FILES) {
    const from = join(wasmSrc, f);
    if (!(await exists(from))) {
      console.error(
        `[mediapipe] missing ${f} in node_modules — run npm install first`,
      );
      process.exitCode = 1;
      return;
    }
    if (await exists(join(wasmOut, f))) continue;
    await copyFile(from, join(wasmOut, f));
    copied++;
  }
  console.log(
    copied
      ? `[mediapipe] staged ${copied} wasm file(s) -> public/mediapipe/wasm`
      : '[mediapipe] wasm already staged',
  );
}

async function fetchModel() {
  await mkdir(modelOut, { recursive: true });
  const dest = join(modelOut, MODEL.name);

  const size = await exists(dest);
  if (size >= MODEL.minBytes) {
    console.log('[mediapipe] pose model already present');
    return;
  }
  if (size) await rm(dest); // truncated from an interrupted download

  console.log('[mediapipe] downloading pose model (~5.8MB)…');
  const res = await fetch(MODEL.url);
  if (!res.ok || !res.body) {
    console.error(
      `[mediapipe] model download failed (HTTP ${res.status}). ` +
        'The app will build, but camera counting needs this file.',
    );
    process.exitCode = 1;
    return;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));

  if ((await exists(dest)) < MODEL.minBytes) {
    console.error('[mediapipe] downloaded model looks truncated');
    process.exitCode = 1;
    return;
  }
  console.log('[mediapipe] pose model ready -> public/models');
}

await copyWasm();
await fetchModel();
