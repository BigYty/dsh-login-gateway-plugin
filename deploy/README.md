# Nginx deployment template

Install `deploy/snippets/dsh-cookie.conf` as `/etc/nginx/snippets/dsh-cookie.conf` (or change the include path consistently). It preserves the gateway session Cookie for the internal auth subrequest and passes upstream `Set-Cookie` headers back to the browser.

The suite starts a temporary Nginx plus local auth/upstream test servers. It verifies that anonymous requests are rejected, authenticated Cookie is sent through the auth subrequest and to the upstream, and upstream `Set-Cookie` is returned. Run it from the repository with `cd gateway && npm test`.

Use the Nginx template from the gateway source as a starting point only. The DSH panel AI must inspect the target host's existing TLS/server blocks, replace every placeholder, preserve unrelated routes, and validate with `nginx -t` before reload.

Required values:

- `server_name`: the user's hostname
- certificate and key paths: target-host paths only; never commit private keys
- DSH upstream port and gateway loopback port
- the `auth_request` check on every DSH route
- explicit auth locations for login, admin, preferences, image upload, customization, Turnstile check, and logout

Do not copy the production hostname, IPv6 address, certificate path, Cloudflare ranges, or cookie header from any other deployment. Keep the gateway loopback-only and keep any legacy direct-access port closed after recovery testing.

## Restart-safe DSH bootstrap (systemd + Nginx)

For DSH versions that generate a process-scoped browser launch token, `sync-dsh-bootstrap.mjs` can maintain a private Nginx `map` include. Its `ExecStartPost` hook reads the launch URL only from the current boot and `MAINPID`, validates the hostname and token, atomically writes a root-only map, tests Nginx, then reloads it. It restores the previous file if validation or reload fails. Do not log, publish, or commit the generated map or launch URL.

This helper is intended only for a trusted gateway that already protects every DSH route with `auth_request`. Configure the root location to use `$dsh_boot_suffix` for the upstream URL and include the generated map in the Nginx `http` context. The map uses the presence of a `dsh-auth-` cookie to avoid a redirect loop; DSH still validates the cookie itself. A stale or unrelated DSH cookie can cause a 401; clear that site's DSH cookies and retry. Forward the gateway and DSH `Set-Cookie` headers.

Install the script in a root-owned directory, set `DSH_PUBLIC_HOST` to the hostname printed in the DSH launch URL (which can be a loopback address), and set `DSH_BOOTSTRAP_MAP` to an absolute root-owned private path. Configure it as the service's `ExecStartPost` with sufficient startup timeout; systemd supplies `MAINPID`. Test with `nginx -t`, preserve an independent recovery path, then restart DSH and verify both a newly issued DSH cookie and an authenticated page. This design depends on DSH's current log format and token format; revalidate it after DSH upgrades.
