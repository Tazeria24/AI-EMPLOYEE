# Branch protection

A workflow cannot protect its own branch — that is a repository setting. This
directory holds the setting as a file so turning it on is an import rather than
a dozen checkboxes.

## Turning it on

1. GitHub → **Settings → Rules → Rulesets → New ruleset → Import a ruleset**
2. Upload `default-branch.json`
3. Save.

The three required check names must match the job names in
`.github/workflows/ci.yml` exactly. They do today:

| Ruleset context | Workflow job |
| --- | --- |
| `Types, lint, tests, build` | `checks` |
| `Migrations and isolation suites` | `database` |
| `Dependency audit` | `audit` |

**If you rename a job in the workflow, rename it here too.** A required check
that no longer matches any job never reports, and GitHub treats a check that
never reports as pending forever — the branch becomes unmergeable rather than
unprotected. That failure looks like a stuck PR, not a misconfiguration.

## What it does, and why each part

- **`deletion` / `non_fast_forward`** — the default branch cannot be deleted or
  force-pushed. These are the two irreversible ones.
- **`pull_request`** — changes arrive through a PR, so CI has something to run
  against before a merge.
- **`required_status_checks`** with `strict_required_status_checks_policy` —
  all three CI jobs must pass, **and** the branch must be up to date with the
  base first. Without `strict`, two PRs that each pass alone can merge into a
  combination that does not.

## Why zero required approvals

GitHub does not let you approve your own pull request. On a solo-owner
repository, requiring one approval makes every PR unmergeable by the only
person who can merge it. The PR requirement plus passing checks is the gate
here; raise `required_approving_review_count` to 1 the day a second person can
review.

## Bypass

No bypass actors are configured, so the rules apply to everyone including the
owner. If you need an emergency merge, edit the ruleset — deliberately a
visible act rather than a silent one. To make it routine instead, add
**Repository admin** as a bypass actor in the ruleset UI.
