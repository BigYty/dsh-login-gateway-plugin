# Nginx deployment template

Use the Nginx template from the gateway source as a starting point only. The DSH panel AI must inspect the target host's existing TLS/server blocks, replace every placeholder, preserve unrelated routes, and validate with `nginx -t` before reload.

Required values:

- `server_name`: the user's hostname
- certificate and key paths: target-host paths only; never commit private keys
- DSH upstream port and gateway loopback port
- the `auth_request` check on every DSH route
- explicit auth locations for login, admin, preferences, image upload, customization, Turnstile check, and logout

Do not copy the production hostname, IPv6 address, certificate path, Cloudflare ranges, or cookie header from any other deployment. Keep the gateway loopback-only and keep any legacy direct-access port closed after recovery testing.
