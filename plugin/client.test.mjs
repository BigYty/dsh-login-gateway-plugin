import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const pluginDir = import.meta.dirname;
const packageJson = JSON.parse(await readFile(path.join(pluginDir, 'package.json'), 'utf8'));
const clientSource = await readFile(path.join(pluginDir, 'client.js'), 'utf8');

test('plugin declares the tested DSH runtime range consistently', () => {
  assert.equal(packageJson.engines.dsh, packageJson.peerDependencies['@deepseek-ai/dsh']);
  assert.match(packageJson.peerDependencies['@deepseek-ai/dsh'], /^>=0\.2\.2-rc\.1 <0\.3\.0-0$/);
});

function createReactHarness() {
  const values = [];
  const effects = [];
  let cursor = 0;
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (next) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useEffect(effect) {
      const index = cursor++;
      if (!effects[index]) effects[index] = effect;
    },
  };
  return {
    React,
    render(Component) {
      cursor = 0;
      return Component({ close() {} });
    },
    mountEffects() {
      return effects.map((effect) => effect?.()).filter(Boolean);
    },
  };
}

function findNode(root, predicate) {
  const pending = Array.isArray(root) ? [...root] : [root];
  while (pending.length) {
    const node = pending.shift();
    if (!node || typeof node !== 'object') continue;
    if (predicate(node)) return node;
    pending.push(...(node.children || []));
  }
  return null;
}

function findInput(root, id) {
  const input = findNode(root, (node) => node.type === 'input' && node.props.id === id);
  assert.ok(input, `Expected input ${id} to render`);
  return input;
}

function findButton(root, label) {
  const button = findNode(root, (node) => node.type === 'button' && node.children.includes(label));
  assert.ok(button, `Expected button ${label} to render`);
  return button;
}

function response(data = {}, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => data };
}

async function flushEffects() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('client apply registers localized settings section and user actions call gateway endpoints', async () => {
  const loaded = [];
  const windowListeners = new Map();
  const requests = [];
  const navigations = [];
  const popupNavigations = [];
  const registeredLocales = [];
  const registeredSections = [];
  const popup = { location: { replace: (url) => popupNavigations.push(url) }, close() {} };
  const window = {
    __ModuleLoader__: { load: (module) => loaded.push(module) },
    location: {
      origin: 'https://dsh.example.test',
      href: 'https://dsh.example.test/settings',
      replace: (url) => navigations.push(url),
    },
    addEventListener: (name, listener) => windowListeners.set(name, listener),
    removeEventListener: (name) => windowListeners.delete(name),
    setTimeout: () => 1,
    clearTimeout() {},
    confirm: () => true,
    open: () => popup,
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/auth/admin') return response({ username: 'existing-user', backgroundUrl: '', customHtml: '', turnstileConfigured: true });
    if (url === '/auth/admin/turnstile/start') return response({ id: 'check-id', checkUrl: '/auth/turnstile-check?id=check-id' });
    return response({ ok: true });
  };
  const runtime = createReactHarness();
  vm.runInNewContext(clientSource, { window, fetch, URL, Uint8Array, btoa: () => 'encoded', console });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, '@local/dsh-login-gateway');
  const plugin = loaded[0].factory((name) => {
    assert.equal(name, 'react');
    return runtime.React;
  });
  const context = {
    locale: {
      bind(namespace) { assert.equal(namespace, 'dsh.loginGateway'); return (key) => key; },
      register(namespace, dictionaries) { registeredLocales.push({ namespace, dictionaries }); },
    },
    effect(effect) { effect(); },
    slots: {
      inject(name, callback) { assert.equal(name, 'settings.section'); callback(); },
      register(options, Component) { registeredSections.push({ options, Component }); },
    },
  };

  plugin.apply(context);
  assert.equal(registeredLocales.length, 1);
  assert.equal(registeredLocales[0].namespace, 'dsh.loginGateway');
  assert.ok(registeredLocales[0].dictionaries.en.title);
  assert.ok(registeredLocales[0].dictionaries.zh.title);
  assert.equal(registeredSections.length, 1);
  assert.equal(registeredSections[0].options.id, 'dsh-login-gateway');
  assert.equal(registeredSections[0].options.order, 45);

  let tree = runtime.render(registeredSections[0].Component);
  runtime.mountEffects();
  await flushEffects();
  tree = runtime.render(registeredSections[0].Component);
  assert.equal(requests[0].url, '/auth/admin');

  findInput(tree, 'dsh-access-current').props.onChange({ target: { value: 'current-password' } });
  findInput(tree, 'dsh-access-username').props.onChange({ target: { value: 'updated-user' } });
  tree = runtime.render(registeredSections[0].Component);
  const accountForm = findNode(tree, (node) => node.type === 'form');
  await accountForm.props.onSubmit({ preventDefault() {} });
  tree = runtime.render(registeredSections[0].Component);
  const accountUpdate = requests.find((request) => request.url === '/auth/admin/update');
  assert.ok(accountUpdate);
  assert.deepEqual(JSON.parse(accountUpdate.options.body), {
    currentPassword: 'current-password', username: 'updated-user', newPassword: '',
  });
  assert.ok(findNode(tree, (node) => node.type === 'p' && node.children.includes('saved')));

  findInput(tree, 'dsh-access-background-url').props.onChange({ target: { value: 'https://cdn.example.test/login.jpg' } });
  tree = runtime.render(registeredSections[0].Component);
  await findButton(tree, 'saveAppearance').props.onClick();
  tree = runtime.render(registeredSections[0].Component);
  const appearanceUpdate = requests.find((request) => request.url === '/auth/admin/preferences');
  assert.ok(appearanceUpdate);
  assert.deepEqual(JSON.parse(appearanceUpdate.options.body), {
    backgroundUrl: 'https://cdn.example.test/login.jpg', customHtml: '',
  });

  findInput(tree, 'dsh-access-new-site-key').props.onChange({ target: { value: 'new-site-key' } });
  findInput(tree, 'dsh-access-new-secret-key').props.onChange({ target: { value: 'new-secret-key' } });
  findInput(tree, 'dsh-access-turnstile-password').props.onChange({ target: { value: 'current-password' } });
  tree = runtime.render(registeredSections[0].Component);
  await findButton(tree, 'verifyKeys').props.onClick();
  const rotationStart = requests.find((request) => request.url === '/auth/admin/turnstile/start');
  assert.ok(rotationStart);
  assert.deepEqual(JSON.parse(rotationStart.options.body), {
    currentPassword: 'current-password', siteKey: 'new-site-key', secretKey: 'new-secret-key',
  });
  assert.deepEqual(popupNavigations, ['https://dsh.example.test/auth/turnstile-check?id=check-id']);
  windowListeners.get('message')({
    origin: window.location.origin,
    data: { type: 'dsh-turnstile-key-check-result', id: 'check-id', ok: true },
  });

  tree = runtime.render(registeredSections[0].Component);
  await findButton(tree, 'signOut').props.onClick();
  assert.ok(requests.some((request) => request.url === '/auth/logout' && request.options.method === 'POST'));
  assert.deepEqual(navigations, ['/auth/login']);
  assert.equal(windowListeners.has('message'), true);
});
