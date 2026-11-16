export const WALLPAPER_API = 'https://api.btstu.cn/sjbz/api.php';
export const WALLPAPER_HOSTS = new Set(['api.btstu.cn', 'apis.btstu.cn']);
export const IMAGE_API_URL = 'https://3650000.xyz/api/';
export const IMAGE_API_MODES = new Set(['3', '5', '7', '8', '9']);
export const WALLPAPER_METHODS = new Set(['mobile', 'pc', 'zsy']);
export const WALLPAPER_CATEGORIES = new Set(['', 'meizi', 'dongman', 'fengjing', 'suiji']);

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

export function normalizeBackgroundUrl(value, origin) {
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

export function loginBackgroundUrl(value) {
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
