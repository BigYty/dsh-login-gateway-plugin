import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMap, tokenFromJournal } from './sync-dsh-bootstrap.mjs';

const token = 'a'.repeat(43);

test('extracts only valid tokens from the configured DSH public host', () => {
  assert.equal(tokenFromJournal(`dsh web: https://example.test/?token=${token}`, 'example.test'), token);
  assert.equal(tokenFromJournal(`dsh web: https://other.test/?token=${token}`, 'example.test'), null);
  assert.equal(tokenFromJournal('dsh web: https://example.test/?token=bad', 'example.test'), null);
  assert.equal(tokenFromJournal(`dsh web: https://example.test/?token=${token}\ninvalid`, 'example.test'), token);
});

test('renders the bootstrap map and rejects nginx injection', () => {
  assert.match(renderMap(token), /map \$http_cookie \$dsh_boot_suffix/);
  assert.match(renderMap(token), /~\*dsh-auth-/);
  assert.throws(() => renderMap('invalid; include /tmp/x;'), /Invalid bootstrap token/);
});
