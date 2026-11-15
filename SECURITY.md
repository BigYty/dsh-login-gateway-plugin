# Security policy

## Never publish deployment secrets

Do not commit environment files, credentials state, password hashes, Turnstile Secret Keys, DSH/provider API keys, session-signing secrets, cookies, TLS private keys, private hostnames, or production logs. Use local protected configuration excluded by `.gitignore`.

The public example files contain placeholders only. If a secret was accidentally committed, removing it in a later commit is not enough: revoke/rotate it immediately and rewrite repository history before publishing.

## Installation safety

Install and configure this project through the DSH panel AI using `INSTALL_WITH_DSH_AI.md`. The AI must remind users to configure their DSH model/provider credentials in DSH Settings, but must not ask them to disclose those values in chat. Review and confirm host-level service and reverse-proxy changes before applying them.

## Reporting

Do not open a public issue containing secrets or private deployment details. Contact the repository maintainer through a private channel with a minimal reproduction and redacted logs.
