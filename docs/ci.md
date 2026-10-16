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

### What gets tested on a pull request

On a pull request, the runner does not check out the branch's latest commit.
GitHub creates a temporary merge commit of the branch into `main` and tests that,
so a green check means the code still works *after* merging. That is why the
commit SHA printed by the workflow differs from the one at the tip of the branch.

### Expressions: `${{ ... }}`

`${{ github.event_name }}` and `${{ github.sha }}` are expressions. GitHub replaces
them with their values *before* the shell command runs, so the command the shell
sees already contains the text. Because of this, untrusted values such as a pull
request title should never be placed inside `${{ }}` in a `run:` step: whoever
writes that text could inject shell commands.

Resources to dive deeper into:

* [Understanding GitHub Actions](https://docs.github.com/en/actions/about-github-actions/understanding-github-actions)
* [Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)
* [Security hardening: script injections](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections)
* [GitHub Marketplace: actions](https://github.com/marketplace?type=actions), the catalogue of published actions
* [GitHub's official actions](https://github.com/actions), such as `checkout`, `setup-node`, and `cache`
