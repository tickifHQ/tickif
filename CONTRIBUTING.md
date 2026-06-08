# Contributing

## Branching

- Branch off `main`. Name branches `type/short-desc` or, when a ticket exists,
  lead with the ID: `e-82-session-management`, `fix/null-crash`.
- Never commit directly to `main` — open a PR.

## Pull requests

- One logical change per PR. Split unrelated cleanup.
- Fill out the PR template. The **PR title becomes the squashed commit** on
  `main`, so write it as a clean conventional-commit summary
  (`feat(web): …`, `fix(db): …`, `chore: …`).
- Keep your branch current by **rebasing** on `main`, not merge-committing.
- Get at least one review before merging.

## Merging

`main` allows **squash** and **rebase** merges only — merge commits are
disabled to keep history linear. Branches auto-delete after merge.

CI (`typecheck / lint / test / build` + migration-drift gating) must be green
before merging. Run it locally first:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Enforcement note

This repo is on the free GitHub plan, so these rules are **convention, not
hard-enforced** — `main` is technically pushable and CI cannot block a merge.
Upgrading the org to a paid plan (or making the repo public) unlocks branch
protection to enforce: required PR + approval, required passing CI, no
force-push, and linear history.
