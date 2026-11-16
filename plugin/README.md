# DSH login gateway settings

A Web settings page for the DSH login gateway, registered under Settings as **DSH login**. It manages the login account, backgrounds, sandboxed custom effects, Turnstile keys, and logout. Updating credentials revokes all old sessions and returns the browser to the login page.

The account, appearance, and Turnstile forms validate only on submit. Errors appear next to their fields with accessible `aria-invalid` and live descriptions; correcting a field that is already in error clears the error immediately. Success uses a green border and SVG check. Blur never triggers validation.

The login page supports an HTTPS background image URL, the BTSTU daily wallpaper JSON API URL, the `3650000.xyz/api/?type=img&mode=...` HTML API, or an uploaded PNG/JPEG/WebP image under 4 MiB. Daily APIs are resolved on the server each login-page load and only HTTPS image targets are used; the 3650000 parser only permits `gtimg.com` image hosts. The custom HTML/CSS/JavaScript field runs in a full-viewport sandboxed iframe behind the immutable login form. The settings page keeps account, appearance, Turnstile, and session feedback beside their respective sections.

Turnstile key replacement requires the current account password and a fresh challenge for the candidate Site Key. The Secret Key remains server-side; the old pair is backed up during the pending check and restored on failure. Only a successful Cloudflare Siteverify result for the configured host/action persists the new pair.

The public login gateway is configured by the target host and is not tied to any repository maintainer domain. Use the hostname and HTTPS origin selected during DSH panel AI installation. Keep legacy direct-access ports disabled after verification.
