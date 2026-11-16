<p align="center"><a href="README.md">英文版</a> | <a href="README.zh-CN.md">中文版</a></p>

# DSH Login Gateway

A DSH login-gateway plugin package: protected login page with Turnstile, account management, safe background-image configuration, and user-authored effects in an isolated sandbox.

> **Install through the DSH panel AI.** Open your DSH Web panel and ask its AI to review this GitHub repository and install/configure it for your instance. Do not paste private keys or passwords into GitHub, issues, prompts, or chat. The AI must first check the prerequisites below and warn you which sensitive values need local configuration.

## DSH AI installation (required)

1. Confirm the DSH panel AI is already configured with a working provider, model, and API credential in **Settings → Models**. If not, ask the panel AI to stop and guide you to configure them there first. Do not place provider API keys in this repository or paste them into a chat message.
2. In the DSH panel, ask the AI to inspect this repository and install the `plugin/` bundle using the DSH plugin manager. Ask it to review `INSTALL_WITH_DSH_AI.md` before making system changes.
3. Ask the AI to explain the gateway, reverse-proxy, and TLS changes it proposes. It must not overwrite existing DSH/Nginx settings without inspecting and preserving them.
4. During setup, enter the required secrets directly into local protected configuration or the relevant provider dashboard. Do not commit them, include them in screenshots/logs, or send them in GitHub issues.
5. Have the AI verify login, Turnstile, authenticated DSH access, logout, and the settings page. Keep an out-of-band recovery path until the gate is verified.

Manual installation outside the DSH panel AI is not the supported path. The gateway is a system service and reverse-proxy integration, not just a client-side UI plugin; a plugin-only install does not protect DSH by itself.

## Sensitive setup values

The panel AI must call these out before installation and help configure them locally:

- A hostname controlled by you, DNS pointing to your server, and a valid HTTPS certificate. The certificate private key stays on the server.
- Cloudflare Turnstile Site Key and Secret Key for that hostname. The Secret Key belongs only in the gateway's root/service-readable environment file.
- A unique gateway username and a strong initial password. Only its scrypt hash is stored by the gateway.
- A random session-signing secret of at least 32 bytes.
- The public HTTPS origin, DSH upstream address/port, and local gateway port. Do not reuse this repository's examples without checking your own topology.
- Any DSH AI/provider API keys needed by the panel AI, configured in DSH **Settings → Models**, not in this repository.

Use a local environment file with owner-only permissions (for example, `chmod 600`). `gateway/.env.example` contains placeholders only and is not a ready-to-run config.

## Repository layout

- `plugin/`: DSH Web settings bundle for account, background, custom sandbox effects, and Turnstile key management.
- `gateway/`: Node.js service, login page, password-hash helper, and automated tests.
- `deploy/snippets/dsh-cookie.conf`: Nginx Cookie/Set-Cookie forwarding include; install it at the path referenced by the Nginx template.
- `INSTALL_WITH_DSH_AI.md`: detailed DSH panel AI handoff prompt and installation checklist.
- `DSH_COMPATIBILITY.md`: declared DSH range and evidence status.

## Safe defaults

The login form and Turnstile challenge are not editable by custom page code. User-authored code runs in an isolated, opaque-origin iframe with a restrictive CSP; it has no access to the parent DOM, cookies, forms, or network APIs. Remote backgrounds must use HTTPS, except for the supported fixed-host image APIs, whose returned image links are constrained and upgraded to HTTPS.

The gateway binds to loopback. Nginx must protect every DSH route with the gateway auth check and proxy only the explicitly configured auth endpoints. Keep the old unauthenticated port closed. Verify your own deployment before exposing it publicly.

## Tests

Requires Node.js 22.19 or later:

```sh
cd gateway
npm test
```

This runs gateway, client-contract, and deployment tests. If Nginx is installed, the suite also starts a temporary Nginx instance to verify the auth subrequest and Cookie/Set-Cookie proxy contract; the Nginx cases are skipped when the binary is unavailable.

## License

MIT. See `LICENSE`.
