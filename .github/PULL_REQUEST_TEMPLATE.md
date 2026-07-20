## What this changes

<!-- A sentence or two. Link the issue it closes, if there is one. -->

Closes #

## Why

<!-- The problem being solved, not a restatement of the diff. -->

## How it was verified

<!-- Tests added or run, and anything checked by hand against a live instance. -->

- [ ] `npm test` passes in `server/`
- [ ] `npm test` passes in `client/`
- [ ] Checked against a running instance

## Checklist

- [ ] No secrets, tokens or `.env` contents in the diff
- [ ] Touches the encryption path? Explain the key-handling change below
- [ ] Adds an npm dependency? Note it here — the dev images bake dependencies and need rebuilding
- [ ] Changes `install.sh` or `scripts/`? Say which parts were run on a clean Ubuntu 24.04 box

## Notes for the reviewer

<!-- Anything deliberately left out, known limitations, or areas you want scrutinised. -->
