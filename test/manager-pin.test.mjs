import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { hashPin } from '../scripts/set-manager-pin.mjs';

// The same check admin.html runs in the browser (WebCrypto), so the two must agree.
async function browserCheck(pin, cfg) {
  const key  = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(cfg.salt, 'base64'), iterations: cfg.iterations }, key, 256);
  return Buffer.from(bits).toString('base64') === cfg.hash;
}

test('a PIN hashed by the script verifies with the browser check, and others do not', async () => {
  const cfg = hashPin('042917', undefined, 1000);
  assert.equal(cfg.algorithm, 'PBKDF2-SHA256');
  assert.equal(await browserCheck('042917', cfg), true);
  assert.equal(await browserCheck('042918', cfg), false);
  assert.equal(await browserCheck('42917', cfg), false);
});

test('each hash gets its own salt', () => {
  assert.notEqual(hashPin('123456', undefined, 1000).salt, hashPin('123456', undefined, 1000).salt);
});
