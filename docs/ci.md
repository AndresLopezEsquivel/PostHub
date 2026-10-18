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
* [GitHub's official actions](https://github.com/actions), such as `checkout`, `setup-node`, and `cache`

### What gets tested on a pull request

On a pull request, the runner does not check out the branch's latest commit.
GitHub creates a temporary merge commit of the branch into `main` and tests that,
so a green check means the code still works *after* merging. That is why
`github.sha` on a pull request run differs from the commit at the tip of the branch.

Resources to dive deeper into:

* [Events that trigger workflows: `pull_request`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), including which commit `github.sha` points to

### Expressions: `${{ ... }}`

An expression is a value GitHub computes from the run's context before using it.
Expressions can appear in most keys of a workflow. For example, the `concurrency`
group (explained below) is built from two of them:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
```

On a pull request from the `ci-pipeline` branch, the group becomes
`CI-ci-pipeline`.

Inside a `run:` step, GitHub replaces expressions *before* the shell command
runs:

```yaml
- run: echo "Triggered by ${{ github.event_name }} at commit ${{ github.sha }}"
```

On a pull request, the shell receives
`echo "Triggered by pull_request at commit 1a2b3c..."` and never sees the
expression. Because of this, untrusted values such as a pull request title
should never be placed inside `${{ }}` in a `run:` step: whoever writes that
text could inject shell commands.

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

## Checking the infrastructure code: the Terraform job

The `terraform` job checks the Terraform code in `infra/` without an AWS account:
it never reads real infrastructure, needs no credentials, and changes nothing.

```yaml
terraform:
  name: Terraform
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: infra
  steps:
    - name: Check out the repository
      uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        persist-credentials: false

    - name: Set up Terraform
      uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
      with:
        terraform_version: 1.15.9
        terraform_wrapper: false

    - name: Check formatting
      run: terraform fmt -check -diff -recursive

    - name: Initialise without a backend
      run: terraform init -backend=false -input=false -lockfile=readonly

    - name: Validate the configuration
      run: terraform validate
```

`name: Terraform` is the job's display name, which is also the name of the check
shown on a pull request.

### Actions from the Marketplace

An action is a repository with an `action.yml` file that declares its inputs and
the code it runs. The GitHub Marketplace is a catalogue of such repositories.
Inputs are passed with `with:`, much like function arguments.

* **`actions/checkout`** clones the repository into the runner's workspace. By
  default it fetches only the triggering commit (`fetch-depth: 1`) and leaves the
  job's `GITHUB_TOKEN` in `.git/config` so later steps can run authenticated `git`
  commands.
* **`hashicorp/setup-terraform`** downloads the Terraform CLI and adds it to the
  `PATH`. By default it also installs a **wrapper script**: a small program named
  `terraform` that runs the real binary and saves its output and exit code as
  step outputs, for later steps to read (for example, to post a `plan` as a
  pull request comment).

**PostHub's choice:**

* `persist-credentials: false`: nothing in the job runs `git`, so the token is
  not left on disk for later steps to pick up.
* `terraform_version: 1.15.9`: the default, `latest`, could break the build the
  day a new Terraform release changes behaviour, with no change in the code. The
  pinned version matches the one used locally, so CI and the developer format
  the code identically. Both are upgraded together.
* `terraform_wrapper: false`: no step reads Terraform's output, so the wrapper
  would only add a layer between the job and Terraform.

Resources to dive deeper into:

* [GitHub Marketplace: actions](https://github.com/marketplace?type=actions), the catalogue of published actions
* [About custom actions](https://docs.github.com/en/actions/concepts/workflows-and-actions/custom-actions)
* [Metadata syntax for `action.yml`](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
* [`actions/checkout`](https://github.com/actions/checkout), its source and inputs
* [`hashicorp/setup-terraform`](https://github.com/hashicorp/setup-terraform), its source and inputs; the [usage section](https://github.com/hashicorp/setup-terraform#usage) covers the wrapper

### Pinning actions by commit SHA

The text after `@` in `uses:` is a git reference in the action's repository:

| Reference | Example | Can it change? |
| --- | --- | --- |
| Branch | `@main` | Yes, with every push |
| Tag | `@v4`, `@v4.0.1` | Yes, a tag is a movable pointer |
| Commit SHA | `@dfe3c3f8...` (40 characters) | No, the SHA is a hash of the commit's content |

An action runs with access to the job's files and token, so a tag that is
repointed to malicious code reaches every workflow using it on its next run.
This happened in March 2025 to `tj-actions/changed-files`: its tags were
repointed to a commit that printed CI secrets into build logs. Workflows pinned
to a SHA kept running the previous code.

**PostHub's choice:** both actions are pinned to a full SHA, with the version
as a comment for human readers. A pin never updates itself, so new versions must
be adopted deliberately; Dependabot can automate this by opening a pull request
that updates both the SHA and the comment.

Resources to dive deeper into:

* [Secure use reference: using third-party actions](https://docs.github.com/en/actions/reference/security/secure-use)
* [Workflow syntax: `jobs.<job_id>.steps[*].uses`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses)
* [Keeping your actions up to date with Dependabot](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot)
* [GHSA-mrrh-fwg8-r2c3](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3), the `tj-actions/changed-files` advisory (CVE-2025-30066)

### Running in `infra/`: `working-directory`

Every `run:` step starts in the workspace root, but the Terraform code lives in
`infra/`. The working directory can be set on a single step
(`working-directory:`), for a whole job, or for the whole workflow
(`defaults.run.working-directory`). The most specific setting wins. It applies
only to `run:` steps; actions in `uses:` steps decide for themselves where they
work.

**PostHub's choice:** the job-level default, since every command in this job is
a Terraform command in `infra/`. A workflow-level default would be wrong: other
jobs run from the repository root. Terraform's own `-chdir=infra` flag would
also work, but it must be repeated on every command.

Resources to dive deeper into:

* [Workflow syntax: `jobs.<job_id>.defaults.run`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrun)
* [Workflow syntax: `jobs.<job_id>.steps[*].working-directory`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsworking-directory)
* [Terraform: switching working directory with `-chdir`](https://developer.hashicorp.com/terraform/cli/commands#switching-working-directory-with-chdir)

### The three checks

1. **`terraform fmt -check -diff -recursive`** checks that every file follows
   Terraform's canonical style (indentation, aligned `=`, spacing).
   * `-check` changes nothing and exits with a non-zero code if any file needs
     formatting, which fails the step.
   * `-diff` prints the exact change needed in the log.
   * `-recursive` includes subdirectories, which are skipped by default.

   It runs first because it needs no downloads, so a formatting mistake fails in
   seconds. To fix a failure, run `terraform fmt -recursive` in `infra/` and
   commit the result.
2. **`terraform init -backend=false -input=false -lockfile=readonly`** downloads
   the AWS provider, which `validate` needs: the provider's schema defines which
   resources and arguments exist.
   * `-backend=false` skips connecting to where state is stored. `infra/` stores
     state locally today, but if a remote backend such as S3 is added, plain
     `init` would need AWS credentials, which a syntax check should never have.
   * `-input=false` makes Terraform fail instead of waiting for input that no
     one can type.
   * `-lockfile=readonly` makes `init` fail rather than change
     `.terraform.lock.hcl`, so CI only ever uses the provider versions and
     checksums committed in the lock file. To fix a failure, run `terraform init`
     locally (with `-upgrade` after changing a version constraint) and commit
     the lock file.
3. **`terraform validate`** checks that the configuration is consistent with
   itself and with the provider's schema: references point to things that are
   declared, arguments exist, and values have the right types. Each error
   names the file and line, often with a "Did you mean" suggestion.

### What this job does not check

`validate` checks structure, not the real world. It cannot know whether an AMI
exists, whether an S3 bucket name is taken, or whether IAM allows an action.
Those only surface in `terraform plan` or `apply`, which need AWS credentials
and are outside this pipeline while the infrastructure is not deployed.

Resources to dive deeper into:

* [`terraform fmt`](https://developer.hashicorp.com/terraform/cli/commands/fmt)
* [Terraform style guide](https://developer.hashicorp.com/terraform/language/style)
* [`terraform init`](https://developer.hashicorp.com/terraform/cli/commands/init)
* [Dependency lock file](https://developer.hashicorp.com/terraform/language/files/dependency-lock)
* [`terraform validate`](https://developer.hashicorp.com/terraform/cli/commands/validate)
