# my-dev changes

This document summarizes the extra behavior carried by the `my-dev` branch on
top of `main`. It is intended as a practical map for maintainers reviewing or
rebasing this branch.

The comparison point used for this summary is the current `main...my-dev`
merge-base. It excludes changes that came from merged upstream `main` history.

## WSL Git support

`my-dev` adds repository-level Git source selection. A repository can use the
bundled Git, a configured external Git executable, or WSL Git.

WSL repositories are detected from Ubuntu UNC paths such as
`\\wsl.localhost\Ubuntu\...`. For these repositories, the default source is WSL
Git; non-WSL paths fall back to bundled Git unless the repository has an
explicit override. Repository Settings exposes the selection under **Git
source** and stores the selection with the repository.

The WSL Git path also includes:

- Windows-to-WSL and WSL-to-Windows path translation helpers.
- A WSL Git runner used by the Git process layer.
- Environment and credential-helper handling for Git commands that execute
  through WSL.
- Worktree, config, hook, reset, cherry-pick, and ref operations adjusted to
  work with translated paths.

## Periodic fetch is opt-in

Automatic background fetches are disabled by default for repositories on this
branch. Manual fetch, pull, and push operations still behave normally.

Repository Settings includes a **Periodically fetch this repository** checkbox.
When enabled, the preference is saved in the repository workflow preferences as
`periodicFetchEnabled: true`.

## Submodule recursion is disabled for network updates

Fetch and pull commands include `--no-recurse-submodules`. This keeps routine
repository network updates from recursively touching submodules.

## Worktree improvements

The branch includes several worktree usability changes:

- The repository sidebar can show linked worktrees nested under their main
  repository.
- Linked worktrees that are not stored as repositories can appear as virtual
  sidebar rows and can be selected from the sidebar.
- Stale or prunable worktree entries are marked and can be pruned from the
  context menu.
- Repository context menus include an **Add new worktree** entry when sidebar
  worktree display is enabled.
- Linked worktree titles prefer the worktree folder name in the sidebar while
  the current repository toolbar/window title can still use the main repository
  name or alias plus the linked worktree suffix.
- Worktree creation allows creating a worktree from a branch that already
  exists, where Git permits the requested operation.
- Cherry-pick and branch-switch flows account for branches checked out in other
  worktrees.

## Gitee and GitCode remotes

`my-dev` recognizes `gitee.com` and `gitcode.com` remotes as supported hosting
providers alongside GitHub, GitHub Enterprise, Bitbucket, and GitLab.

The added handling includes:

- API endpoint mapping for Gitee and GitCode.
- Trusted remote host checks for browser links.
- Remote owner/name extraction fixes for these providers.
- Commit, branch, pull request, and repository "View on ..." labels and URLs.
- UI copy in repository lists, history, changes, branch menus, pull request
  views, and push/pull controls.

## Merge commit remerge diff mode

History view can show merge commits using either the first-parent diff or Git's
remerge diff. When a single merge commit is selected, the file header shows a
diff mode toggle:

- **First parent** uses the existing first-parent merge commit comparison.
- **Remerge** uses `git log --remerge-diff` for changed files and file diffs.

If remerge diff loading fails, the app falls back to first-parent mode. Image
diff rendering is disabled for remerge diffs.

## History author and committer search

History search supports advanced text syntax for matching commit identity
metadata without changing the existing plain-text search behavior.

Supported identity fields are:

- `author:<text>` for commit author name or email.
- `committer:<text>` for commit committer name or email.

Queries can combine identity filters and plain text with `AND`, `OR`, `NOT`,
parentheses, and quoted values. Adjacent advanced terms are treated as `AND`.
Examples:

- `author:alice`
- `committer:ci@example.com`
- `author:"Jane Doe" AND NOT committer:bot`
- `(author:alice OR author:bob) AND committer:desktop`

Malformed advanced syntax falls back to the legacy plain-text search while the
user is typing. List and graph History views share the same matcher, and
advanced searches re-filter from the loaded history instead of relying on the
legacy incremental narrowing shortcut so `OR` and `NOT` expressions do not miss
matches.

## Smaller diff presentation changes

The branch adjusts commit detail styling and diff-related parsing to handle
remerge diff headers and reduce visual bulk in the diff area.

## Tests touched by the branch

Focused unit coverage was added or updated for:

- WSL Git source detection and path translation.
- WSL Git process execution.
- WSL trampoline environment behavior.
- Git checkout, pull, reset, worktree, log, and diff behavior.
- Gitee and GitCode endpoint mapping and remote parsing.
- Repository matching and linked worktree grouping.
- History author/committer search parsing and matching.
- Progress parsing and model type guards.
