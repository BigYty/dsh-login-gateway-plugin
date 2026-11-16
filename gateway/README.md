# Gateway component

The Node.js service provides the authenticated login endpoints used by the DSH settings bundle. It is not a standalone DSH Web plugin: install `plugin/` through the DSH panel AI, then configure this service and the reverse proxy for the target host.

## Configuration

Create a protected local environment file from `.env.example`. Generate `AUTH_PASSWORD_HASH` with `create-password-hash.mjs`; generate a new random `SESSION_SECRET`; configure the owned hostname, canonical HTTPS origin, username, Turnstile keys and local service port. Never commit the populated environment file or credentials state.

| Variable | Default | Validation / purpose |
| --- | --- | --- |
| `EXPECTED_HOSTNAME` | required | Fully qualified domain name |
| `PUBLIC_ORIGIN` | required | Canonical HTTPS origin matching the hostname |
| `AUTH_USERNAME` | required | Initial gateway account; persisted credential state takes precedence after first start |
| `AUTH_PASSWORD_HASH` | required | `scrypt-hash-hex:salt-hex`; generated locally |
| `SESSION_SECRET` | required | At least 32 bytes |
| `TURNSTILE_SITE_KEY` | required | Public Site Key for the hostname |
| `TURNSTILE_SECRET_KEY` | required | Secret Key; keep only in local protected configuration |
| `PORT` | `31322` | Integer from 1024 through 65535; service binds to loopback |
| `SESSION_TTL_SECONDS` | `28800` | Integer from 300 through 86400, inclusive |
| `AUTH_RATE_PER_MINUTE` | `30` | Global password-work window limit |
| `AUTH_MAX_CONCURRENT` | `4` | Maximum simultaneous password KDF operations |
| `CREDENTIALS_FILE` | `/var/lib/dsh-login-gateway/credentials.json` | Persisted account and appearance state |

`SESSION_TTL_SECONDS` is optional. If omitted, the service uses 28,800 seconds (8 hours). If supplied, it must contain only decimal digits and resolve to an integer in the inclusive range 300–86,400 seconds. Non-numeric, negative, fractional, or out-of-range values fail configuration loading and stop startup; they are not silently clamped.

## Request flow and modules

- `server.mjs` validates environment configuration, owns session/credential primitives, composes dependencies and dispatches requests.
- `auth-routes.mjs` handles login, session checks, account changes, logout and Turnstile key rotation.
- `background-urls.mjs` owns URL validation/normalization and the public image-proxy path mapping shared by auth and appearance routes.
- `appearance-routes.mjs` handles login-page preferences, image uploads/resolution and the isolated customization document.
- `public/login.html` is the immutable login form rendered by the auth routes.

The service binds to loopback. A reverse proxy must protect every DSH route with `/check` and explicitly proxy the auth endpoints. `../deploy/snippets/dsh-cookie.conf` preserves Cookie forwarding; install it at the path referenced by the Nginx template. Inspect and validate the target host's existing proxy configuration before applying the examples.

## Tests

Requires Node.js 22.19 or later. Run the complete gateway, Nginx and client regression suite from this directory:

```sh
npm test
```

The suite covers configuration and session boundaries, gateway route behavior, settings bundle registration and key user actions, plus Nginx `auth_request` and Cookie forwarding. Nginx syntax/live integration tests are skipped when the `nginx` binary is unavailable. Test credentials and upstream responses are synthetic; the suite does not contact production services.
