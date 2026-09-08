# my-dev changes

This document summarizes the extra behavior carried by the `my-dev` branch on
top of `main`. It is intended as a practical map for maintainers reviewing or
rebasing this branch.

The comparison point used for this summary is the current `main...my-dev`
merge-base. It excludes changes that came from merged upstream `main` history.

## WSL Git support

`my-dev` adds repository-level Git source selection. A repository can use the
bundled Git, a configured external Git executable, WSL Git, or SSH Git.

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

SSH Git extends the same process layer so a repository can run Git on a remote
POSIX shell reached through WSL's `ssh`. Repository Settings exposes the SSH
command and remote Git executable under **Git source**; the default local test
command is `ssh frz@127.0.0.1 -p 20022` and the default remote executable is
`/usr/bin/git`. The remote executable can be changed to paths such as
`~/miniforge3/bin/git`. By default SSH Git uses the same Windows/WSL path
translation as WSL Git, so Windows paths such as `E:\repo` are executed as
`/mnt/e/repo` on the SSH host. Remote operations for SSH Git do not inject
Desktop's local credential helper or local hook proxy into the remote shell, so
push, fetch, and pull use the SSH host's own Git credential and hook
configuration.

SSHFS-Win mapped repositories can also be added through **Add local
repository**. When the selected repository path is on the `X:`, `Y:`, or `Z:`
drive, the dialog prompts for an SSH command plus remote Git executable and
stores the repository as SSH Git using SSHFS path translation. For example,
`X:\home\feiran\hyper-parallel` is executed remotely as
`/home/feiran/hyper-parallel`. The repository and worktree records keep the
selected SSHFS drive path so two servers that both contain
`/home/feiran/hyper-parallel` can coexist as `X:\...` and `Y:\...`, while Git
commands still execute through SSH. If a Git result later contains a remote
`/home/...` path, file-opening actions translate that path back through the
remembered SSHFS drive before handing it to Windows applications.

## Periodic fetch is opt-in

Automatic background fetches are disabled by default for repositories on this
branch. Manual fetch, pull, and push operations still behave normally.

Repository Settings includes a **Periodically fetch this repository** checkbox.
When enabled, the preference is saved in the repository workflow preferences as
`periodicFetchEnabled: true`.

## Submodule recursion is disabled for network updates

Fetch and pull commands include `--no-recurse-submodules`. This keeps routine
repository network updates from recursively touching submodules.

## Worktree dropdown details

The toolbar worktree dropdown groups the main and linked worktrees and exposes
the full worktree details on row hover or keyboard focus. The detail tooltip
includes the branch, full path, last branch-tip modification time, HEAD SHA,
worktree type, and locked or prunable state when applicable.

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

## Compare diff and merge preview selection

After selecting a branch in the Compare tab, the selected comparison view shows
fixed diff and merge preview rows above the commit list. The diff preview shows
the direct tree difference between the two branch tips. The merge preview shows
the result of virtually merging one tip into the other. Selecting either row
shows the files that would change, the added/removed line totals, and lets each
file's diff be opened in the right-hand history pane.

The diff row follows the active comparison direction: it compares the current
branch tip to the selected branch on **Behind**, and the selected branch tip to
the current branch on **Ahead**.

- On the **Behind** tab, the virtual row shows the files that would change if the
  compared branch were merged into the current branch.
- On the **Ahead** tab, the virtual row shows the files that would change if the
  current branch were merged into the compared branch.

The preview uses Git's virtual merge tree and diffs that tree against the target
branch tip, so it does not modify the working tree or create a real commit.
Conflict previews still load as selectable virtual rows and mark conflicted
files in the right-hand file list.

Repository refreshes, including restoring window focus, preserve the selected
preview and its file diff while the comparison direction, branches, and tip
commits remain unchanged. A diff preview remains selected even when the commit
list is empty. A merge preview is cleared when there are no commits to merge.

## Changes view staging

The Changes view preserves Git's real index state and splits the working
directory file list into **Staged changes** and **Unstaged changes** sections.
File checkboxes and the file context menu stage or unstage paths through Git
instead of only changing Desktop's in-memory include state.

When a path has both staged and unstaged changes, it appears once in each
section. Selecting the staged row shows the staged diff (`git diff --staged`);
selecting the unstaged row shows the remaining worktree diff (`git diff`).
Each section header also exposes a one-click selection action for the visible
staged or unstaged rows in that section. The unstaged section header can stage
its visible rows, and the staged section header can unstage its visible rows.

When staged files exist, creating a commit uses the existing index directly so
partially staged changes from Git are preserved. If no files are staged, the
older include/partial-selection commit path remains available as a compatibility
fallback.

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

File rows and the current file's diff header show added and removed line counts
in Changes, History, and Compare, including merge previews and remerge diffs.
Staged and unstaged rows count their respective changes independently. Counts
describe the full file change, including whitespace changes, and stay the same
when contextual lines are expanded. Binary files display **Binary** instead of
line counts; submodules do not display file line counts.

Working directory statistics load in the background using the repository's
configured Git source. Ordinary tracked files are batched; new, renamed, and
copied files use a limited number of concurrent Git calls. Failed statistics
remain unavailable instead of being displayed as zero.

Working directory diffs for renamed and copied files compare the source and
destination contents directly, so a pure rename shows zero changed lines and
separate source-path edits are not mixed into the destination's diff.

New, untracked, and deleted text diffs temporarily render in unified mode even
when the saved diff display preference is split, since those file states only
have one meaningful side to inspect.

## Build tooling compatibility

The build dependencies require Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`.
The repository pins Node.js 24.19.0 for development; Node.js 24.14.1 is too old
for the current dependencies.

The vendored `printenvz` helper uses node-gyp 13 so Windows builds do not
inherit Node.js 26's LLVM link-time optimization flags when compiling with
Visual Studio's MSVC toolchain.

The test runner disables Node.js's built-in Web Storage so browser tests use
jsdom's `localStorage` and `sessionStorage` on newer Node.js versions.

## Tests touched by the branch

Focused unit coverage was added or updated for:

- WSL Git source detection and path translation.
- WSL Git process execution.
- WSL trampoline environment behavior.
- SSH Git source selection and WSL-style command/path translation.
- Git checkout, pull, reset, worktree, log, and diff behavior.
- Gitee and GitCode endpoint mapping and remote parsing.
- WSL-aware worktree path translation and operations.
- Compare merge preview selection.
- Changes view staging.
- History author/committer search parsing and matching.
- Diff display fallback for new, untracked, and deleted files.
- Progress parsing and model type guards.
