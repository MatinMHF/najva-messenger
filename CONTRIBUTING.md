# Contributing to Najva

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/MatinMHF/najva-messenger.git
cd najva-messenger
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This starts all services with hot-reloading enabled.

## Project Structure

See the [Project Structure section in README](README.md#-project-structure).

## Code Style

- **TypeScript** everywhere — no untyped `any` unless unavoidable
- **Prettier** formatting (run before committing)
- Follow the existing patterns in each layer (controllers → services → Prisma)
- New crypto primitives must come with unit tests in `client/src/lib/crypto/__tests__/`

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add group avatar upload
fix: handle missing CK gracefully
docs: update ENCRYPTION.md threat model
chore: bump mediasoup to 3.15
```

## Pull Request Process

1. Fork and create a feature branch from `main`
2. Make your changes with tests where applicable
3. Ensure `npm test` passes in both `client/` and `server/`
4. Update documentation if you change behaviour
5. Open a PR with a clear description of what changed and why

## Security-Sensitive Changes

Changes to `client/src/lib/crypto/`, `server/src/services/auth.service.ts`, or `docs/ENCRYPTION.md` require extra scrutiny and must reference the threat model.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
