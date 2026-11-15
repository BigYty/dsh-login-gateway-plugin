# Gateway component

This directory contains the Node.js authentication gateway used by the DSH login plugin. It is not a standalone DSH Web plugin. Install the `plugin/` directory through the DSH panel AI, then let that AI inspect and adapt the service and reverse-proxy templates to the target host.

Do not run this against a production host without a local protected environment file. Start from `.env.example`, generate `AUTH_PASSWORD_HASH` with `create-password-hash.mjs`, generate a new random `SESSION_SECRET`, and provide the target hostname, HTTPS origin, and Turnstile keys locally. Never commit the populated environment file or credentials state.

Run tests with:

```sh
npm test
```

The service binds to loopback by default. A reverse proxy must protect DSH routes with `/check` and explicitly proxy the auth endpoints. Review and validate the target host's existing configuration before applying the examples.
