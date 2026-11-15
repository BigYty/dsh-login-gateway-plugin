import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createHandler, hashPassword, loadConfig, loadCredentialState, verifySession } from '../server.mjs';

const password = 'correct horse battery staple';
const config = loadConfig({
  EXPECTED_HOSTNAME: 'dsh.example.test',
  PUBLIC_ORIGIN: 'https://dsh.example.test',
  AUTH_USERNAME: 'demo-user',
  AUTH_PASSWORD_HASH: hashPassword(password),
  SESSION_SECRET: 'test-only-secret-with-at-least-32-bytes',
  TURNSTILE_SITE_KEY: 'site-key',
  TURNSTILE_SECRET_KEY: 'test-secret',
  PORT: '31322',
});

async function withServer(fetchImpl, run, options = {}) {
  const { credentialFile, ...handlerOptions } = options;
  const serverConfig = { ...config, passwordHash: Buffer.from(config.passwordHash), passwordSalt: Buffer.from(config.passwordSalt) };
  if (credentialFile) serverConfig.credentialFile = credentialFile;
  const server = createServer(createHandler(serverConfig, { fetchImpl, ...handlerOptions }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`, serverConfig); }
  finally { server.close(); await once(server, 'close'); }
}

function signedCookie(serverConfig = config) {
  const payload = Buffer.from(JSON.stringify({
    sub: serverConfig.username,
    exp: Math.floor(Date.now() / 1000) + 300,
    generation: serverConfig.credentialGeneration,
    nonce: 'test-nonce',
  })).toString('base64url');
  const signature = createHmac('sha256', serverConfig.sessionSecret).update(payload).digest('base64url');
  return `__Host-dsh_gate=${payload}.${signature}`;
}

function siteverifySuccess(hostname = config.hostname, action = 'dsh-login', expectedSecret = 'test-secret', expectedToken = 'challenge-token') {
  return async (_url, request) => {
    const body = new URLSearchParams(request.body);
    assert.equal(body.get('secret'), expectedSecret);
    assert.equal(body.get('response'), expectedToken);
    return new Response(JSON.stringify({ success: true, hostname, action }), { status: 200 });
  };
}

test('credential state is initialized with private permissions and survives process reload', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-login-gateway-'));
  try {
    const filePath = path.join(directory, 'credentials.json');
    const first = { ...config, credentialFile: filePath, credentialGeneration: 0 };
    await loadCredentialState(first);
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    const initialized = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(initialized.username, 'demo-user');
    assert.equal(initialized.siteKey, 'site-key');
    assert.equal(initialized.turnstileSecret, 'test-secret');
    assert.equal(initialized.backgroundUrl, '');
    assert.equal(initialized.customHtml, '');
    assert.equal(initialized.generation, 0);
    assert.equal(JSON.stringify(initialized).includes(password), false);

    const [passwordHash, passwordSalt] = hashPassword('another long secure passphrase').split(':');
    await writeFile(filePath, JSON.stringify({ username: 'DurableUser', passwordHash, passwordSalt, generation: 4, adornmentDraft: '<script>legacy text</script>' }), { mode: 0o600 });
    const restarted = { ...first, username: 'StaleEnvUser', credentialGeneration: 0 };
    await loadCredentialState(restarted);
    assert.equal(restarted.username, 'DurableUser');
    assert.equal(restarted.credentialGeneration, 4);
    assert.equal(restarted.customHtml, '');
    const migrated = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(migrated.customHtml, '');
    assert.equal(Object.hasOwn(migrated, 'adornmentDraft'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('session signatures reject tampering and expiration', () => {
  const token = Buffer.from(JSON.stringify({ sub: 'demo-user', exp: 2000, generation: 0 })).toString('base64url');
  const signature = createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  assert.ok(verifySession(`${token}.${signature}`, config.sessionSecret, 1000_000));
  assert.equal(verifySession(`${token}x.${signature}`, config.sessionSecret, 1000_000), false);
  assert.equal(verifySession(`${token}.${signature}`, config.sessionSecret, 2000_000), false);
});

test('configuration rejects non-FQDN hostnames and non-HTTPS origins', () => {
  const env = {
    EXPECTED_HOSTNAME: 'dsh.example.test', PUBLIC_ORIGIN: 'https://dsh.example.test', AUTH_USERNAME: 'demo-user',
    AUTH_PASSWORD_HASH: hashPassword(password), SESSION_SECRET: 'test-only-secret-with-at-least-32-bytes',
    TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'test-secret',
  };
  assert.throws(() => loadConfig({ ...env, EXPECTED_HOSTNAME: '127.0.0.1' }), /fully qualified/);
  assert.throws(() => loadConfig({ ...env, PUBLIC_ORIGIN: 'http://dsh.example.test' }), /HTTPS/);
});

test('login page exposes site key but no secret and enforces CSP nonce', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const response = await fetch(`${base}/login`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /data-sitekey="site-key"/);
    assert.doesNotMatch(html, /test-secret/);
    assert.doesNotMatch(html, /id="(?:username|password)"[^>]*required/);
    assert.ok(html.includes('animation: shake .12s ease-in-out 3'));
    assert.ok(html.includes('请检查用户名/密码'));
    assert.ok(html.includes('请完成人机验证！'));
    assert.match(html, /data-callback="dshTurnstileVerified"/);
    assert.match(html, /data-cfasync="false" nonce="[^"]+"/);
    assert.match(html, /data-cfasync="false" src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"/);
    assert.doesNotMatch(html, /__[A-Z_]+__/);
    const nonce = response.headers.get('content-security-policy').match(/nonce-([^']+)/)[1];
    assert.ok(html.includes(`nonce="${nonce}"`));
  });
});

test('protected check fails closed without a signed session', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const response = await fetch(`${base}/check`);
    assert.equal(response.status, 401);
  });
});

test('login rejects invalid origin before contacting Turnstile', async () => {
  let called = false;
  await withServer(async () => { called = true; }, async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=demo-user&password=wrong&cf-turnstile-response=challenge-token',
    });
    assert.equal(response.status, 403);
    assert.equal(called, false);
  });
});

test('opaque browser origin is accepted only for the configured forwarded host and port', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const body = new URLSearchParams({ username: 'demo-user', password: 'wrong', 'cf-turnstile-response': 'challenge-token' });
    const noForwardedHost = await fetch(`${base}/login`, {
      method: 'POST', headers: { Origin: 'null', Host: 'dsh.example.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    assert.equal(noForwardedHost.status, 403);
    const accepted = await fetch(`${base}/login`, {
      method: 'POST', headers: { Origin: 'null', 'X-Forwarded-Host': 'dsh.example.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    assert.equal(accepted.status, 401);
    const wrongPort = await fetch(`${base}/login`, {
      method: 'POST', headers: { Origin: 'null', 'X-Forwarded-Host': 'dsh.example.test:31322', 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    assert.equal(wrongPort.status, 403);
    const wrongHost = await fetch(`${base}/login`, {
      method: 'POST', headers: { Origin: 'null', 'X-Forwarded-Host': 'attacker.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    assert.equal(wrongHost.status, 403);
  });
});

test('credential management reauthenticates, persists changes, and invalidates all existing sessions', async () => {
  let persisted;
  await withServer(siteverifySuccess(), async (base) => {
    const login = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'demo-user', password, 'cf-turnstile-response': 'challenge-token' }),
    });
    const oldCookie = login.headers.get('set-cookie').split(';', 1)[0];
    const details = await fetch(`${base}/admin`, { headers: { Cookie: oldCookie } });
    assert.deepEqual(await details.json(), { username: 'demo-user', backgroundUrl: '', customHtml: '', turnstileConfigured: true });

    const denied = await fetch(`${base}/admin/update`, {
      method: 'POST', headers: { Origin: config.origin, Cookie: oldCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong', username: 'NewName', newPassword: 'long-new-password-123' }),
    });
    assert.equal(denied.status, 401);
    assert.equal(persisted, undefined);

    const update = await fetch(`${base}/admin/update`, {
      method: 'POST', headers: { Origin: config.origin, Cookie: oldCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, username: 'NewName', newPassword: 'long-new-password-123' }),
    });
    assert.equal(update.status, 200);
    assert.deepEqual(await update.json(), { ok: true, signedOut: true });
    assert.match(update.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(persisted.username, 'NewName');
    assert.equal(persisted.generation, 1);
    assert.equal((await fetch(`${base}/check`, { headers: { Cookie: oldCookie } })).status, 401);

    const relogin = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'NewName', password: 'long-new-password-123', 'cf-turnstile-response': 'challenge-token' }),
    });
    assert.equal(relogin.status, 303);
    const newCookie = relogin.headers.get('set-cookie').split(';', 1)[0];
    assert.equal((await fetch(`${base}/check`, { headers: { Cookie: newCookie } })).status, 204);
  }, { persistCredentials: async (record) => { persisted = record; } });
});

test('admin exposes appearance preferences but never returns current Turnstile keys', async () => {
  await withServer(siteverifySuccess(), async (base, serverConfig) => {
    const response = await fetch(`${base}/admin`, { headers: { Cookie: signedCookie(serverConfig) } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data, { username: 'demo-user', backgroundUrl: '', customHtml: '', turnstileConfigured: true });
    assert.equal(JSON.stringify(data).includes(config.siteKey), false);
    assert.equal(JSON.stringify(data).includes(config.turnstileSecret), false);
  });
});

test('background upload validates actual image signature and custom login code runs only in isolated sandbox', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-auth-background-'));
  try {
    const credentialFile = path.join(directory, 'credentials.json');
    await withServer(siteverifySuccess(), async (base, serverConfig) => {
      const cookie = signedCookie(serverConfig);
      const bad = await fetch(`${base}/admin/background`, {
        method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'fake.png', data: Buffer.from('not an image').toString('base64') }),
      });
      assert.equal(bad.status, 400);

      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2]);
      const uploaded = await fetch(`${base}/admin/background`, {
        method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'wallpaper.png', data: signature.toString('base64') }),
      });
      assert.equal(uploaded.status, 200);
      const result = await uploaded.json();
      assert.match(result.backgroundUrl, /^\/auth\/background\/[a-f0-9]{32}\.png$/);
      const image = await fetch(`${base}${result.backgroundUrl.replace('/auth', '')}`);
      assert.equal(image.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), signature);
      assert.equal((await stat(path.join(directory, 'backgrounds', result.backgroundUrl.split('/').at(-1)))).mode & 0o777, 0o600);

      const customCode = '<!doctype html><html><style>canvas{position:fixed;inset:0}</style><canvas id="rain"></canvas><script>document.querySelector("#rain").dataset.ready="1"</script></html>';
      const preferences = await fetch(`${base}/admin/preferences`, {
        method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundUrl: 'https://images.example.test/daily.jpg', customHtml: customCode }),
      });
      assert.equal(preferences.status, 200);
      const admin = await (await fetch(`${base}/admin`, { headers: { Cookie: cookie } })).json();
      assert.equal(admin.backgroundUrl, 'https://images.example.test/daily.jpg');
      assert.equal(admin.customHtml, customCode);
      assert.equal(JSON.stringify(admin).includes(config.turnstileSecret), false);

      const login = await (await fetch(`${base}/login`)).text();
      assert.match(login, /data-login-background="https:\/\/images\.example\.test\/daily\.jpg"/);
      assert.match(login, /<iframe[^>]+src="\/auth\/customization"[^>]+sandbox="allow-scripts"/);
      assert.match(login, /id="login" action="\/auth\/login"/);
      assert.match(login, /data-sitekey="site-key" data-action="dsh-login"/);
      assert.doesNotMatch(login, /dataset\.ready/);

      const customization = await fetch(`${base}/customization`);
      assert.equal(customization.status, 200);
      assert.equal(await customization.text(), customCode);
      const sandboxPolicy = customization.headers.get('content-security-policy');
      assert.match(sandboxPolicy, /sandbox allow-scripts/);
      assert.match(sandboxPolicy, /connect-src 'none'/);
      assert.match(sandboxPolicy, /form-action 'none'/);
      assert.match(sandboxPolicy, /frame-ancestors https:\/\/dsh\.example\.test/);
      assert.equal(customization.headers.get('referrer-policy'), 'no-referrer');

      const oversized = await fetch(`${base}/admin/preferences`, {
        method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customHtml: 'x'.repeat(32 * 1024 + 1) }),
      });
      assert.equal(oversized.status, 400);
    }, { credentialFile, persistCredentials: async (record) => writeFile(credentialFile, JSON.stringify(record), { mode: 0o600 }) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('BTSTU daily wallpaper API is requested as JSON and resolves to validated HTTPS images', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-auth-wallpaper-'));
  const requests = [];
  const fetchWallpaper = async (input, options) => {
    const requestUrl = new URL(input);
    requests.push({ requestUrl, options });
    return new Response(JSON.stringify({
      code: '200', imgurl: 'https://tva4.sinaimg.cn/large/wallpaper.jpg', width: '1920', height: '1080',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const credentialFile = path.join(directory, 'credentials.json');
    await withServer(fetchWallpaper, async (base, serverConfig) => {
      const cookie = signedCookie(serverConfig);
      const saved = await fetch(`${base}/admin/preferences`, {
        method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundUrl: 'https://apis.btstu.cn/sjbz/api.php?lx=dongman&format=images' }),
      });
      assert.equal(saved.status, 200);
      const admin = await (await fetch(`${base}/admin`, { headers: { Cookie: cookie } })).json();
      const storedUrl = new URL(admin.backgroundUrl);
      assert.equal(storedUrl.origin, 'https://api.btstu.cn');
      assert.equal(storedUrl.pathname, '/sjbz/api.php');
      assert.equal(storedUrl.searchParams.get('lx'), 'dongman');
      assert.equal(storedUrl.searchParams.get('format'), 'images');

      const login = await (await fetch(`${base}/login`)).text();
      assert.match(login, /data-login-background="\/auth\/background\/daily\?method=pc&amp;lx=dongman"/);
      for (let i = 0; i < 2; i++) {
        const response = await fetch(`${base}/background/daily?method=pc&lx=dongman`, { redirect: 'manual' });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), 'https://tva4.sinaimg.cn/large/wallpaper.jpg');
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
      assert.equal(requests.length, 2);
      assert.equal(requests[0].requestUrl.origin, 'https://api.btstu.cn');
      assert.equal(requests[0].requestUrl.pathname, '/sjbz/api.php');
      assert.equal(requests[0].requestUrl.searchParams.get('method'), 'pc');
      assert.equal(requests[0].requestUrl.searchParams.get('lx'), 'dongman');
      assert.equal(requests[0].requestUrl.searchParams.get('format'), 'json');
      assert.equal(requests[0].options.method, 'GET');
      assert.equal(requests[0].options.redirect, 'error');

      const invalid = await fetch(`${base}/background/daily?method=../../etc/passwd&lx=dongman`);
      assert.equal(invalid.status, 400);
      assert.equal(requests.length, 2);
    }, { credentialFile, persistCredentials: async (record) => writeFile(credentialFile, JSON.stringify(record), { mode: 0o600 }) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('3650000 HTTP API input is upgraded and resolves its HTML image link to HTTPS', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-auth-image-api-'));
  const requests = [];
  const fetchImageApi = async (input, options) => {
    requests.push({ url: new URL(input), options });
    return new Response('<div><img alt="wallpaper" src="http://inews.gtimg.com/newsapp_ls/0/123456789/0"></div>', {
      status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
    });
  };
  try {
    const credentialFile = path.join(directory, 'credentials.json');
    await withServer(fetchImageApi, async (base, serverConfig) => {
      const cookie = signedCookie(serverConfig);
      const saved = await fetch(`${base}/admin/preferences`, {
        method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundUrl: 'http://3650000.xyz/api/?type=img&mode=3,5,7,8,9' }),
      });
      assert.equal(saved.status, 200);
      const admin = await (await fetch(`${base}/admin`, { headers: { Cookie: cookie } })).json();
      const normalized = new URL(admin.backgroundUrl);
      assert.equal(normalized.href, 'https://3650000.xyz/api/?type=img&mode=3%2C5%2C7%2C8%2C9');

      const login = await (await fetch(`${base}/login`)).text();
      assert.match(login, /data-login-background="\/auth\/background\/3650000\?mode=3%2C5%2C7%2C8%2C9"/);
      const response = await fetch(`${base}/background/3650000?mode=3%2C5%2C7%2C8%2C9`, { redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://inews.gtimg.com/newsapp_ls/0/123456789/0');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url.href, 'https://3650000.xyz/api/?type=img&mode=3%2C5%2C7%2C8%2C9');
      assert.equal(requests[0].options.method, 'GET');
      assert.equal(requests[0].options.redirect, 'error');

      const invalidMode = await fetch(`${base}/background/3650000?mode=1`);
      assert.equal(invalidMode.status, 400);
      assert.equal(requests.length, 1);
    }, { credentialFile, persistCredentials: async (record) => writeFile(credentialFile, JSON.stringify(record), { mode: 0o600 }) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('3650000 resolver rejects image hosts outside its approved domain', async () => {
  await withServer(async () => new Response('<img src="https://example.com/not-a-wallpaper.jpg">', { status: 200 }), async (base) => {
    const response = await fetch(`${base}/background/3650000?mode=3`);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
  });
});

test('background URLs reject HTTP, credential-bearing, and same-origin URLs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-auth-background-url-'));
  try {
    const credentialFile = path.join(directory, 'credentials.json');
    await withServer(siteverifySuccess(), async (base, serverConfig) => {
      const cookie = signedCookie(serverConfig);
      for (const backgroundUrl of ['http://images.example.test/a.jpg', 'https://user:pass@images.example.test/a.jpg', 'https://dsh.example.test/auth/admin', 'https://apis.btstu.cn/other/path', 'https://apis.btstu.cn/sjbz/api.php?method=invalid', 'http://3650000.xyz/not-api/?type=img&mode=3', 'http://3650000.xyz/api/?type=img&mode=1']) {
        const response = await fetch(`${base}/admin/preferences`, {
          method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ backgroundUrl, customHtml: '' }),
        });
        assert.equal(response.status, 400);
      }
    }, { credentialFile, persistCredentials: async (record) => writeFile(credentialFile, JSON.stringify(record), { mode: 0o600 }) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('daily wallpaper resolver fails closed on invalid or non-HTTPS upstream images', async () => {
  await withServer(async () => new Response(JSON.stringify({ code: '200', imgurl: 'javascript:alert(1)' }), { status: 200 }), async (base) => {
    const response = await fetch(`${base}/background/daily?method=pc&lx=`);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
  });
});

test('Turnstile key pair is only persisted after Cloudflare accepts a challenge', async () => {
  let persisted;
  const verify = async (_url, request) => {
    const body = new URLSearchParams(request.body);
    assert.equal(body.get('secret'), 'candidate-secret');
    assert.equal(body.get('response'), 'candidate-token');
    return new Response(JSON.stringify({ success: true, hostname: config.hostname, action: 'dsh-key-rotation' }), { status: 200 });
  };
  await withServer(verify, async (base, serverConfig) => {
    const cookie = signedCookie(serverConfig);
    const start = await fetch(`${base}/admin/turnstile/start`, {
      method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, siteKey: 'candidate-site', secretKey: 'candidate-secret' }),
    });
    assert.equal(start.status, 200);
    const { checkUrl, id } = await start.json();
    const checkPage = await fetch(`${base}${checkUrl.replace('/auth', '')}`, { headers: { Cookie: cookie } });
    const checkHtml = await checkPage.text();
    assert.match(checkHtml, /data-sitekey="candidate-site"/);
    assert.doesNotMatch(checkHtml, /candidate-secret/);
    assert.equal(persisted, undefined);
    assert.equal(serverConfig.siteKey, config.siteKey);
    assert.equal(serverConfig.turnstileSecret, config.turnstileSecret);

    const result = await fetch(`${base}${checkUrl.replace('/auth', '')}`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'cf-turnstile-response': 'candidate-token' }),
    });
    const html = await result.text();
    assert.equal(result.status, 200);
    assert.match(html, /验证成功，新的 Turnstile 密钥已保存/);
    assert.match(html, new RegExp(`id:'${id}'`));
    assert.equal(serverConfig.siteKey, 'candidate-site');
    assert.equal(serverConfig.turnstileSecret, 'candidate-secret');
    assert.equal(persisted.siteKey, 'candidate-site');
    assert.equal(persisted.turnstileSecret, 'candidate-secret');
    assert.equal(await (await fetch(`${base}${checkUrl.replace('/auth', '')}`, { headers: { Cookie: cookie } })).status, 404);
  }, { persistCredentials: async (record) => { persisted = record; } });
});

test('invalid Turnstile keys restore the original pair and are never persisted', async () => {
  let persisted = false;
  const verify = async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-secret'] }), { status: 200 });
  await withServer(verify, async (base, serverConfig) => {
    const oldSiteKey = serverConfig.siteKey;
    const oldSecret = serverConfig.turnstileSecret;
    const cookie = signedCookie(serverConfig);
    const start = await fetch(`${base}/admin/turnstile/start`, {
      method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: password, siteKey: 'wrong-site', secretKey: 'wrong-secret' }),
    });
    const { checkUrl } = await start.json();
    const result = await fetch(`${base}${checkUrl.replace('/auth', '')}`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'cf-turnstile-response': 'invalid-token' }),
    });
    const html = await result.text();
    assert.match(html, /验证失败，密钥未更改，原密钥已恢复/);
    assert.equal(serverConfig.siteKey, oldSiteKey);
    assert.equal(serverConfig.turnstileSecret, oldSecret);
    assert.equal(persisted, false);
  }, { persistCredentials: async () => { persisted = true; } });
});

test('logout accepts same-origin or the exact trusted forwarded host only', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const valid = await fetch(`${base}/logout`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin },
    });
    assert.equal(valid.status, 303);
    assert.match(valid.headers.get('set-cookie'), /Max-Age=0/);
    const opaque = await fetch(`${base}/logout`, {
      method: 'POST', redirect: 'manual', headers: { Origin: 'null', 'X-Forwarded-Host': 'dsh.example.test' },
    });
    assert.equal(opaque.status, 303);
    const attacker = await fetch(`${base}/logout`, {
      method: 'POST', headers: { Origin: 'https://attacker.example', 'X-Forwarded-Host': 'dsh.example.test' },
    });
    assert.equal(attacker.status, 403);
  });
});

test('correct credentials and valid Turnstile issue secure session cookie', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'demo-user', password, 'cf-turnstile-response': 'challenge-token' }),
    });
    assert.equal(response.status, 303);
    assert.match(response.headers.get('set-cookie'), /^__Host-dsh_gate=.*; Path=\/; HttpOnly; Secure; SameSite=Strict/);
    const cookie = response.headers.get('set-cookie').split(';', 1)[0];
    const check = await fetch(`${base}/check`, { headers: { Cookie: cookie } });
    assert.equal(check.status, 204);
  });
});

test('missing Turnstile token returns an inline challenge error without Siteverify request', async () => {
  let siteverifyCalled = false;
  await withServer(async () => { siteverifyCalled = true; }, async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'demo-user', password }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: 'turnstile_required', error: '请完成人机验证！' });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(siteverifyCalled, false);
  });
});

test('invalid username or password returns an inline credential error', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'not-the-user', password: 'wrong', 'cf-turnstile-response': 'challenge-token' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: 'invalid_credentials', error: '请检查用户名/密码' });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('location'), null);
  });
});

test('native HTML form with missing credentials returns login page and marks only missing inputs', async () => {
  let siteverifyCalled = false;
  await withServer(async () => { siteverifyCalled = true; }, async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: '<bad>', password: '' }),
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /id="username"[^>]*class="" value="&lt;bad&gt;"/);
    assert.match(html, /id="password"[^>]*class="shake"/);
    assert.doesNotMatch(html, /<bad>/);
    assert.equal(siteverifyCalled, false);
  });
});

test('native HTML form with no Turnstile token returns inline challenge message', async () => {
  await withServer(async () => { throw new Error('Siteverify must not be called'); }, async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'demo-user', password }),
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /id="turnstile-error"[^>]*>请完成人机验证！/);
    assert.doesNotMatch(html, /\{"code":"turnstile_required"/);
  });
});

test('native HTML form with invalid credentials returns inline password error', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'wrong-user', password: 'wrong-password', 'cf-turnstile-response': 'challenge-token' }),
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /id="password-error"[^>]*>请检查用户名\/密码/);
    assert.doesNotMatch(html, /\{"code":"invalid_credentials"/);
    assert.doesNotMatch(html, /wrong-password/);
  });
});

test('login rejects a Turnstile token issued for another hostname', async () => {
  await withServer(siteverifySuccess('elsewhere.example.test'), async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'demo-user', password, 'cf-turnstile-response': 'challenge-token' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: 'turnstile_required', error: '请完成人机验证！' });
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('wrong password cannot create an authenticated session', async () => {
  await withServer(siteverifySuccess(), async (base) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { Origin: config.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'demo-user', password: 'wrong', 'cf-turnstile-response': 'challenge-token' }),
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  });
});
