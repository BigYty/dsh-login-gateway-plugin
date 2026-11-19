#!/usr/bin/env node
// Refresh nginx's private bootstrap map when the DSH process starts.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export function tokenFromJournal(text, hostname) {
  for (const line of text.split('\n').reverse()) {
    const match = line.match(/dsh web:\s+(https?:\/\/\S+)/);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      const token = url.searchParams.get('token');
      if (url.hostname === hostname && /^[A-Za-z0-9_-]{43}$/.test(token || '')) return token;
    } catch { /* Ignore malformed or unrelated log lines. */ }
  }
  return null;
}

export function renderMap(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid bootstrap token');
  return `map $http_cookie $dsh_boot_suffix {\n    default "?token=${token}";\n    ~*dsh-auth- "";\n}\n`;
}

async function main() {
  const pid = process.env.MAINPID;
  const hostname = process.env.DSH_PUBLIC_HOST;
  const target = process.env.DSH_BOOTSTRAP_MAP;
  if (!/^\d+$/.test(pid || '') || !/^[a-z0-9.-]+$/.test(hostname || '') || !target?.startsWith('/')) {
    throw new Error('MAINPID, DSH_PUBLIC_HOST and absolute DSH_BOOTSTRAP_MAP are required');
  }
  let token;
  for (let attempt = 0; attempt < 60 && !token; attempt++) {
    const logs = execFileSync('journalctl', ['--boot', '--no-pager', '-o', 'cat', `_PID=${pid}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    token = tokenFromJournal(logs, hostname);
    if (!token) await delay(1000);
  }
  if (!token) throw new Error('DSH bootstrap token not found for current process');
  const previous = existsSync(target) ? readFileSync(target) : null;
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, renderMap(token), { mode: 0o600, flag: 'wx' });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    execFileSync('nginx', ['-t'], { stdio: 'ignore' });
    execFileSync('systemctl', ['reload', 'nginx'], { stdio: 'ignore' });
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    if (previous !== null) writeFileSync(target, previous, { mode: 0o600 });
    else if (existsSync(target)) unlinkSync(target);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => { console.error('DSH bootstrap synchronization failed'); process.exitCode = 1; });
}
