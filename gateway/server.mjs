import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_NAME = '__Host-dsh_gate';
const MAX_BODY = 8192;
const LOGIN_LIMIT = 5;
const LOCK_MS = 15 * 60 * 1000;

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function loadConfig(env = process.env) {
  const hostname = required(env, 'EXPECTED_HOSTNAME').toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) {
    throw new Error('EXPECTED_HOSTNAME must be a fully qualified domain name');
  }
  const origin = required(env, 'PUBLIC_ORIGIN');
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.hostname.toLowerCase() !== hostname || parsedOrigin.origin !== origin) {
    throw new Error('PUBLIC_ORIGIN must be a canonical HTTPS origin matching EXPECTED_HOSTNAME');
  }
  const passwordHash = required(env, 'AUTH_PASSWORD_HASH').split(':');
  if (passwordHash.length !== 2 || !/^[a-f0-9]{128}$/i.test(passwordHash[0]) || !/^[a-f0-9]{32}$/i.test(passwordHash[1])) {
    throw new Error('AUTH_PASSWORD_HASH must be scrypt hex:salt hex');
  }
  const sessionSecret = required(env, 'SESSION_SECRET');
  if (Buffer.byteLength(sessionSecret) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes');
  const port = Number(env.PORT || 31322);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be a valid non-privileged TCP port');

  return {
    hostname,
    origin,
    username: required(env, 'AUTH_USERNAME'),
    passwordHash: Buffer.from(passwordHash[0], 'hex'),
    passwordSalt: Buffer.from(passwordHash[1], 'hex'),
    sessionSecret,
    siteKey: required(env, 'TURNSTILE_SITE_KEY'),
    turnstileSecret: required(env, 'TURNSTILE_SECRET_KEY'),
    backgroundUrl: '',
    customHtml: '',
    credentialFile: env.CREDENTIALS_FILE || '/var/lib/dsh-login-gateway/credentials.json',
    credentialGeneration: 0,
    ttlSeconds: Math.min(Math.max(Number(env.SESSION_TTL_SECONDS || 28800), 300), 86400),
    authRatePerMinute: Math.min(Math.max(Number(env.AUTH_RATE_PER_MINUTE || 30), 1), 600),
    authMaxConcurrent: Math.min(Math.max(Number(env.AUTH_MAX_CONCURRENT || 4), 1), 32),
    port,
  };
}

function cookieValue(header, name) {
  for (const item of (header || '').split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function signedSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifySession(token, secret, now = Date.now(), generation = 0) {
  if (!token || token.length > 2048) return false;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Math.floor(now / 1000) && payload.sub && payload.generation === generation;
  } catch {
    return false;
  }
}

function setHeaders(res, status, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
}

function sendJson(res, status, data, headers) {
  setHeaders(res, status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}

async function readBody(req, maxBytes = MAX_BODY) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function deriveScrypt(password, salt, length) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

async function passwordMatches(password, config) {
  try {
    const candidate = await deriveScrypt(password, config.passwordSalt, config.passwordHash.length);
    return candidate.length === config.passwordHash.length && timingSafeEqual(candidate, config.passwordHash);
  } catch {
    return false;
  }
}

export class GlobalAuthThrottle {
  constructor(maxPerWindow = 30, windowMs = 60_000, maxConcurrent = 4, clock = () => Date.now()) {
    this.maxPerWindow = Math.max(1, Number(maxPerWindow) || 30);
    this.windowMs = Math.max(1000, Number(windowMs) || 60_000);
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 4);
    this.clock = clock;
    this.timestamps = [];
    this.active = 0;
  }

  acquire() {
    const current = this.clock();
    this.timestamps = this.timestamps.filter((timestamp) => timestamp + this.windowMs > current);
    if (this.active >= this.maxConcurrent) return 1;
    if (this.timestamps.length >= this.maxPerWindow) {
      return Math.max(1, Math.ceil((this.timestamps[0] + this.windowMs - current) / 1000));
    }
    this.timestamps.push(current);
    this.active += 1;
    return 0;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
  }

  async run(operation) {
    const retryAfter = this.acquire();
    if (retryAfter) return { limited: true, retryAfter };
    try {
      return { limited: false, value: await operation() };
    } finally {
      this.release();
    }
  }
}

export async function hashPasswordAsync(password) {
  const salt = randomBytes(16);
  const hash = await deriveScrypt(password, salt, 64);
  return `${hash.toString('hex')}:${salt.toString('hex')}`;
}

function credentialRecord(config) {
  return {
    username: config.username,
    passwordHash: config.passwordHash.toString('hex'),
    passwordSalt: config.passwordSalt.toString('hex'),
    siteKey: config.siteKey,
    turnstileSecret: config.turnstileSecret,
    backgroundUrl: config.backgroundUrl,
    customHtml: config.customHtml,
    generation: config.credentialGeneration,
  };
}

async function persistCredentialRecord(filePath, record) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, filePath);
}

export async function loadCredentialState(config) {
  let stored;
  try {
    stored = JSON.parse(await readFile(config.credentialFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read gateway credential state');
    await persistCredentialRecord(config.credentialFile, credentialRecord(config));
    return;
  }
  if (!stored || typeof stored.username !== 'string' || !stored.username ||
      !/^[a-f0-9]{128}$/i.test(stored.passwordHash || '') ||
      !/^[a-f0-9]{32}$/i.test(stored.passwordSalt || '') ||
      (stored.siteKey !== undefined && (typeof stored.siteKey !== 'string' || !stored.siteKey || stored.siteKey.length > 256)) ||
      (stored.turnstileSecret !== undefined && (typeof stored.turnstileSecret !== 'string' || !stored.turnstileSecret || stored.turnstileSecret.length > 512)) ||
      (stored.backgroundUrl !== undefined && typeof stored.backgroundUrl !== 'string') ||
      (stored.customHtml !== undefined && (typeof stored.customHtml !== 'string' || Buffer.byteLength(stored.customHtml) > 32 * 1024)) ||
      (stored.adornmentDraft !== undefined && (typeof stored.adornmentDraft !== 'string' || Buffer.byteLength(stored.adornmentDraft) > 32 * 1024)) ||
      !Number.isSafeInteger(stored.generation) || stored.generation < 0) {
    throw new Error('Gateway credential state is invalid');
  }
  config.username = stored.username;
  config.passwordHash = Buffer.from(stored.passwordHash, 'hex');
  config.passwordSalt = Buffer.from(stored.passwordSalt, 'hex');
  config.siteKey = stored.siteKey || config.siteKey;
  config.turnstileSecret = stored.turnstileSecret || config.turnstileSecret;
  config.backgroundUrl = stored.backgroundUrl || '';
  config.customHtml = typeof stored.customHtml === 'string' ? stored.customHtml : '';
  config.credentialGeneration = stored.generation;
  if (stored.siteKey === undefined || stored.turnstileSecret === undefined || stored.backgroundUrl === undefined || stored.customHtml === undefined) {
    await persistCredentialRecord(config.credentialFile, credentialRecord(config));
  }
}

function sameOrigin(req, config) {
  const origin = req.headers.origin;
  if (origin === config.origin) return true;
  if (origin === undefined || origin === null || origin === '' || origin === 'null') {
    const rawHost = req.headers['x-forwarded-host'] || '';
    const host = String(Array.isArray(rawHost) ? rawHost[0] : rawHost).trim().toLowerCase();
    try {
      return host === new URL(config.origin).host.toLowerCase();
    } catch {
      return false;
    }
  }
  return false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const WALLPAPER_API = 'https://api.btstu.cn/sjbz/api.php';
const WALLPAPER_HOSTS = new Set(['api.btstu.cn', 'apis.btstu.cn']);
const IMAGE_API_URL = 'https://3650000.xyz/api/';
const IMAGE_API_MODES = new Set(['3', '5', '7', '8', '9']);
const WALLPAPER_METHODS = new Set(['mobile', 'pc', 'zsy']);
const WALLPAPER_CATEGORIES = new Set(['', 'meizi', 'dongman', 'fengjing', 'suiji']);

function parseWallpaperApiUrl(url) {
  if (!WALLPAPER_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/sjbz/api.php' || url.hash) {
    throw new Error('Unsupported daily wallpaper API URL');
  }
  for (const key of url.searchParams.keys()) {
    if (!['method', 'lx', 'format'].includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error('Unsupported daily wallpaper API parameter');
    }
  }
  const method = url.searchParams.get('method') || 'pc';
  const category = url.searchParams.get('lx') || '';
  const format = url.searchParams.get('format') || 'images';
  if (!WALLPAPER_METHODS.has(method) || !WALLPAPER_CATEGORIES.has(category) || !['json', 'images'].includes(format)) {
    throw new Error('Invalid daily wallpaper API parameter');
  }
  return { method, category, format };
}

function parseImageApiUrl(url) {
  if (url.hostname.toLowerCase() !== '3650000.xyz') return null;
  if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password || url.pathname !== '/api/' || url.hash) {
    throw new Error('Unsupported 3650000 image API URL');
  }
  for (const key of url.searchParams.keys()) {
    if (!['type', 'mode'].includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error('Unsupported 3650000 image API parameter');
    }
  }
  if (url.searchParams.get('type') !== 'img') throw new Error('The 3650000 API type must be img');
  const mode = url.searchParams.get('mode') || '3,5,7,8,9';
  const modes = mode.split(',');
  if (!mode || modes.length > IMAGE_API_MODES.size || modes.some((value) => !IMAGE_API_MODES.has(value)) || new Set(modes).size !== modes.length) {
    throw new Error('Invalid 3650000 image API mode');
  }
  return { mode };
}

function normalizeBackgroundUrl(value, origin) {
  if (typeof value !== 'string') throw new Error('Background URL is invalid');
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\/auth\/background\/[a-f0-9]{32}\.(?:png|jpe?g|webp)$/i.test(trimmed)) return trimmed;
  if (trimmed.length > 2048) throw new Error('Background URL is too long');
  const url = new URL(trimmed);
  const imageApi = parseImageApiUrl(url);
  if (imageApi) {
    const normalized = new URL(IMAGE_API_URL);
    normalized.searchParams.set('type', 'img');
    normalized.searchParams.set('mode', imageApi.mode);
    return normalized.href;
  }
  if (url.hostname.toLowerCase() === '3650000.xyz') throw new Error('Unsupported 3650000 image API URL');
  const wallpaper = parseWallpaperApiUrl(url);
  if (wallpaper) {
    const normalized = new URL(WALLPAPER_API);
    normalized.searchParams.set('method', wallpaper.method);
    normalized.searchParams.set('lx', wallpaper.category);
    normalized.searchParams.set('format', wallpaper.format);
    return normalized.href;
  }
  if (WALLPAPER_HOSTS.has(url.hostname.toLowerCase())) throw new Error('Unsupported daily wallpaper API URL');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Background images must use a public HTTPS URL');
  if (url.origin === new URL(origin).origin) throw new Error('Use an uploaded background file for this site');
  return url.href;
}

function loginBackgroundUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const imageApi = parseImageApiUrl(url);
    if (imageApi) {
      const proxy = new URL('/auth/background/3650000', 'https://login.invalid');
      proxy.searchParams.set('mode', imageApi.mode);
      return `${proxy.pathname}${proxy.search}`;
    }
    const wallpaper = parseWallpaperApiUrl(url);
    if (!wallpaper) return value;
    const proxy = new URL('/auth/background/daily', 'https://login.invalid');
    proxy.searchParams.set('method', wallpaper.method);
    proxy.searchParams.set('lx', wallpaper.category);
    return `${proxy.pathname}${proxy.search}`;
  } catch {
    return value;
  }
}

function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: 'png', type: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

function isHtmlFormRequest(req) {
  return (req.headers.accept || '').split(',').some((type) => type.trim().startsWith('text/html'));
}

export function createHandler(config, {
  fetchImpl = fetch,
  now = () => Date.now(),
  persistCredentials = (record) => persistCredentialRecord(config.credentialFile, record),
} = {}) {
  const attempts = new Map();
  const authThrottle = new GlobalAuthThrottle(
    config.authRatePerMinute ?? 30,
    60_000,
    config.authMaxConcurrent ?? 4,
    now,
  );
  const pendingRotations = new Map();
  const loginHtml = readFile(path.join(here, 'public/login.html'), 'utf8');

  const verifyTurnstile = async (secret, token, ip, action) => {
    try {
      const body = new URLSearchParams({ secret, response: token, remoteip: ip });
      const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      return response.ok && result.success === true && result.hostname === config.hostname && result.action === action;
    } catch {
      return false;
    }
  };

  const renderTurnstileCheck = (res, pending, result = '') => {
    const nonce = randomBytes(18).toString('base64');
    setHeaders(res, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    });
    const message = result === 'success'
      ? '验证成功，新的 Turnstile 密钥已保存。可以关闭此页并返回设置。'
      : result === 'failure'
        ? '验证失败，密钥未更改，原密钥已恢复。请检查 Site Key 与 Secret Key 后重试。'
        : '请完成下面的人机验证并提交。只有 Cloudflare 验证成功后才会保存新密钥。';
    if (result) {
      const ok = result === 'success';
      return res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Turnstile 密钥验证</title></head><body style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px"><h1>Turnstile 密钥验证</h1><p role="status">${message}</p><script data-cfasync="false" nonce="${nonce}">if(window.opener){window.opener.postMessage({type:'dsh-turnstile-key-check-result',id:'${pending.id}',ok:${ok}},${JSON.stringify(config.origin)});window.setTimeout(()=>window.close(),500)}</script></body></html>`);
    }
    const id = encodeURIComponent(pending.id);
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Turnstile 密钥验证</title><script data-cfasync="false" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></head><body style="font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px"><h1>Turnstile 密钥验证</h1><p>${message}</p><form method="post" action="/auth/turnstile-check?id=${id}"><div class="cf-turnstile" data-sitekey="${escapeHtml(pending.siteKey)}" data-action="dsh-key-rotation"></div><button type="submit">验证并保存密钥</button></form></body></html>`;
    return res.end(html);
  };

  const validCookie = (req) => verifySession(cookieValue(req.headers.cookie, COOKIE_NAME), config.sessionSecret, now(), config.credentialGeneration);

  const renderLogin = async (res, options = {}) => {
    const html = await loginHtml;
    const nonce = randomBytes(18).toString('base64');
    setHeaders(res, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    });
    return res.end(html
      .replaceAll('__SITE_KEY__', config.siteKey)
      .replaceAll('__BACKGROUND_URL__', escapeHtml(loginBackgroundUrl(config.backgroundUrl || '')))
      .replaceAll('__NONCE__', nonce)
      .replaceAll('__USERNAME_VALUE__', escapeHtml(options.username || ''))
      .replaceAll('__USERNAME_CLASS__', options.shakeUsername ? 'shake' : '')
      .replaceAll('__PASSWORD_CLASS__', options.shakePassword ? 'shake' : '')
      .replaceAll('__PASSWORD_ERROR__', escapeHtml(options.passwordError || ''))
      .replaceAll('__TURNSTILE_ERROR__', escapeHtml(options.turnstileError || ''))
      .replaceAll('__GENERAL_ERROR__', escapeHtml(options.generalError || '')));
  };

  const loginError = (req, res, status, body, options = {}) => {
    if (isHtmlFormRequest(req)) return renderLogin(res, options);
    return sendJson(res, status, body);
  };

  return async (req, res) => {
    const url = new URL(req.url, config.origin);
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/check') {
      return validCookie(req)
        ? sendJson(res, 204, {}, { 'X-DSH-Authenticated': '1' })
        : sendJson(res, 401, { authenticated: false });
    }
    if (req.method === 'GET' && url.pathname === '/login') return renderLogin(res);
    if (req.method === 'GET' && url.pathname === '/customization') {
      setHeaders(res, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src data: blob: https:; font-src data: https:; frame-src https:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${config.origin}`,
      });
      return res.end(config.customHtml || '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    }
    if (req.method === 'GET' && url.pathname === '/background/3650000') {
      const mode = url.searchParams.get('mode') || '3,5,7,8,9';
      const modes = mode.split(',');
      if ([...url.searchParams.keys()].some((key) => key !== 'mode') || url.searchParams.getAll('mode').length > 1 ||
          !mode || modes.length > IMAGE_API_MODES.size || modes.some((value) => !IMAGE_API_MODES.has(value)) || new Set(modes).size !== modes.length) {
        return sendJson(res, 400, { error: 'Invalid 3650000 image API mode' });
      }
      const apiUrl = new URL(IMAGE_API_URL);
      apiUrl.searchParams.set('type', 'img');
      apiUrl.searchParams.set('mode', mode);
      try {
        const response = await fetchImpl(apiUrl, {
          method: 'GET', redirect: 'error', headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('Image service unavailable');
        const body = await response.text();
        if (Buffer.byteLength(body) > 16 * 1024) throw new Error('Image response too large');
        const match = body.match(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
        if (!match) throw new Error('Image service returned no image');
        const src = match[2].replace(/&amp;|&#0*38;|&#x0*26;/gi, '&');
        const image = new URL(src, IMAGE_API_URL);
        if (!['http:', 'https:'].includes(image.protocol) || image.username || image.password || image.port || image.hash ||
            !(image.hostname === 'gtimg.com' || image.hostname.endsWith('.gtimg.com'))) {
          throw new Error('Image URL is not an approved HTTPS image host');
        }
        image.protocol = 'https:';
        setHeaders(res, 302, { Location: image.href, 'Cache-Control': 'no-store' });
        return res.end();
      } catch {
        return sendJson(res, 502, { error: '3650000 image service did not return a supported image URL' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/background/daily') {
      const method = url.searchParams.get('method') || 'pc';
      const category = url.searchParams.get('lx') || '';
      if ([...url.searchParams.keys()].some((key) => !['method', 'lx'].includes(key)) ||
          url.searchParams.getAll('method').length > 1 || url.searchParams.getAll('lx').length > 1 ||
          !WALLPAPER_METHODS.has(method) || !WALLPAPER_CATEGORIES.has(category)) {
        return sendJson(res, 400, { error: 'Invalid daily wallpaper options' });
      }
      const apiUrl = new URL(WALLPAPER_API);
      apiUrl.searchParams.set('method', method);
      apiUrl.searchParams.set('lx', category);
      apiUrl.searchParams.set('format', 'json');
      try {
        const response = await fetchImpl(apiUrl, {
          method: 'GET', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('Wallpaper service unavailable');
        const body = await response.text();
        if (Buffer.byteLength(body) > 16 * 1024) throw new Error('Wallpaper response too large');
        const data = JSON.parse(body);
        if (String(data.code) !== '200' || typeof data.imgurl !== 'string' || data.imgurl.length > 2048) {
          throw new Error('Wallpaper service returned no image');
        }
        const image = new URL(data.imgurl);
        if (image.protocol !== 'https:' || image.username || image.password || image.hash) throw new Error('Wallpaper image URL is invalid');
        setHeaders(res, 302, { Location: image.href, 'Cache-Control': 'no-store' });
        return res.end();
      } catch {
        return sendJson(res, 502, { error: 'Daily wallpaper service could not return a valid HTTPS image' });
      }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/background/')) {
      const match = url.pathname.match(/^\/background\/([a-f0-9]{32})\.(png|jpe?g|webp)$/i);
      if (!match) return sendJson(res, 404, { error: 'Not found' });
      const filename = `${match[1]}.${match[2].toLowerCase()}`;
      try {
        const image = await readFile(path.join(path.dirname(config.credentialFile), 'backgrounds', filename));
        const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
        setHeaders(res, 200, { 'Content-Type': types[match[2].toLowerCase()], 'Cache-Control': 'public, max-age=86400' });
        return res.end(image);
      } catch {
        return sendJson(res, 404, { error: 'Not found' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/admin') {
      if (!validCookie(req)) return sendJson(res, 401, { error: 'Sign in required' });
      return sendJson(res, 200, {
        username: config.username,
        backgroundUrl: config.backgroundUrl,
        customHtml: config.customHtml,
        turnstileConfigured: Boolean(config.siteKey && config.turnstileSecret),
      });
    }
    if (req.method === 'POST' && url.pathname === '/admin/preferences') {
      if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });
      if (!validCookie(req)) return sendJson(res, 401, { error: 'Sign in required' });
      let request;
      try { request = JSON.parse(await readBody(req, 48 * 1024)); }
      catch (error) { return sendJson(res, error.status || 400, { error: 'Invalid request' }); }
      let backgroundUrl;
      try { backgroundUrl = normalizeBackgroundUrl(request.backgroundUrl ?? config.backgroundUrl, config.origin); }
      catch (error) { return sendJson(res, 400, { error: error.message }); }
      const customHtml = request.customHtml === undefined ? config.customHtml : request.customHtml;
      if (typeof customHtml !== 'string' || Buffer.byteLength(customHtml) > 32 * 1024) return sendJson(res, 400, { error: 'Custom login content must be text under 32 KiB' });
      const nextRecord = { ...credentialRecord(config), backgroundUrl, customHtml };
      try { await persistCredentials(nextRecord); }
      catch { return sendJson(res, 500, { error: 'Could not save login page settings' }); }
      config.backgroundUrl = backgroundUrl;
      config.customHtml = customHtml;
      return sendJson(res, 200, { ok: true, backgroundUrl, customHtml });
    }
    if (req.method === 'POST' && url.pathname === '/admin/background') {
      if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });
      if (!validCookie(req)) return sendJson(res, 401, { error: 'Sign in required' });
      let request;
      try { request = JSON.parse(await readBody(req, 6 * 1024 * 1024)); }
      catch (error) { return sendJson(res, error.status || 400, { error: 'Invalid image upload' }); }
      if (typeof request.data !== 'string' || request.data.length > 5_600_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.data)) {
        return sendJson(res, 400, { error: 'Upload a PNG, JPEG, or WebP image up to 4 MiB' });
      }
      const bytes = Buffer.from(request.data, 'base64');
      if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) return sendJson(res, 400, { error: 'Upload a PNG, JPEG, or WebP image up to 4 MiB' });
      const imageType = detectImageType(bytes);
      if (!imageType) return sendJson(res, 400, { error: 'Only PNG, JPEG, and WebP images are supported' });
      const filename = `${randomBytes(16).toString('hex')}.${imageType.ext}`;
      const directory = path.join(path.dirname(config.credentialFile), 'backgrounds');
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(path.join(directory, filename), bytes, { mode: 0o600, flag: 'wx' });
      } catch { return sendJson(res, 500, { error: 'Could not store background image' }); }
      const backgroundUrl = `/auth/background/${filename}`;
      const nextRecord = { ...credentialRecord(config), backgroundUrl };
      try { await persistCredentials(nextRecord); }
      catch { return sendJson(res, 500, { error: 'Could not save background setting' }); }
      config.backgroundUrl = backgroundUrl;
      return sendJson(res, 200, { ok: true, backgroundUrl, contentType: imageType.type });
    }
    if (req.method === 'POST' && url.pathname === '/admin/turnstile/start') {
      if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });
      if (!validCookie(req)) return sendJson(res, 401, { error: 'Sign in required' });
      let request;
      try { request = JSON.parse(await readBody(req)); }
      catch (error) { return sendJson(res, error.status || 400, { error: 'Invalid request' }); }
      const currentPassword = typeof request.currentPassword === 'string' ? request.currentPassword : '';
      const siteKey = typeof request.siteKey === 'string' ? request.siteKey.trim() : '';
      const secretKey = typeof request.secretKey === 'string' ? request.secretKey.trim() : '';
      const passwordCheck = await authThrottle.run(() => passwordMatches(currentPassword, config));
      if (passwordCheck.limited) return sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(passwordCheck.retryAfter) });
      if (!passwordCheck.value) return sendJson(res, 401, { error: 'Current password is incorrect' });
      if (!siteKey || siteKey.length > 256 || /[\r\n\u0000-\u001f]/.test(siteKey) || !secretKey || secretKey.length > 512 || /[\r\n\u0000-\u001f]/.test(secretKey)) {
        return sendJson(res, 400, { error: 'Enter a valid Site Key and Secret Key' });
      }
      for (const [rotationId, rotation] of pendingRotations) {
        if (rotation.expiresAt <= now()) pendingRotations.delete(rotationId);
      }
      if (pendingRotations.size) return sendJson(res, 409, { error: 'A Turnstile key check is already pending' });
      const id = randomBytes(18).toString('base64url');
      pendingRotations.set(id, {
        id, siteKey, secretKey,
        previousSiteKey: config.siteKey,
        previousSecretKey: config.turnstileSecret,
        username: config.username,
        generation: config.credentialGeneration,
        expiresAt: now() + 5 * 60 * 1000,
      });
      return sendJson(res, 200, { id, checkUrl: `/auth/turnstile-check?id=${encodeURIComponent(id)}` });
    }
    if (url.pathname === '/turnstile-check' && (req.method === 'GET' || req.method === 'POST')) {
      const id = url.searchParams.get('id') || '';
      const pending = pendingRotations.get(id);
      if (!pending || pending.expiresAt <= now() || pending.username !== config.username || pending.generation !== config.credentialGeneration) {
        pendingRotations.delete(id);
        return sendJson(res, 404, { error: 'Turnstile key check expired. Start again from DSH settings.' });
      }
      if (!validCookie(req)) return sendJson(res, 401, { error: 'Sign in required' });
      if (req.method === 'GET') return renderTurnstileCheck(res, pending);
      if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });
      let fields;
      try { fields = new URLSearchParams(await readBody(req)); }
      catch (error) { return sendJson(res, error.status || 400, { error: 'Invalid verification response' }); }
      const token = fields.get('cf-turnstile-response') || '';
      const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
      const valid = token.length > 0 && token.length <= 2048 && await verifyTurnstile(pending.secretKey, token, ip, 'dsh-key-rotation');
      if (!valid) {
        config.siteKey = pending.previousSiteKey;
        config.turnstileSecret = pending.previousSecretKey;
        pendingRotations.delete(id);
        return renderTurnstileCheck(res, pending, 'failure');
      }
      const nextRecord = { ...credentialRecord(config), siteKey: pending.siteKey, turnstileSecret: pending.secretKey };
      try { await persistCredentials(nextRecord); }
      catch {
        config.siteKey = pending.previousSiteKey;
        config.turnstileSecret = pending.previousSecretKey;
        pendingRotations.delete(id);
        return renderTurnstileCheck(res, pending, 'failure');
      }
      config.siteKey = pending.siteKey;
      config.turnstileSecret = pending.secretKey;
      pendingRotations.delete(id);
      return renderTurnstileCheck(res, pending, 'success');
    }

    if (req.method === 'POST' && url.pathname === '/admin/update') {
      if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });
      if (!validCookie(req)) return sendJson(res, 401, { error: 'Sign in required' });
      let request;
      try {
        request = JSON.parse(await readBody(req));
      } catch (error) {
        return sendJson(res, error.status || 400, { error: 'Invalid request' });
      }
      const currentPassword = typeof request.currentPassword === 'string' ? request.currentPassword : '';
      const nextUsername = typeof request.username === 'string' ? request.username.trim() : config.username;
      const nextPassword = typeof request.newPassword === 'string' ? request.newPassword : '';
      const passwordCheck = await authThrottle.run(() => passwordMatches(currentPassword, config));
      if (passwordCheck.limited) return sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(passwordCheck.retryAfter) });
      if (!passwordCheck.value) return sendJson(res, 401, { error: 'Current password is incorrect' });
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(nextUsername)) return sendJson(res, 400, { error: 'Username must be 1-64 letters, numbers, dots, underscores, or hyphens' });
      if (nextPassword && (nextPassword.length < 12 || nextPassword.length > 1024)) {
        return sendJson(res, 400, { error: 'New password must be at least 12 characters' });
      }
      if (nextUsername === config.username && !nextPassword) return sendJson(res, 400, { error: 'No credential changes were supplied' });

      let passwordHash = config.passwordHash;
      let passwordSalt = config.passwordSalt;
      if (nextPassword) {
        const hashResult = await authThrottle.run(() => hashPasswordAsync(nextPassword));
        if (hashResult.limited) return sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(hashResult.retryAfter) });
        const [hash, salt] = hashResult.value.split(':');
        passwordHash = Buffer.from(hash, 'hex');
        passwordSalt = Buffer.from(salt, 'hex');
      }
      const nextRecord = {
        ...credentialRecord(config),
        username: nextUsername,
        passwordHash: passwordHash.toString('hex'),
        passwordSalt: passwordSalt.toString('hex'),
        generation: config.credentialGeneration + 1,
      };
      try {
        await persistCredentials(nextRecord);
      } catch {
        return sendJson(res, 500, { error: 'Could not save account settings' });
      }
      config.username = nextRecord.username;
      config.passwordHash = passwordHash;
      config.passwordSalt = passwordSalt;
      config.credentialGeneration = nextRecord.generation;
      return sendJson(res, 200, { ok: true, signedOut: true }, {
        'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      });
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });
      setHeaders(res, 303, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, Location: '/auth/login' });
      return res.end();
    }
    if (req.method !== 'POST' || url.pathname !== '/login') return sendJson(res, 404, { error: 'Not found' });
    if (!sameOrigin(req, config)) return sendJson(res, 403, { error: 'Invalid origin' });

    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const current = now();
    let record = attempts.get(ip);
    if (record && record.updatedAt + LOCK_MS <= current) {
      attempts.delete(ip);
      record = undefined;
    }
    if (record?.blockedUntil > current) {
      const seconds = Math.ceil((record.blockedUntil - current) / 1000);
      if (isHtmlFormRequest(req)) return renderLogin(res, { generalError: '尝试次数过多，请稍后再试。' });
      return sendJson(res, 429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': String(seconds) });
    }

    let fields;
    try {
      fields = new URLSearchParams(await readBody(req));
    } catch (error) {
      return sendJson(res, error.status || 400, { error: 'Invalid request' });
    }
    const username = fields.get('username') || '';
    const password = fields.get('password') || '';
    const token = fields.get('cf-turnstile-response') || '';
    if (username.length > 128 || password.length > 1024) {
      return loginError(req, res, 400, { error: 'Invalid credentials input.' }, { generalError: '输入格式无效，请重试。' });
    }
    const missingUsername = !username.trim();
    const missingPassword = !password;
    if (missingUsername || missingPassword) {
      return loginError(req, res, 400, { code: 'credentials_required', error: 'Credentials are required.' }, {
        username,
        shakeUsername: missingUsername,
        shakePassword: missingPassword,
      });
    }
    if (!token || token.length > 2048) {
      return loginError(req, res, 400, { code: 'turnstile_required', error: '请完成人机验证！' }, {
        username,
        turnstileError: '请完成人机验证！',
      });
    }

    let turnstileValid = false;
    try {
      const body = new URLSearchParams({ secret: config.turnstileSecret, response: token, remoteip: ip });
      const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      turnstileValid = response.ok && result.success === true && result.hostname === config.hostname && result.action === 'dsh-login';
    } catch {
      turnstileValid = false;
    }

    const passwordCheck = turnstileValid
      ? await authThrottle.run(() => passwordMatches(password, config))
      : { limited: false, value: false };
    if (passwordCheck.limited) {
      return sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(passwordCheck.retryAfter) });
    }
    const credentialsValid = safeEqualString(username, config.username) && passwordCheck.value;
    if (!turnstileValid || !credentialsValid) {
      if (attempts.size >= 2048) {
        for (const [address, value] of attempts) {
          if (value.updatedAt + LOCK_MS <= current) attempts.delete(address);
        }
      }
      const next = (record?.count || 0) + 1;
      attempts.set(ip, { count: next, blockedUntil: next >= LOGIN_LIMIT ? current + LOCK_MS : 0, updatedAt: current });
      if (!turnstileValid) {
        return loginError(req, res, 400, { code: 'turnstile_required', error: '请完成人机验证！' }, {
          username,
          turnstileError: '请完成人机验证！',
        });
      }
      return loginError(req, res, next >= LOGIN_LIMIT ? 429 : 401, {
        code: 'invalid_credentials',
        error: '请检查用户名/密码',
      }, {
        username,
        passwordError: '请检查用户名/密码',
        generalError: next >= LOGIN_LIMIT ? '尝试次数过多，请稍后再试。' : '',
      });
    }

    attempts.delete(ip);
    const session = signedSession({ sub: config.username, exp: Math.floor(current / 1000) + config.ttlSeconds, generation: config.credentialGeneration, nonce: randomBytes(16).toString('base64url') }, config.sessionSecret);
    setHeaders(res, 303, {
      'Set-Cookie': `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${config.ttlSeconds}`,
      Location: '/',
    });
    res.end();
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  await loadCredentialState(config);
  const handler = createHandler(config);
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
      else res.destroy();
    });
  });
  server.listen(config.port, '127.0.0.1', () => console.log(`DSH auth gateway listening on 127.0.0.1:${config.port}`));
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  return `${scryptSync(password, salt, 64).toString('hex')}:${salt.toString('hex')}`;
}
