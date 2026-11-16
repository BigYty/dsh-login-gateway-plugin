import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const templatePath = path.join(root, 'deploy/nginx-template.conf');
const snippetPath = path.join(root, 'deploy/snippets/dsh-cookie.conf');
const nginxAvailable = spawnSync('nginx', ['-v'], { stdio: 'ignore' }).status === 0;

test('Nginx deployment template includes the authenticated cookie contract', async () => {
  const template = await readFile(templatePath, 'utf8');
  const snippet = await readFile(snippetPath, 'utf8');
  assert.match(template, /auth_request\s+\/_dsh_auth_check/);
  assert.match(template, /include\s+\/etc\/nginx\/snippets\/dsh-cookie\.conf/);
  assert.match(snippet, /proxy_set_header Cookie \$http_cookie;/);
  assert.match(snippet, /proxy_pass_header Set-Cookie;/);
});

test('Nginx authentication template passes nginx -t', { skip: !nginxAvailable }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-gateway-nginx-'));
  const snippet = path.join(dir, 'dsh-cookie.conf');
  const template = path.join(dir, 'nginx.conf');
  await writeFile(snippet, await readFile(snippetPath, 'utf8'));
  await writeFile(template, `
    events {}
    http {
      server {
        listen 127.0.0.1:31389;
        location = /_dsh_auth_check { internal; proxy_pass http://127.0.0.1:31322/check; proxy_pass_request_body off; proxy_set_header Content-Length ""; }
        location / { auth_request /_dsh_auth_check; proxy_pass http://127.0.0.1:31321; include ${snippet.replaceAll('\\', '/')}; }
      }
    }
  `);
  await new Promise((resolve, reject) => {
    const proc = spawn('nginx', ['-t', '-q', '-c', template, '-p', dir], { stdio: 'ignore' });
    proc.once('error', reject);
    proc.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`nginx -t exited ${code}`)));
  });
});

test('Nginx auth_request blocks anonymous requests and forwards gateway cookies', { skip: !nginxAvailable }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-gateway-nginx-live-'));
  let authServer;
  let upstreamServer;
  let nginx;
  const listen = async (server) => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server.address().port;
  };
  try {
    authServer = createServer((req, res) => {
      if (req.headers.cookie === 'dsh_gate=valid') { res.writeHead(204); return res.end(); }
      res.writeHead(401); return res.end();
    });
    upstreamServer = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Set-Cookie': 'upstream=visible; Path=/' });
      res.end(`cookie:${req.headers.cookie || ''}`);
    });
    const authPort = await listen(authServer);
    const upstreamPort = await listen(upstreamServer);
    const nginxPort = await (async () => {
      const probe = createServer();
      const port = await listen(probe);
      await new Promise((resolve) => probe.close(resolve));
      return port;
    })();
    const snippet = path.join(dir, 'dsh-cookie.conf');
    const config = path.join(dir, 'nginx.conf');
    await writeFile(snippet, await readFile(snippetPath, 'utf8'));
    await writeFile(config, `events {}\nhttp { server { listen 127.0.0.1:${nginxPort};\nlocation = /_dsh_auth_check { internal; proxy_pass http://127.0.0.1:${authPort}/check; proxy_pass_request_body off; proxy_set_header Content-Length ""; proxy_set_header Cookie $http_cookie; }\nlocation / { auth_request /_dsh_auth_check; proxy_pass http://127.0.0.1:${upstreamPort}; include ${snippet.replaceAll('\\', '/')}; }\n} }`);
    nginx = spawn('nginx', ['-g', 'daemon off;', '-c', config, '-p', dir], { stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Nginx did not start in time')), 3000);
      const poll = async () => {
        try { await fetch(`http://127.0.0.1:${nginxPort}/`, { signal: AbortSignal.timeout(100) }); clearTimeout(deadline); resolve(); }
        catch { if (nginx.exitCode !== null) { clearTimeout(deadline); reject(new Error(`Nginx exited ${nginx.exitCode}`)); } else setTimeout(poll, 30); }
      };
      poll();
    });
    const denied = await fetch(`http://127.0.0.1:${nginxPort}/protected`);
    assert.equal(denied.status, 401);
    const accepted = await fetch(`http://127.0.0.1:${nginxPort}/protected`, { headers: { Cookie: 'dsh_gate=valid' } });
    assert.equal(accepted.status, 200);
    assert.equal(await accepted.text(), 'cookie:dsh_gate=valid');
    assert.match(accepted.headers.get('set-cookie'), /upstream=visible/);
  } finally {
    if (nginx && nginx.exitCode === null) { nginx.kill('SIGTERM'); await once(nginx, 'exit'); }
    for (const server of [authServer, upstreamServer]) if (server?.listening) await new Promise((resolve) => server.close(resolve));
  }
});
