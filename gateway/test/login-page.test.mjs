import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('Turnstile callbacks populate and clear exactly one submitted token', async () => {
  const html = await readFile(new URL('../public/login.html', import.meta.url), 'utf8');
  assert.match(html, /data-response-field="false"/);
  const script = html.match(/<script data-cfasync="false" nonce="__NONCE__">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'inline login script exists');
  let field;
  const controls = new Map();
  const form = {
    querySelector: () => field,
    appendChild: (value) => { field = value; },
    addEventListener: () => {},
  };
  const element = () => ({ textContent: '', addEventListener() {} });
  for (const id of ['#submit', '#error', '#password-error', '#turnstile-error', '#username', '#password']) controls.set(id, element());
  const window = {};
  const document = {
    querySelector: (selector) => selector === '#login' ? form : controls.get(selector),
    createElement: () => ({}),
    body: { dataset: {} },
  };
  runInNewContext(script, { window, document, URL });
  window.dshTurnstileVerified('synthetic-token');
  assert.equal(field.name, 'cf-turnstile-response');
  assert.equal(field.value, 'synthetic-token');
  window.dshTurnstileVerified('replacement-token');
  assert.equal(field.value, 'replacement-token');
  window.dshTurnstileExpired();
  assert.equal(field.value, '');
});
