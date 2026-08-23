/**
 * Battle codes get read aloud and typed one-handed, so the alphabet omits
 * characters that collide visually: I, O, S, Z and the digits 0, 1, 2, 5.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY346789';
export const CODE_LENGTH = 6;

/**
 * Map each excluded lookalike onto the character it is most often mistaken
 * for, which IS in the alphabet. Only excluded characters appear as keys, so
 * normalizing never rewrites a character that was legitimately generated.
 */
const LOOKALIKE: Record<string, string> = {
  I: 'J', L: 'L',          // L is in the alphabet; listed for clarity only
  O: 'Q', '0': 'Q',
  S: '4', '5': '4',
  Z: '3', '2': '3',
  '1': 'J',
};

export function generateCode(): string {
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Accept sloppy input: lowercase, spaces, and the ambiguous lookalikes. */
export function normalizeCode(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (!/[A-Z0-9]/.test(ch)) continue;
    // Only substitute characters the alphabet excludes.
    const mapped = ALPHABET.includes(ch) ? ch : (LOOKALIKE[ch] ?? '');
    if (mapped) out += mapped;
    if (out.length === CODE_LENGTH) break;
  }
  return out;
}

export const isValidCode = (c: string) =>
  c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch));
