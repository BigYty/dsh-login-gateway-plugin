import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginBackgroundUrl } from './background-urls.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_NAME = '__Host-dsh_gate';
const MAX_BODY = 8192;
const LOGIN_LIMIT = 5;
const LOCK_MS = 15 * 60 * 1000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function isHtmlFormRequest(req) {
  return (req.headers.accept || '').split(',').some((type) => type.trim().startsWith('text/html'));
}

export function createAuthRoutes({
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
  passwordMatches,
  safeEqualString,
  hashPasswordAsync,
}) {
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

  return async (req, res, url) => {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/check') {
      if (validCookie(req)) sendJson(res, 204, {}, { 'X-DSH-Authenticated': '1' });
      else sendJson(res, 401, { authenticated: false });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/login') {
      await renderLogin(res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/admin/turnstile/start') {
      if (!sameOrigin(req, config)) { sendJson(res, 403, { error: 'Invalid origin' }); return true; }
      if (!validCookie(req)) { sendJson(res, 401, { error: 'Sign in required' }); return true; }
      let request;
      try { request = JSON.parse(await readBody(req)); }
      catch (error) { sendJson(res, error.status || 400, { error: 'Invalid request' }); return true; }
      const currentPassword = typeof request.currentPassword === 'string' ? request.currentPassword : '';
      const siteKey = typeof request.siteKey === 'string' ? request.siteKey.trim() : '';
      const secretKey = typeof request.secretKey === 'string' ? request.secretKey.trim() : '';
      const passwordCheck = await authThrottle.run(() => passwordMatches(currentPassword, config));
      if (passwordCheck.limited) {
        sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(passwordCheck.retryAfter) });
        return true;
      }
      if (!passwordCheck.value) { sendJson(res, 401, { error: 'Current password is incorrect' }); return true; }
      if (!siteKey || siteKey.length > 256 || /[\r\n\u0000-\u001f]/.test(siteKey) || !secretKey || secretKey.length > 512 || /[\r\n\u0000-\u001f]/.test(secretKey)) {
        sendJson(res, 400, { error: 'Enter a valid Site Key and Secret Key' });
        return true;
      }
      for (const [rotationId, rotation] of pendingRotations) {
        if (rotation.expiresAt <= now()) pendingRotations.delete(rotationId);
      }
      if (pendingRotations.size) { sendJson(res, 409, { error: 'A Turnstile key check is already pending' }); return true; }
      const id = randomBytes(18).toString('base64url');
      pendingRotations.set(id, {
        id, siteKey, secretKey,
        previousSiteKey: config.siteKey,
        previousSecretKey: config.turnstileSecret,
        username: config.username,
        generation: config.credentialGeneration,
        expiresAt: now() + 5 * 60 * 1000,
      });
      sendJson(res, 200, { id, checkUrl: `/auth/turnstile-check?id=${encodeURIComponent(id)}` });
      return true;
    }
    if (url.pathname === '/turnstile-check' && (req.method === 'GET' || req.method === 'POST')) {
      const id = url.searchParams.get('id') || '';
      const pending = pendingRotations.get(id);
      if (!pending || pending.expiresAt <= now() || pending.username !== config.username || pending.generation !== config.credentialGeneration) {
        pendingRotations.delete(id);
        sendJson(res, 404, { error: 'Turnstile key check expired. Start again from DSH settings.' });
        return true;
      }
      if (!validCookie(req)) { sendJson(res, 401, { error: 'Sign in required' }); return true; }
      if (req.method === 'GET') { renderTurnstileCheck(res, pending); return true; }
      if (!sameOrigin(req, config)) { sendJson(res, 403, { error: 'Invalid origin' }); return true; }
      let fields;
      try { fields = new URLSearchParams(await readBody(req)); }
      catch (error) { sendJson(res, error.status || 400, { error: 'Invalid verification response' }); return true; }
      const token = fields.get('cf-turnstile-response') || '';
      const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
      const valid = token.length > 0 && token.length <= 2048 && await verifyTurnstile(pending.secretKey, token, ip, 'dsh-key-rotation');
      if (!valid) {
        config.siteKey = pending.previousSiteKey;
        config.turnstileSecret = pending.previousSecretKey;
        pendingRotations.delete(id);
        renderTurnstileCheck(res, pending, 'failure');
        return true;
      }
      const nextRecord = { ...credentialRecord(config), siteKey: pending.siteKey, turnstileSecret: pending.secretKey };
      try { await persistCredentials(nextRecord); }
      catch {
        config.siteKey = pending.previousSiteKey;
        config.turnstileSecret = pending.previousSecretKey;
        pendingRotations.delete(id);
        renderTurnstileCheck(res, pending, 'failure');
        return true;
      }
      config.siteKey = pending.siteKey;
      config.turnstileSecret = pending.secretKey;
      pendingRotations.delete(id);
      renderTurnstileCheck(res, pending, 'success');
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/admin/update') {
      if (!sameOrigin(req, config)) { sendJson(res, 403, { error: 'Invalid origin' }); return true; }
      if (!validCookie(req)) { sendJson(res, 401, { error: 'Sign in required' }); return true; }
      let request;
      try { request = JSON.parse(await readBody(req)); }
      catch (error) { sendJson(res, error.status || 400, { error: 'Invalid request' }); return true; }
      const currentPassword = typeof request.currentPassword === 'string' ? request.currentPassword : '';
      const nextUsername = typeof request.username === 'string' ? request.username.trim() : config.username;
      const nextPassword = typeof request.newPassword === 'string' ? request.newPassword : '';
      const passwordCheck = await authThrottle.run(() => passwordMatches(currentPassword, config));
      if (passwordCheck.limited) {
        sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(passwordCheck.retryAfter) });
        return true;
      }
      if (!passwordCheck.value) { sendJson(res, 401, { error: 'Current password is incorrect' }); return true; }
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(nextUsername)) {
        sendJson(res, 400, { error: 'Username must be 1-64 letters, numbers, dots, underscores, or hyphens' });
        return true;
      }
      if (nextPassword && (nextPassword.length < 12 || nextPassword.length > 1024)) {
        sendJson(res, 400, { error: 'New password must be at least 12 characters' });
        return true;
      }
      if (nextUsername === config.username && !nextPassword) {
        sendJson(res, 400, { error: 'No credential changes were supplied' });
        return true;
      }
      let passwordHash = config.passwordHash;
      let passwordSalt = config.passwordSalt;
      if (nextPassword) {
        const hashResult = await authThrottle.run(() => hashPasswordAsync(nextPassword));
        if (hashResult.limited) {
          sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(hashResult.retryAfter) });
          return true;
        }
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
      try { await persistCredentials(nextRecord); }
      catch { sendJson(res, 500, { error: 'Could not save account settings' }); return true; }
      config.username = nextRecord.username;
      config.passwordHash = passwordHash;
      config.passwordSalt = passwordSalt;
      config.credentialGeneration = nextRecord.generation;
      sendJson(res, 200, { ok: true, signedOut: true }, {
        'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      if (!sameOrigin(req, config)) sendJson(res, 403, { error: 'Invalid origin' });
      else setHeaders(res, 303, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, Location: '/auth/login' });
      if (!res.writableEnded) res.end();
      return true;
    }
    if (req.method !== 'POST' || url.pathname !== '/login') return false;
    if (!sameOrigin(req, config)) { sendJson(res, 403, { error: 'Invalid origin' }); return true; }

    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const current = now();
    let record = attempts.get(ip);
    if (record && record.updatedAt + LOCK_MS <= current) {
      attempts.delete(ip);
      record = undefined;
    }
    if (record?.blockedUntil > current) {
      const seconds = Math.ceil((record.blockedUntil - current) / 1000);
      if (isHtmlFormRequest(req)) await renderLogin(res, { generalError: '尝试次数过多，请稍后再试。' });
      else sendJson(res, 429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': String(seconds) });
      return true;
    }
    let fields;
    try { fields = new URLSearchParams(await readBody(req)); }
    catch (error) { sendJson(res, error.status || 400, { error: 'Invalid request' }); return true; }
    const username = fields.get('username') || '';
    const password = fields.get('password') || '';
    const token = fields.get('cf-turnstile-response') || '';
    if (username.length > 128 || password.length > 1024) {
      await loginError(req, res, 400, { error: 'Invalid credentials input.' }, { generalError: '输入格式无效，请重试。' });
      return true;
    }
    const missingUsername = !username.trim();
    const missingPassword = !password;
    if (missingUsername || missingPassword) {
      await loginError(req, res, 400, { code: 'credentials_required', error: 'Credentials are required.' }, {
        username, shakeUsername: missingUsername, shakePassword: missingPassword,
      });
      return true;
    }
    if (!token || token.length > 2048) {
      await loginError(req, res, 400, { code: 'turnstile_required', error: '请完成人机验证！' }, {
        username, turnstileError: '请完成人机验证！',
      });
      return true;
    }
    const turnstileValid = await verifyTurnstile(config.turnstileSecret, token, ip, 'dsh-login');
    const passwordCheck = turnstileValid
      ? await authThrottle.run(() => passwordMatches(password, config))
      : { limited: false, value: false };
    if (passwordCheck.limited) {
      sendJson(res, 429, { error: 'Authentication capacity exceeded' }, { 'Retry-After': String(passwordCheck.retryAfter) });
      return true;
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
        await loginError(req, res, 400, { code: 'turnstile_required', error: '请完成人机验证！' }, {
          username, turnstileError: '请完成人机验证！',
        });
        return true;
      }
      await loginError(req, res, next >= LOGIN_LIMIT ? 429 : 401, { code: 'invalid_credentials', error: '请检查用户名/密码' }, {
        username,
        passwordError: '请检查用户名/密码',
        generalError: next >= LOGIN_LIMIT ? '尝试次数过多，请稍后再试。' : '',
      });
      return true;
    }
    attempts.delete(ip);
    const session = signedSession({ sub: config.username, exp: Math.floor(current / 1000) + config.ttlSeconds, generation: config.credentialGeneration, nonce: randomBytes(16).toString('base64url') }, config.sessionSecret);
    setHeaders(res, 303, {
      'Set-Cookie': `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${config.ttlSeconds}`,
      Location: '/',
    });
    res.end();
    return true;
  };
}
