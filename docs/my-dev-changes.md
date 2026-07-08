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
`/mnt/e/repo` on the SSH host.

SSHFS-Win mapped repositories can also be added through **Add local
repository**. When the selected repository path is on the `X:`, `Y:`, or `Z:`
drive, the dialog prompts for an SSH command plus remote Git executable and
stores the repository as SSH Git using SSHFS path translation. For example,
`X:\home\feiran\hyper-parallel` is executed remotely as
`/home/feiran/hyper-parallel`. When repository or worktree state is held as a
remote `/home/...` path, file-opening actions translate that path back through
the remembered SSHFS drive before handing it to Windows applications.

## Periodic fetch is opt-in

Automatic background fetches are disabled by default for repositories on this
branch. Manual fetch, pull, and push operations still behave normally.

Repository Settings includes a **Periodically fetch this repository** checkbox.
When enabled, the preference is saved in the repository workflow preferences as
`periodicFetchEnabled: true`.

## Submodule recursion is disabled for network updates

Fetch and pull commands include `--no-recurse-submodules`. This keeps routine
repository network updates from recursively touching submodules.

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

## Compare merge preview selection

After selecting a branch in the Compare tab, the selected comparison view shows
a fixed merge preview row above the commit list. Selecting that row behaves like
selecting a virtual merge commit: the right-hand history pane shows the files
that would change, the added/removed line totals, and lets each file's diff be
opened.

- On the **Behind** tab, the virtual row shows the files that would change if the
  compared branch were merged into the current branch.
- On the **Ahead** tab, the virtual row shows the files that would change if the
  current branch were merged into the compared branch.

The preview uses Git's virtual merge tree and diffs that tree against the target
branch tip, so it does not modify the working tree or create a real commit.
Conflict previews still load as selectable virtual rows and mark conflicted
files in the right-hand file list.

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
- SSH Git source selection and WSL-style command/path translation.
- Git checkout, pull, reset, worktree, log, and diff behavior.
- Gitee and GitCode endpoint mapping and remote parsing.
- WSL-aware worktree path translation and operations.
- Compare merge preview selection.
- History author/committer search parsing and matching.
- Progress parsing and model type guards.
