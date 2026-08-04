# Automated releases with npm trusted publishing

Date: 2026-08-04
Status: **abandoned.** Built and then removed the same day. The workflow failed
on its first run because opening the version pull request needs a
repository-level setting ("Allow GitHub Actions to create and approve pull
requests") that is off by default and cannot be granted from within a workflow.
Rather than widen that setting, releases went back to being published by hand;
see `## Releasing` in the README. Kept for the findings recorded below, which
outlast the decision — chiefly that `npm pack` leaves this repo's `catalog:`
and `workspace:*` specifiers literal while `pnpm pack` resolves them, and that
pnpm 10 cannot perform npm's OIDC token exchange at all.

## Goal

Release `@nat-ui/cli` from CI, authenticated by GitHub's OIDC identity rather than
a stored npm token, so that publishing is a merge rather than an interactive
ritual at someone's terminal.

`0.1.0` was published by hand. That took several attempts: a token predating 2FA,
confusion over which 2FA mode was active, and finally an interactive passkey
challenge in a browser. None of that is repeatable, none of it is auditable, and
it cannot happen while its author is away from their laptop. `0.1.0` also carries
no provenance attestations, which is npm's weakest trust level.

Trusted publishing was not an option for `0.1.0`: npm's OIDC exchange cannot
create a package that does not yet exist. Now that the package exists, it is.

## Scope

In scope:

- A `publish.yml` workflow that opens a version PR and publishes on merge.
- Trusted publishing (OIDC), so no npm token is stored in the repository.
- Provenance attestations on every published version.
- Hardening `verify-pack` against the manifest defect described below.

Out of scope, deliberately:

- Upgrading pnpm to 11.x. See "Why not `changeset publish`" — pnpm 11 would let
  us keep the stock changesets path, but a package-manager major upgrade churns
  the lockfile and the whole CI matrix, which is a large blast radius for
  something incidental to publishing. Worth doing on its own merits, later.
- Publishing `@nat-ui/registry` or `@nat-ui/schema`. Both are `private: true`,
  and the CLI bundles what it needs from `schema`.
- Any change to what the CLI ships. This is about how it gets to npm.

## Two constraints discovered before designing

Both of these invalidate an obvious approach, so they come first.

### Why not `changeset publish`

The natural wiring is `changesets/action` with a publish script calling
`changeset publish`, which the action's own documentation says supports OIDC. In
this repository that would fail.

`getPublishTool` in `@changesets/cli` 2.31.1 detects the package manager and, on
finding pnpm, spawns `pnpm publish` rather than `npm publish`. Detection is by
lockfile and the `packageManager` field, so it cannot be overridden by a flag.

pnpm 10.34.5 cannot perform the OIDC exchange. It contains no reference to
`ACTIONS_ID_TOKEN_REQUEST_URL`, the variable the exchange reads. Its only mention
of trusted publishing is the install-time `--trust-policy no-downgrade` check,
which _consumes_ trust metadata rather than producing it. pnpm 11.20.0 does
implement the exchange — it calls npm's
`/-/npm/v1/oidc/token/exchange/package/` endpoint — which is why upgrading pnpm
is a real alternative rather than a fantasy.

`changesets/action` does not close the gap. Its changelog for PR #545 states the
`.npmrc` generation "only appending the auth token when `NPM_TOKEN` is defined",
so under OIDC it writes no credential at all and leaves the exchange to whichever
client actually publishes. That client is `pnpm publish`, which cannot.

So the design uses the action for versioning only and never gives it a publish
script.

### Why not plain `npm publish`

If npm does the publishing, npm must also do the packing — and it packs this
repository's manifest wrongly.

`packages/cli/package.json` declares its dev dependencies with pnpm-only
specifiers: `catalog:` for most, `workspace:*` for `@nat-ui/schema`. `pnpm pack`
resolves these, which is why `0.1.0` shipped real ranges (`zod` as `^4.4.3`,
`@nat-ui/schema` as `0.0.0`). `npm pack` leaves them literal, so `npm publish`
alone would ship a manifest containing the uninstallable strings `"catalog:"` and
`"workspace:*"`.

This would not break `npm install @nat-ui/cli`, because consumers do not install
dev dependencies. It would still be wrong: a regression against `0.1.0`, garbage
to anything reading the manifest, and invisible until someone looked.

The fix is to let each tool do what only it can. **`pnpm pack` builds the
tarball; `npm publish <tarball>` ships it.** pnpm resolves the specifiers, npm
performs the OIDC exchange. npm 11 accepts a prebuilt tarball together with
`--provenance`; a dry run passes every local validation and stops only at the
registry's refusal to republish an existing version.

This is safe here for a reason worth stating: `@nat-ui/cli` is the only
publishable package in the workspace and has **zero runtime dependencies**
(`schema`, `zod`, `@clack/prompts`, and `jsonc-parser` are all bundled). There is
no dependency graph for the two tools to disagree about.

## The release flow

Two phases, both driven by pushes to `main`.

**Phase one — the version PR.** A push to `main` with pending changesets runs
`changeset version` on a branch and opens a "Version Packages" PR: version bumped
to `0.2.0`, changelog written, changeset file consumed. Nothing is published.

**Phase two — the publish.** Merging that PR pushes to `main` with no changesets
remaining. The same workflow then packs and publishes.

The phases are distinguished by the action's `hasChangesets` output, not by
separate triggers, so there is one workflow and one mental model.

## The workflow

`.github/workflows/publish.yml`, one job, `ubuntu-latest`, on pushes to `main`.

The filename is load-bearing. npm matches the OIDC token's `workflow_ref` claim
against the filename registered on the trust relationship, so the file must be
`publish.yml` exactly — not `release.yml`, and it cannot be renamed later without
updating the npm setting in the same change.

Permissions are the union of what the two phases need: `id-token: write` for the
OIDC exchange, `contents: write` for tags, and `pull-requests: write` for the
version PR. The default `GITHUB_TOKEN` covers all of it; no secret is stored in
the repository, which is the point of publishing this way.

Concurrency is serialized on the workflow, and — unlike `ci.yml` —
**without `cancel-in-progress`**. Cancelling a publish mid-flight is precisely
the failure this project should not invent for itself.

Steps, in order:

1. Check out, set up pnpm and Node 24, `pnpm install --frozen-lockfile`.
2. Install npm 11 explicitly and assert the version. Node 24 bundles npm 11
   today, but the bundled version is not contractual, and npm 10 has no OIDC
   support whatsoever — npm 10.9.2 contains zero references to the exchange
   endpoint, and npm documents 11.5.1 as the floor for trusted publishing. Asserting turns a silently stale npm into a
   clear failure instead of a misleading authentication error.
3. `changesets/action`, given a `version` script and no publish script.
4. Decide whether to publish (below).
5. If publishing: `pnpm build`, `pnpm typecheck`, `pnpm test`, and
   `verify-pack`.
6. `pnpm pack`, then `npm publish <tarball> --provenance`.
7. Create the git tag and the GitHub release. Because the action is not doing
   the publishing, it is not creating these either — the workflow does it
   explicitly, after a successful publish, from the version it just shipped.

Provenance is automatic under trusted publishing for a public package in a public
repository, so `--provenance` is technically redundant. It is passed anyway: it
makes attestation failure loud rather than silently absent, which is the whole
point of publishing this way.

### The publish gate

Most pushes to `main` carry no changesets — a documentation fix, a merge of
unrelated work. Every one of them reaches phase two. Without a gate, each would
run `npm publish` for an already-published version and fail the workflow, so
`main` would show red for ordinary commits and a genuine release failure would be
indistinguishable from noise.

So before publishing, the workflow reads the version from
`packages/cli/package.json`, asks the registry whether that exact version exists,
and skips cleanly when it does. Publishing happens only for a version the
registry has never seen.

The check queries the registry's HTTP endpoint for the package document and looks
for the exact version, rather than shelling out to `npm view`. `npm view` answers
from a cache that can lag a publish by minutes — it reported a 404 for `0.1.0`
immediately after that version went live — and a gate that reports "not
published" for something already published is a gate that publishes twice.

This also makes the workflow idempotent: re-running a failed release is safe,
because a version that made it to npm is never published twice, and one that did
not is retried.

### Why verification runs here too

`ci.yml` already runs the full matrix on `main`, so re-running checks in the
release job duplicates work. It does so only on the commits that actually
publish, which is a handful of commits in the repository's life, and it buys an
absolute guarantee: the artifact pushed to npm was built from a tree that
compiled, type-checked, passed its tests, and packed correctly. Coordinating with
a separate workflow's result via `workflow_run` would be cheaper and considerably
easier to get subtly wrong.

### No stored credential for the version PR

GitHub does not start workflow runs for events created with the default
`GITHUB_TOKEN`, so the Version Packages PR arrives without CI checks. The usual
remedy is a personal access token, and this design deliberately declines it.

Adding a standing, long-lived secret to bypass a safety mechanism would undercut
the reason for adopting OIDC in the first place. Such a token also expires, and
its expiry would surface as a release that mysteriously stops working rather than
as anything self-explanatory.

Declining it is cheap here for three reasons. `main` has no branch protection or
rulesets, so an unchecked PR is not blocked from merging. The PR contains only a
version bump, a generated changelog, and a deleted changeset file — no source
code. And the checks that matter still run: `ci.yml` on the merge commit, and
`build`, `typecheck`, `test`, and `verify-pack` inside the publish job before
anything is sent to npm. The suppression applies only to GitHub Actions runs, so
third-party reviewers such as CodeRabbit still see the PR normally.

If `main` later requires status checks, the answer is `actions/create-github-app-token`,
which mints a short-lived token per run, rather than storing a permanent one.

### Failure modes

Publishing is the last step, after every check has passed. A missing or
misconfigured trust relationship therefore fails with nothing published and no
partial state to reconcile; the fix is a settings change and a re-run. A build or
test failure never reaches the registry at all.

## Hardening `verify-pack`

`packages/cli/scripts/verify-pack.ts` inspects `npm pack` output and asserts the
_shape_ of the tarball: the executable is present and keeps its shebang,
`THIRD_PARTY_NOTICES` is included, no metafile leaks. It never looks at the
manifest, which is exactly why the `catalog:` defect above went unnoticed.

Two changes:

- Assert the packed manifest contains no unresolved `catalog:` or `workspace:`
  specifier in any dependency field. This is the guard that would have caught
  today's finding.
- Pack the way the release packs. The script's own comment claims it reflects
  "exactly what `npm publish` would ship"; with this design the real publish path
  packs with pnpm, and a verifier checking a different tarball than the one that
  ships is a verifier that can be wrong while green.

## Manual setup, which cannot be automated from here

One thing, and it is already done.

**The trust relationship on npm.** `@nat-ui/cli` → Settings → Trusted Publishing
→ GitHub Actions, repository `Natip85/nat-ui`, workflow `publish.yml`. npm
supports trusted publishing only from GitHub-hosted runners, which is what this
workflow uses.

npm's form states the workflow must already exist in `.github/workflows/`. It
does not yet, so if npm rejects or later invalidates the trust relationship, the
fix is to re-save it once `publish.yml` is merged to `main` — not to change any
of the design above.

Once trusted publishing works, the npm token used for `0.1.0` should be revoked.
It is a standing credential with nothing left to do.

## Verification

- A release is genuine only if npm reports attestations for the new version;
  `0.1.0` has none, so the difference is observable rather than assumed.
- After `0.2.0` publishes, install it from the registry in a clean directory and
  run `init` and `add` against the default registry, confirming the published
  artifact behaves as the local build does.
- The publish gate is exercised by ordinary life: the next push to `main` that
  is not a release must leave the workflow green without publishing.

## A consequence worth recording

pnpm can enforce that a package's trust level never regresses
(`--trust-policy no-downgrade`). It is opt-in, so publishing `0.2.0` as a trusted
publish breaks nobody. But a later hand-publish would be a visible downgrade for
anyone who opted in. Choosing this path is a commitment to staying on it.
