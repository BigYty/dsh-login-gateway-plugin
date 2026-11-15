# Public release checklist

- [ ] Create a new GitHub repository and upload this directory only.
- [ ] Confirm no populated `.env`, credentials state, TLS key, cookie, log, or profile directory is present.
- [ ] Confirm the repository scan contains no production hostname, server IP, certificate path, API key, Turnstile Secret Key, session secret, password, or DSH cookie.
- [ ] In the GitHub repository settings, enable secret scanning and push protection where available.
- [ ] Keep the repository's default branch protected and review pull requests before release.
- [ ] Tell users to install through their DSH panel AI using `INSTALL_WITH_DSH_AI.md`; do not advertise manual copy/paste installation as the primary path.
- [ ] Have the panel AI remind each user to configure the DSH model/provider/API credential in DSH Settings before it performs installation. Never collect those values in GitHub or chat.
