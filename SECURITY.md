# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Najva, please **do not** open a public GitHub issue.

Instead, report it privately via one of these channels:

- **GitHub Security Advisories:** [Report a vulnerability](https://github.com/MatinMHF/najva-messenger/security/advisories/new)
- **Email:** (add your security contact email here)

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We aim to respond within **48 hours** and will keep you updated on the fix.

## Scope

In scope:
- Client-side cryptography (`client/src/lib/crypto/`)
- Authentication flows (login, registration, password recovery)
- API endpoints (`server/src/`)
- Docker/deployment configuration

Out of scope:
- Third-party dependencies (report to their maintainers)
- Social engineering

## Known Limitations (v1)

See [`docs/ENCRYPTION.md#threat-model`](docs/ENCRYPTION.md#threat-model--what-v1-does-not-protect) for documented security gaps, including:

- No per-message forward secrecy (Signal ratchet is dormant in v1)
- No safety numbers / key verification
- Metadata (who talks to whom, timestamps) is visible to the server
- XSS would allow MK exfiltration from a logged-in session
