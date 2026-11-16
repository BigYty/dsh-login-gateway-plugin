import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  IMAGE_API_MODES,
  IMAGE_API_URL,
  normalizeBackgroundUrl,
  WALLPAPER_API,
  WALLPAPER_CATEGORIES,
  WALLPAPER_METHODS,
} from './background-urls.mjs';

function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: 'png', type: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

export function createAppearanceRoutes({ config, fetchImpl, validCookie, sameOrigin, readBody, sendJson, setHeaders, credentialRecord, persistCredentials }) {
  return async (req, res, url) => {
    if (req.method === 'GET' && url.pathname === '/customization') {
      setHeaders(res, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src data: blob: https:; font-src data: https:; frame-src https:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${config.origin}`,
      });
      res.end(config.customHtml || '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/background/3650000') {
      const mode = url.searchParams.get('mode') || '3,5,7,8,9';
      const modes = mode.split(',');
      if ([...url.searchParams.keys()].some((key) => key !== 'mode') || url.searchParams.getAll('mode').length > 1 ||
          !mode || modes.length > IMAGE_API_MODES.size || modes.some((value) => !IMAGE_API_MODES.has(value)) || new Set(modes).size !== modes.length) {
        sendJson(res, 400, { error: 'Invalid 3650000 image API mode' });
        return true;
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
        res.end();
      } catch {
        sendJson(res, 502, { error: '3650000 image service did not return a supported image URL' });
      }
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/background/daily') {
      const method = url.searchParams.get('method') || 'pc';
      const category = url.searchParams.get('lx') || '';
      if ([...url.searchParams.keys()].some((key) => !['method', 'lx'].includes(key)) ||
          url.searchParams.getAll('method').length > 1 || url.searchParams.getAll('lx').length > 1 ||
          !WALLPAPER_METHODS.has(method) || !WALLPAPER_CATEGORIES.has(category)) {
        sendJson(res, 400, { error: 'Invalid daily wallpaper options' });
        return true;
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
        if (String(data.code) !== '200' || typeof data.imgurl !== 'string' || data.imgurl.length > 2048) throw new Error('Wallpaper service returned no image');
        const image = new URL(data.imgurl);
        if (image.protocol !== 'https:' || image.username || image.password || image.hash) throw new Error('Wallpaper image URL is invalid');
        setHeaders(res, 302, { Location: image.href, 'Cache-Control': 'no-store' });
        res.end();
      } catch {
        sendJson(res, 502, { error: 'Daily wallpaper service could not return a valid HTTPS image' });
      }
      return true;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/background/')) {
      const match = url.pathname.match(/^\/background\/([a-f0-9]{32})\.(png|jpe?g|webp)$/i);
      if (!match) {
        sendJson(res, 404, { error: 'Not found' });
        return true;
      }
      const filename = `${match[1]}.${match[2].toLowerCase()}`;
      try {
        const image = await readFile(path.join(path.dirname(config.credentialFile), 'backgrounds', filename));
        const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
        setHeaders(res, 200, { 'Content-Type': types[match[2].toLowerCase()], 'Cache-Control': 'public, max-age=86400' });
        res.end(image);
      } catch {
        sendJson(res, 404, { error: 'Not found' });
      }
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/admin') {
      if (!validCookie(req)) sendJson(res, 401, { error: 'Sign in required' });
      else sendJson(res, 200, {
        username: config.username,
        backgroundUrl: config.backgroundUrl,
        customHtml: config.customHtml,
        turnstileConfigured: Boolean(config.siteKey && config.turnstileSecret),
      });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/admin/preferences') {
      if (!sameOrigin(req, config)) { sendJson(res, 403, { error: 'Invalid origin' }); return true; }
      if (!validCookie(req)) { sendJson(res, 401, { error: 'Sign in required' }); return true; }
      let request;
      try { request = JSON.parse(await readBody(req, 48 * 1024)); }
      catch (error) { sendJson(res, error.status || 400, { error: 'Invalid request' }); return true; }
      let backgroundUrl;
      try { backgroundUrl = normalizeBackgroundUrl(request.backgroundUrl ?? config.backgroundUrl, config.origin); }
      catch (error) { sendJson(res, 400, { error: error.message }); return true; }
      const customHtml = request.customHtml === undefined ? config.customHtml : request.customHtml;
      if (typeof customHtml !== 'string' || Buffer.byteLength(customHtml) > 32 * 1024) {
        sendJson(res, 400, { error: 'Custom login content must be text under 32 KiB' });
        return true;
      }
      const nextRecord = { ...credentialRecord(config), backgroundUrl, customHtml };
      try { await persistCredentials(nextRecord); }
      catch { sendJson(res, 500, { error: 'Could not save login page settings' }); return true; }
      config.backgroundUrl = backgroundUrl;
      config.customHtml = customHtml;
      sendJson(res, 200, { ok: true, backgroundUrl, customHtml });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/admin/background') {
      if (!sameOrigin(req, config)) { sendJson(res, 403, { error: 'Invalid origin' }); return true; }
      if (!validCookie(req)) { sendJson(res, 401, { error: 'Sign in required' }); return true; }
      let request;
      try { request = JSON.parse(await readBody(req, 6 * 1024 * 1024)); }
      catch (error) { sendJson(res, error.status || 400, { error: 'Invalid image upload' }); return true; }
      if (typeof request.data !== 'string' || request.data.length > 5_600_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.data)) {
        sendJson(res, 400, { error: 'Upload a PNG, JPEG, or WebP image up to 4 MiB' });
        return true;
      }
      const bytes = Buffer.from(request.data, 'base64');
      if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) {
        sendJson(res, 400, { error: 'Upload a PNG, JPEG, or WebP image up to 4 MiB' });
        return true;
      }
      const imageType = detectImageType(bytes);
      if (!imageType) { sendJson(res, 400, { error: 'Only PNG, JPEG, and WebP images are supported' }); return true; }
      const filename = `${randomBytes(16).toString('hex')}.${imageType.ext}`;
      const directory = path.join(path.dirname(config.credentialFile), 'backgrounds');
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(path.join(directory, filename), bytes, { mode: 0o600, flag: 'wx' });
      } catch { sendJson(res, 500, { error: 'Could not store background image' }); return true; }
      const backgroundUrl = `/auth/background/${filename}`;
      const nextRecord = { ...credentialRecord(config), backgroundUrl };
      try { await persistCredentials(nextRecord); }
      catch { sendJson(res, 500, { error: 'Could not save background setting' }); return true; }
      config.backgroundUrl = backgroundUrl;
      sendJson(res, 200, { ok: true, backgroundUrl, contentType: imageType.type });
      return true;
    }
    return false;
  };
}
