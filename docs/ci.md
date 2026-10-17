# PostHub's CI pipeline (GitHub Actions)

Every push to `main` and every pull request runs PostHub's continuous integration
(CI) pipeline on GitHub's servers. It checks that the project still builds and
its tests still pass on a clean machine, so a broken change shows up as a red
check on the pull request before it is merged. The pipeline only verifies; it
never deploys anything.

The pipeline is a single workflow file, `.github/workflows/ci.yml`. This document
explains it piece by piece.

## Anatomy of a workflow

* **Workflow:** a YAML file in `.github/workflows/`. GitHub runs it automatically
  when one of its triggers fires.
* **Trigger (`on:`):** the events that start a run. PostHub's workflow runs on
  pushes to `main` and on pull requests.
* **Job:** a unit of work that runs on its own fresh virtual machine, called a
  **runner**. `runs-on: ubuntu-latest` asks for a GitHub-hosted Ubuntu machine.
  Jobs run in parallel unless one is told to wait for another.
* **Step:** one task inside a job. Steps run in order on the same runner, and the
  job fails as soon as one step fails.
  * `run:` executes shell commands. GitHub runs them with `bash -e`, so the step
    stops at the first command that exits with an error.
  * `uses:` runs an **action**, a reusable step published by someone else.
    `actions/checkout` copies the repository onto the runner, which starts empty.

Resources to dive deeper into:

* [Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions)
* [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
* [GitHub Marketplace: actions](https://github.com/marketplace?type=actions), the catalogue of published actions
* [GitHub's official actions](https://github.com/actions), such as `checkout`, `setup-node`, and `cache`

### What gets tested on a pull request

On a pull request, the runner does not check out the branch's latest commit.
GitHub creates a temporary merge commit of the branch into `main` and tests that,
so a green check means the code still works *after* merging. That is why the
commit SHA printed by the workflow differs from the one at the tip of the branch.

Resources to dive deeper into:

* [Events that trigger workflows: `pull_request`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), including which commit `github.sha` points to

### Expressions: `${{ ... }}`

`${{ github.event_name }}` and `${{ github.sha }}` are expressions. GitHub replaces
them with their values *before* the shell command runs, so the command the shell
sees already contains the text. Because of this, untrusted values such as a pull
request title should never be placed inside `${{ }}` in a `run:` step: whoever
writes that text could inject shell commands.

Resources to dive deeper into:

* [Expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions), the `${{ }}` syntax and its operators
* [Script injections](https://docs.github.com/en/actions/concepts/security/script-injections)

## Limiting the workflow: `permissions` and `concurrency`

### `permissions`: least privilege for the token

Every run receives an automatic credential, the `GITHUB_TOKEN`, which actions
such as `checkout` use to call the GitHub API. What the token is allowed to do
depends on the scopes it is granted (`contents`, `issues`, `pull-requests`, and
so on), each set to `read`, `write`, or `none`.

* A top-level `permissions` key applies to every job in the workflow. Every scope
  not listed is set to `none`.
* A job can set its own `permissions`, which replaces the top-level value for
  that job.

**PostHub's choice:** `contents: read`, because the workflow only needs to read
the code. The repository's default token is already read-only, but it is still
set explicitly, for two reasons:

* The default is a repository setting, not code. It can be changed in the
  settings page, and other repositories (a fork, for example) may default to
  read and write. Declaring it in `ci.yml` makes it visible, reviewable, and the
  same everywhere.
* It is narrower than the default, which grants read access to every scope.
  `contents: read` grants access to the code only.

If an action the workflow runs were ever compromised, the token would let it do
nothing beyond reading code that is already public.

### `concurrency`: cancelling outdated runs

A concurrency group limits how many runs sharing the same group name can be
active at once: one running and one pending. A newer pending run replaces an
older pending one. Within a run, jobs still run in parallel, each on its own
runner.

* `group` is any string, and runs that produce the same string limit each other.
  Group names are shared across the whole repository.
* `cancel-in-progress: true` also cancels the run already in progress when a newer
  one joins the group. Without it, the outdated run would still finish.

**PostHub's choice:**

* The group starts with `github.workflow` (the workflow's name, `CI`), so a
  future workflow, such as a deploy workflow, can never land in the same group.
* On a pull request, `github.head_ref` is the branch name, so all pushes to one
  pull request share a group and only the latest commit is tested. On a push to
  `main`, `head_ref` is empty and `||` falls back to `github.run_id`, which is
  unique per run: every commit on `main` keeps its own result, so it is clear
  which commit broke it.
* `cancel-in-progress: true` is safe because this workflow only verifies.
  Stopping a deployment halfway could leave a server in a broken state, which is
  why deploy workflows often set it to `false`.

Resources to dive deeper into:

* [Workflow syntax: `permissions`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
* [About the `GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token)
* [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#setting-the-permissions-of-the-github_token-for-your-repository), where the default token permissions are set
* [Workflow syntax: `concurrency`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
* [Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
* [Contexts reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts), the values available in `github.*`
