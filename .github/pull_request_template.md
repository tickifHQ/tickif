## What & why

<!-- One or two lines: what this PR changes and the reason. Link the issue. -->

Closes #

## Changes

-

## How to test

<!-- Steps a reviewer runs to verify. Note any new env vars / migrations. -->

## Checklist

- [ ] PR title is a clean conventional-commit summary (it becomes the squashed commit on `main`)
- [ ] Scoped to one logical change — unrelated cleanup split out
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass locally
- [ ] DB schema changes ship the generated migration (no drift)
- [ ] No secrets, tokens, or `.env` values committed
- [ ] Branch is up to date with `main` (rebased, not merge-committed)
