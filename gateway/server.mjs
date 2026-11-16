import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAppearanceRoutes } from './appearance-routes.mjs';
import { createAuthRoutes } from './auth-routes.mjs';

const COOKIE_NAME = '__Host-dsh_gate';
const MAX_BODY = 8192;
const DEFAULT_SESSION_TTL_SECONDS = 28_800;
const MIN_SESSION_TTL_SECONDS = 300;
const MAX_SESSION_TTL_SECONDS = 86_400;

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function parseSessionTtlSeconds(value) {
  if (value === undefined) return DEFAULT_SESSION_TTL_SECONDS;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error('SESSION_TTL_SECONDS must be an integer between 300 and 86400');
  }
  const seconds = Number(text);
  if (!Number.isSafeInteger(seconds) || seconds < MIN_SESSION_TTL_SECONDS || seconds > MAX_SESSION_TTL_SECONDS) {
    throw new Error('SESSION_TTL_SECONDS must be an integer between 300 and 86400');
  }
  return seconds;
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
    ttlSeconds: parseSessionTtlSeconds(env.SESSION_TTL_SECONDS),
    authRatePerMinute: Math.min(Math.max(Number(env.AUTH_RATE_PER_MINUTE || 30), 1), 600),
    authMaxConcurrent: Math.min(Math.max(Number(env.AUTH_MAX_CONCURRENT || 4), 1), 32),
    port,
  };
}

function cookieValue(header, name) {
  for (const part of (header || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
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
  const validCookie = (req) => verifySession(cookieValue(req.headers.cookie, COOKIE_NAME), config.sessionSecret, now(), config.credentialGeneration);
  const shared = {
    config,
    fetchImpl,
    now,
    attempts,
    authThrottle,
    pendingRotations,
    validCookie,
    signedSession,
    sameOrigin,
    readBody,
    sendJson,
    setHeaders,
    credentialRecord,
    persistCredentials,
  };
  const authRoutes = createAuthRoutes({
    ...shared,
    passwordMatches,
    safeEqualString,
    hashPasswordAsync,
  });
  const appearanceRoutes = createAppearanceRoutes(shared);

  return async (req, res) => {
    const url = new URL(req.url, config.origin);
    if (await authRoutes(req, res, url)) return;
    if (await appearanceRoutes(req, res, url)) return;
    sendJson(res, 404, { error: 'Not found' });
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
