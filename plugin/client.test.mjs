import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const pluginDir = import.meta.dirname;
const packageJson = JSON.parse(await readFile(path.join(pluginDir, 'package.json'), 'utf8'));
const clientSource = await readFile(path.join(pluginDir, 'client.js'), 'utf8');

test('plugin declares the tested DSH runtime range consistently', () => {
  assert.equal(packageJson.engines.dsh, packageJson.peerDependencies['@deepseek-ai/dsh']);
  assert.match(packageJson.peerDependencies['@deepseek-ai/dsh'], /^>=0\.2\.2-rc\.1 <0\.3\.0-0$/);
});

test('settings client registers its panel row and protects its module loading boundary', () => {
  assert.match(clientSource, /window\.__ModuleLoader__\.load\(/);
  assert.match(clientSource, /id: 'dsh-login-gateway'/);
  assert.match(clientSource, /ctx\.slots\.inject\('settings\.section'/);
  assert.match(clientSource, /ctx\.locale\.register\(NS, dictionaries\)/);
  assert.match(clientSource, /fetch\('\/auth\/admin'/);
  assert.match(clientSource, /fetch\('\/auth\/admin\/update'/);
  assert.match(clientSource, /fetch\('\/auth\/admin\/preferences'/);
});
