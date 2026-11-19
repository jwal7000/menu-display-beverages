/**
 * set-manager-pin.mjs — npm run set-manager-pin
 *
 * Makes a new random 6-digit manager PIN for admin.html's Staff picks tab, prints it once,
 * and writes only a salted PBKDF2-SHA256 hash of it to public/manager-pin.json. Commit and
 * push that file; the PIN itself is never stored anywhere.
 *
 * Run it in an ordinary terminal (not through an assistant or a shared log), so the PIN is
 * seen only by you. Then hand it to the managers.
 *
 * What this protects: admin.html is a public static page, and this repo is public, so a
 * 6-digit PIN's hash can be brute-forced offline in minutes by anyone who wants to. The PIN
 * keeps staff out of the Staff picks tab by default; it is not security. The real write
 * protection is the GitHub token each device is set up with. See menu-display-horizontal
 * cloudrun/README.md, "Manager PIN".
 */
import { randomInt, randomBytes, pbkdf2Sync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ITERATIONS = 600_000;   // OWASP's PBKDF2-SHA256 figure; ~0.5 s on a phone

export function hashPin(pin, salt = randomBytes(16), iterations = ITERATIONS) {
  const hash = pbkdf2Sync(pin, salt, iterations, 32, 'sha256');
  return { algorithm: 'PBKDF2-SHA256', iterations, salt: salt.toString('base64'), hash: hash.toString('base64') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pin  = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const out  = new URL('../public/manager-pin.json', import.meta.url);
  const body = {
    _comment: 'Manager PIN for admin.html Staff picks. Hash only; make a new one with npm run set-manager-pin.',
    ...hashPin(pin),
    updated_at: new Date().toISOString(),
  };
  writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
  console.log(`
  New manager PIN:   ${pin}

  Write it down now; it isn't saved anywhere and won't be shown again.
  Wrote the hash to public/manager-pin.json. Commit and push that file to main;
  admin.html asks for the new PIN once the Pages deploy finishes (about a minute).
`);
}
