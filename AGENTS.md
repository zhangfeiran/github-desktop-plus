# Development Notes for Agents

This repository is `github-desktop-plus`. The active feature branch for local
work is usually `my-dev`, which carries branch-specific behavior on top of
upstream `main`.

## Start Here

- Read `docs/my-dev-changes.md` before changing branch behavior. It summarizes
  the durable `my-dev` feature areas and should be updated when new branch-only
  behavior is added.
- Use targeted searches before editing. Good entry points are `app/src/lib`,
  `app/src/ui/history`, `app/src/ui/repositories-list`, and
  `app/src/lib/stores` depending on the feature.
- Keep changes scoped to the requested behavior. Do not realign broad
  architecture or revert unrelated local changes.
- Prefer shared helpers when the same behavior is needed by both store code and
  UI code.

## Current Branch Feature Areas

- WSL Git support and Windows/WSL path translation.
- Per-repository opt-in periodic fetch.
- Fetch and pull using `--no-recurse-submodules`.
- Linked worktree grouping, virtual worktree rows, pruning, and worktree-aware
  branch flows.
- Gitee and GitCode remote recognition, URL generation, and repository grouping.
- History merge commit remerge diff mode.
- History author/committer search with boolean query syntax.

## Useful Validation Commands

Use focused commands for the area you touched, then run the common checks below
when practical:

```powershell
node script/test.mjs app/test/unit/commit-search-test.ts
node_modules\.bin\tsc.cmd --noEmit --skipLibCheck
node_modules\.bin\prettier.cmd --check <touched files>
git diff --check
```

Plain `tsc --noEmit` can fail on this checkout because of dependency typing
noise around `WeakMap`; use `--skipLibCheck` when validating local project
code.

## Windows Notes

- Use PowerShell commands. Prefer `Get-Content | Select-Object` for file slices.
- `git status --short` may need a longer timeout in this repo.
- `rg` treats leading `--...` search strings as flags; use `rg -e` for literal
  option names.

## Documentation Rule

When adding a durable `my-dev` capability, update `docs/my-dev-changes.md` in
the same change. Keep that document capability-oriented rather than
file-by-file.
