# Release automation with npm trusted publishing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@nat-ui/cli` from CI using GitHub's OIDC identity, so releasing is a merge rather than an interactive session at someone's terminal.

**Architecture:** A single workflow on pushes to `main` does two jobs depending on whether changesets are pending. With changesets present, `changesets/action` opens a "Version Packages" PR. With none present, the workflow packs the tarball with `pnpm` and publishes it with `npm`, which performs the OIDC exchange. The two tools are split deliberately: only pnpm resolves this repo's `catalog:`/`workspace:*` specifiers, and only npm can exchange an OIDC token for a publish credential.

**Tech Stack:** GitHub Actions, `changesets/action@v2`, `@changesets/cli` 2.31.1, pnpm 10.34.5, npm 11.x, Node 24, TypeScript, Vitest.

Design spec: `docs/superpowers/specs/2026-08-04-release-automation-design.md`.

## Global Constraints

- The workflow file must be exactly `.github/workflows/publish.yml`. npm matches the OIDC token's `workflow_ref` claim against the filename registered on the trust relationship, which is already set to `publish.yml`.
- Publishing requires npm 11. npm 10.9.2 contains zero references to the OIDC exchange endpoint; 11.5.0 has it. Install and assert npm `^11.5.0` in CI.
- The published tarball must be produced by `pnpm pack`, never `npm pack`. `packages/cli/package.json` declares dev dependencies as `catalog:` and `workspace:*`; pnpm resolves them, npm leaves them verbatim.
- Never pass `publish-script` to `changesets/action`. With it, the action runs `changeset publish`, which spawns `pnpm publish` in this repo, and pnpm 10.34.5 cannot perform the OIDC exchange. Without it the action logs "Not publishing because no publish script found" and returns.
- No repository secrets. The default `GITHUB_TOKEN` covers the version PR, the tag, and the release; `id-token: write` covers npm.
- `@nat-ui/cli` is the only publishable package. `@nat-ui/registry` and `@nat-ui/schema` are `private: true`.
- Concurrency is serialized without `cancel-in-progress`.
- Code style (Prettier): no semicolons, single quotes, no bracket spacing, trailing commas, arrow parens always, print width 100, 2-space indent.
- Local imports are extensionless (`from './manifest'`). `moduleResolution` is `bundler` and `verbatimModuleSyntax` is on, so type-only imports must use `import type`.
- Tests are colocated `*.test.ts` files run by Vitest from the repo root. `packages/cli/tsconfig.json` already includes `scripts/**/*.ts`, so new scripts are typechecked and typed-linted.
- Do **not** add a changeset for this work. It changes CI and a dev-only script, not anything the CLI ships. The pending `.changeset/add-command.md` is what will drive the `0.2.0` release.

---

### Task 1: Verify the tarball that actually ships

`packages/cli/scripts/verify-pack.ts` runs `npm pack` and asserts only the _shape_ of the tarball — never the manifest. That is exactly why nobody noticed that `npm pack` leaves `catalog:` and `workspace:*` unresolved. This task points the verifier at the tarball the release actually publishes and teaches it to read the manifest.

Both tarballs have been confirmed to contain identical files with identical modes (`dist/index.js` is `-rwxr-xr-x` under both tools), so every existing assertion survives the switch.

**Files:**

- Create: `packages/cli/scripts/manifest.ts`
- Create: `packages/cli/scripts/manifest.test.ts`
- Modify: `packages/cli/scripts/verify-pack.ts` (full rewrite of the pack/enumerate path)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `findUnresolvedSpecifiers(manifest: unknown): readonly UnresolvedSpecifier[]` and `interface UnresolvedSpecifier {readonly field: string; readonly name: string; readonly specifier: string}` from `packages/cli/scripts/manifest.ts`. No later task consumes these.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/scripts/manifest.test.ts`:

```ts
import {describe, expect, it} from 'vitest'

import {findUnresolvedSpecifiers} from './manifest'

describe('findUnresolvedSpecifiers', () => {
  it('accepts a manifest whose specifiers are all resolved', () => {
    expect(
      findUnresolvedSpecifiers({
        dependencies: {},
        devDependencies: {zod: '^4.4.3', '@nat-ui/schema': '0.0.0'},
      }),
    ).toEqual([])
  })

  it('flags a catalog: specifier', () => {
    expect(findUnresolvedSpecifiers({devDependencies: {zod: 'catalog:'}})).toEqual([
      {field: 'devDependencies', name: 'zod', specifier: 'catalog:'},
    ])
  })

  it('flags a named catalog specifier', () => {
    expect(findUnresolvedSpecifiers({devDependencies: {zod: 'catalog:react19'}})).toEqual([
      {field: 'devDependencies', name: 'zod', specifier: 'catalog:react19'},
    ])
  })

  it('flags a workspace: specifier', () => {
    expect(findUnresolvedSpecifiers({dependencies: {'@nat-ui/schema': 'workspace:*'}})).toEqual([
      {field: 'dependencies', name: '@nat-ui/schema', specifier: 'workspace:*'},
    ])
  })

  it('checks every dependency field, not just runtime dependencies', () => {
    const found = findUnresolvedSpecifiers({
      dependencies: {a: 'catalog:'},
      devDependencies: {b: 'workspace:*'},
      peerDependencies: {c: 'catalog:'},
      optionalDependencies: {d: 'workspace:^'},
    })

    expect(found.map((entry) => entry.field)).toEqual([
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
  })

  it('ignores fields that are absent or not objects, and non-string specifiers', () => {
    expect(findUnresolvedSpecifiers({dependencies: null, devDependencies: {a: 3}})).toEqual([])
  })

  it('tolerates a manifest that is not an object', () => {
    expect(findUnresolvedSpecifiers('not a manifest')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/natiperetz/react-apps/nat-ui && pnpm vitest run packages/cli/scripts/manifest.test.ts`

Expected: FAIL — cannot resolve `./manifest`.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/scripts/manifest.ts`:

```ts
/**
 * pnpm-only dependency protocols. `pnpm pack` resolves these to real ranges;
 * `npm pack` copies them through verbatim, which would publish a manifest
 * whose specifiers no npm client can install. A specifier still carrying one
 * of these prefixes is proof the tarball was built by the wrong tool.
 */
const UNRESOLVED_PREFIXES = ['catalog:', 'workspace:'] as const

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

export interface UnresolvedSpecifier {
  readonly field: string
  readonly name: string
  readonly specifier: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const findUnresolvedSpecifiers = (manifest: unknown): readonly UnresolvedSpecifier[] => {
  if (!isRecord(manifest)) return []

  const found: UnresolvedSpecifier[] = []

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field]
    if (!isRecord(dependencies)) continue

    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== 'string') continue
      if (!UNRESOLVED_PREFIXES.some((prefix) => specifier.startsWith(prefix))) continue

      found.push({field, name, specifier})
    }
  }

  return found
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/cli/scripts/manifest.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Rewrite `verify-pack.ts` to inspect the pnpm tarball**

Replace the entire contents of `packages/cli/scripts/verify-pack.ts` with:

```ts
import {execFile} from 'node:child_process'
import {mkdtemp, readdir, readFile, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

import {findUnresolvedSpecifiers} from './manifest'

// This file is the executable entry point run directly in CI (never
// imported), so side effects and `process.exitCode` are fine here.
//
// It packs with `pnpm`, not `npm`, because that is what the release publishes:
// this repo authors dev dependencies as `catalog:` and `workspace:*`, and only
// pnpm resolves those into installable ranges. Verifying an `npm pack` tarball
// would check a manifest that never ships — a verifier that can be wrong while
// green.
//
// It shells out to `pnpm` and `tar` and assumes a POSIX-ish runner; it is only
// ever run from a single Linux CI job, not across the OS/Node matrix.
const execFileAsync = promisify(execFile)

const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url))
const METAFILE_PATTERN = /^dist\/metafile-.*\.json$/

interface PackedFile {
  readonly path: string
  readonly mode: number
  readonly size: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Read from package.json rather than hardcoded, so this can't drift from the real bin target. */
const readBinPath = async (): Promise<string> => {
  const raw = await readFile(join(PACKAGE_DIR, 'package.json'), 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) throw new Error('Expected package.json to be an object.')

  const {bin} = parsed
  if (!isRecord(bin)) throw new Error('Expected package.json "bin" to be an object.')

  const [target] = Object.values(bin)
  if (typeof target !== 'string') {
    throw new Error('Expected package.json "bin" to map to at least one string path.')
  }

  return target.replace(/^\.\//, '')
}

/**
 * Packs into a directory created empty for the purpose and then reads it back,
 * rather than parsing pnpm's stdout — the output format is not contractual,
 * but "the only tarball in an empty directory" is unambiguous.
 */
const packWithPnpm = async (destination: string): Promise<string> => {
  await execFileAsync('pnpm', ['pack', '--pack-destination', destination], {cwd: PACKAGE_DIR})

  const tarballs = (await readdir(destination)).filter((entry) => entry.endsWith('.tgz'))
  // Destructured rather than indexed: `noUncheckedIndexedAccess` makes
  // `tarballs[0]` possibly-undefined, and a type assertion here would be
  // asserting exactly the thing this check exists to establish.
  const [tarball, ...rest] = tarballs
  if (tarball === undefined || rest.length > 0) {
    throw new Error(
      `Expected exactly one tarball in ${destination}, found ${String(tarballs.length)}.`,
    )
  }

  return tarball
}

/** Enumerate the extracted tree, recording each file's mode so the bin's execute bit can be checked. */
const listPackedFiles = async (root: string): Promise<readonly PackedFile[]> => {
  const files: PackedFile[] = []

  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const absolute = join(directory, entry.name)
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`

      if (entry.isDirectory()) {
        await walk(absolute, relative)
        continue
      }

      const stats = await stat(absolute)
      files.push({path: relative, mode: stats.mode & 0o777, size: stats.size})
    }
  }

  await walk(root, '')

  return files
}

/**
 * This is a *shape* check, not a full manifest: everything under `dist/`
 * other than a metafile is accepted, since tsup names its chunk files with a
 * content hash that changes with the code, making a hardcoded list of them
 * impractical to keep in sync. So a stray non-metafile artifact injected into
 * `dist/` by some future build change would slip past this — only a bug in
 * package.json's `files` field that leaks a file from *outside* `dist/`, or a
 * metafile leaking from inside it, is what this actually catches.
 */
const isExpectedPath = (path: string): boolean =>
  path === 'package.json' ||
  path === 'LICENSE' ||
  path === 'THIRD_PARTY_NOTICES' ||
  (path.startsWith('dist/') && !METAFILE_PATTERN.test(path))

const main = async (): Promise<void> => {
  const binPath = await readBinPath()
  const workDir = await mkdtemp(join(tmpdir(), 'nat-ui-verify-pack-'))
  const issues: string[] = []

  try {
    const filename = await packWithPnpm(workDir)
    await execFileAsync('tar', ['-xzf', filename, '-C', workDir], {cwd: workDir})

    // npm and pnpm both wrap a tarball's contents in a top-level "package/".
    const packageRoot = join(workDir, 'package')
    const files = await listPackedFiles(packageRoot)
    const byPath = new Map(files.map((file) => [file.path, file] as const))

    const bin = byPath.get(binPath)
    if (bin === undefined) {
      issues.push(
        `Executable "${binPath}" (from package.json "bin") is missing from the packed tarball.`,
      )
    } else {
      if ((bin.mode & 0o111) === 0) {
        issues.push(
          `Executable "${binPath}" is packed without any execute bit (mode ${bin.mode.toString(8)}).`,
        )
      }

      const contents = await readFile(join(packageRoot, binPath), 'utf8')
      if (!contents.startsWith('#!')) {
        issues.push(
          `Executable "${binPath}" is packed without a shebang line (the build likely stripped it).`,
        )
      }
    }

    if (!byPath.has('THIRD_PARTY_NOTICES')) {
      issues.push('THIRD_PARTY_NOTICES is missing from the packed tarball.')
    }

    for (const file of files) {
      if (isExpectedPath(file.path)) continue

      issues.push(
        METAFILE_PATTERN.test(file.path)
          ? `Internal build artifact "${file.path}" leaked into the packed tarball (should be excluded by package.json "files").`
          : `Unexpected file "${file.path}" is included in the packed tarball (not covered by package.json "files").`,
      )
    }

    const manifest: unknown = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    for (const {field, name, specifier} of findUnresolvedSpecifiers(manifest)) {
      issues.push(
        `Dependency "${name}" in "${field}" is packed as "${specifier}", which no npm client can ` +
          'install. The tarball was built by a tool that does not resolve pnpm protocols.',
      )
    }

    if (issues.length > 0) {
      console.error('Packed tarball for @nat-ui/cli failed verification:\n')
      for (const issue of issues) console.error(`  - ${issue}`)
      console.error(`\nFull packed file list (${String(files.length)} entries):`)
      for (const file of files) {
        console.error(`  ${file.path} (mode ${file.mode.toString(8)}, ${String(file.size)}b)`)
      }
      process.exitCode = 1

      return
    }

    console.log(
      `Verified packed tarball shape and manifest for @nat-ui/cli (${String(files.length)} files; ` +
        `contents of dist/ are not individually enumerated).`,
    )
  } finally {
    await rm(workDir, {recursive: true, force: true})
  }
}

await main()
```

- [ ] **Step 6: Run the verifier against the real package**

Run: `pnpm build && pnpm --filter @nat-ui/cli --fail-if-no-match run verify-pack`

Expected: exit 0, printing `Verified packed tarball shape and manifest for @nat-ui/cli (8 files; ...)`.

- [ ] **Step 7: Prove the new guard actually fires**

The unit tests cover the detection logic; this confirms it is wired into the script. Temporarily make the manifest unresolvable by hand:

```bash
cd /Users/natiperetz/react-apps/nat-ui
cp packages/cli/package.json /tmp/cli-package.json.bak
node -e "const fs=require('fs');const p='packages/cli/package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.dependencies={'@nat-ui/schema':'workspace:*'};fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
pnpm --filter @nat-ui/cli run verify-pack; echo "exit: $?"
cp /tmp/cli-package.json.bak packages/cli/package.json
```

Expected: exit 1, with an issue naming `@nat-ui/schema` in `dependencies` packed as `workspace:*`.

Then confirm the restore is clean: `git diff --exit-code -- packages/cli/package.json` exits 0.

Note: pnpm resolves `workspace:*` in `dependencies` too, so if this step _passes_ verification instead of failing, the guard is not wired up — investigate rather than moving on.

- [ ] **Step 8: Run the full check suite**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/scripts/manifest.ts packages/cli/scripts/manifest.test.ts packages/cli/scripts/verify-pack.ts
git commit -m "$(cat <<'EOF'
test(cli): verify the tarball that actually ships

verify-pack packed with npm while releases pack with pnpm, so it validated a
manifest that never shipped. npm leaves this repo's catalog:/workspace:*
specifiers verbatim; pnpm resolves them. Pack with pnpm and assert no
unresolved specifier survives into the published manifest.
EOF
)"
```

---

### Task 2: The publish gate

Most pushes to `main` carry no changesets, so every one of them reaches the publish phase. Without a gate each would run `npm publish` for an already-published version and fail, turning `main` red for ordinary commits and making a real release failure indistinguishable from noise.

The gate reports the current version and whether the registry already has it, in `key=value` lines the workflow appends straight to `$GITHUB_OUTPUT`.

**Files:**

- Create: `packages/cli/scripts/registry-versions.ts`
- Create: `packages/cli/scripts/registry-versions.test.ts`
- Create: `packages/cli/scripts/is-published.ts`
- Modify: `packages/cli/package.json` (add the `is-published` script)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `hasVersion(document: unknown, version: string): boolean` from `packages/cli/scripts/registry-versions.ts`. Task 3 consumes the executable `packages/cli/scripts/is-published.ts` through the package script `is-published`, whose stdout is exactly two lines: `version=<version>` then `published=<true|false>`.

The pure function lives in its own module because `is-published.ts` performs a network request at import time; a test importing it would hit the network.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/scripts/registry-versions.test.ts`:

```ts
import {describe, expect, it} from 'vitest'

import {hasVersion} from './registry-versions'

describe('hasVersion', () => {
  it('finds a version the registry lists', () => {
    expect(hasVersion({versions: {'0.1.0': {}, '0.2.0': {}}}, '0.2.0')).toBe(true)
  })

  it('does not find a version the registry has never seen', () => {
    expect(hasVersion({versions: {'0.1.0': {}}}, '0.2.0')).toBe(false)
  })

  it('treats a document without a versions map as having no versions', () => {
    expect(hasVersion({}, '0.2.0')).toBe(false)
    expect(hasVersion({versions: null}, '0.2.0')).toBe(false)
  })

  it('tolerates a document that is not an object', () => {
    expect(hasVersion('not a document', '0.2.0')).toBe(false)
  })

  it('does not confuse inherited object properties for published versions', () => {
    // A naive `version in versions` check would report `true` here, which
    // would silently skip a real release.
    expect(hasVersion({versions: {}}, 'constructor')).toBe(false)
    expect(hasVersion({versions: {}}, 'toString')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/cli/scripts/registry-versions.test.ts`

Expected: FAIL — cannot resolve `./registry-versions`.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/scripts/registry-versions.ts`:

```ts
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Whether a registry package document already lists an exact version.
 *
 * Uses `Object.hasOwn` rather than `in`: the registry document is parsed JSON,
 * and `'constructor' in versions` is true for every object. Reporting a
 * version as published when it is not would silently skip a real release.
 */
export const hasVersion = (document: unknown, version: string): boolean => {
  if (!isRecord(document)) return false

  const {versions} = document
  if (!isRecord(versions)) return false

  return Object.hasOwn(versions, version)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/cli/scripts/registry-versions.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the executable gate**

Create `packages/cli/scripts/is-published.ts`:

```ts
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import {hasVersion} from './registry-versions'

// Executable entry point for CI (never imported): it prints `key=value` lines
// the workflow appends directly to `$GITHUB_OUTPUT`.
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))
const REGISTRY = 'https://registry.npmjs.org'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const main = async (): Promise<void> => {
  const parsed: unknown = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'))
  if (!isRecord(parsed)) throw new Error('Expected package.json to be an object.')

  const {name, version} = parsed
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new Error('Expected package.json to declare a string "name" and "version".')
  }

  const response = await fetch(`${REGISTRY}/${name}`)

  // A package with no published versions at all answers 404. That is "nothing
  // published yet", not a failure.
  if (response.status === 404) {
    process.stdout.write(`version=${version}\npublished=false\n`)

    return
  }

  // Any other failure leaves the answer genuinely unknown, so refuse to guess.
  // Guessing "not published" attempts a duplicate publish; guessing
  // "published" silently skips a real release.
  if (!response.ok) {
    throw new Error(
      `Could not read ${name} from ${REGISTRY} (HTTP ${String(response.status)}), so whether ` +
        `${version} is already published is unknown.`,
    )
  }

  const document: unknown = await response.json()
  process.stdout.write(`version=${version}\npublished=${String(hasVersion(document, version))}\n`)
}

await main()
```

- [ ] **Step 6: Register the script**

In `packages/cli/package.json`, add to `scripts` (keeping keys alphabetical, so between `dev` and `start`):

```json
    "is-published": "tsx scripts/is-published.ts",
```

- [ ] **Step 7: Verify the gate against the live registry**

`0.1.0` is published and `0.2.0` is not, so the current version must report `true`:

```bash
cd /Users/natiperetz/react-apps/nat-ui
pnpm --silent --filter @nat-ui/cli run is-published
```

Expected: exactly two lines, no other output:

```
version=0.1.0
published=true
```

If anything else appears on stdout, the workflow in Task 3 would write junk into `$GITHUB_OUTPUT` — fix that before continuing.

- [ ] **Step 8: Run the full check suite**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/scripts/registry-versions.ts packages/cli/scripts/registry-versions.test.ts packages/cli/scripts/is-published.ts packages/cli/package.json
git commit -m "$(cat <<'EOF'
feat(cli): add a publish gate that asks the registry what exists

Most pushes to main carry no changesets and so reach the publish step. Without
a gate each would attempt to republish an existing version and fail, making
main red for ordinary commits.
EOF
)"
```

---

### Task 3: The publish workflow

**Files:**

- Create: `.github/workflows/publish.yml`

**Interfaces:**

- Consumes: the `is-published` package script from Task 2 (stdout: `version=…` and `published=…`), and the `verify-pack` script hardened in Task 1.
- Produces: nothing consumed by later tasks.

Follow `.github/workflows/ci.yml` conventions: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/publish.yml`:

```yaml
# The filename is load-bearing. npm matches the OIDC token's `workflow_ref`
# claim against the workflow filename registered on the package's trust
# relationship, which is set to `publish.yml`. Renaming this file without
# updating that setting silently breaks publishing.
name: Publish

on:
  push:
    branches: [main]

# Serialized, and deliberately without `cancel-in-progress` (unlike ci.yml):
# cancelling a run mid-publish is the one failure this workflow must not invent
# for itself.
concurrency:
  group: publish

permissions:
  # Push the version PR branch, and tag the published commit.
  contents: write
  # Open the "Version Packages" pull request.
  pull-requests: write
  # Mint the OIDC token npm exchanges for a short-lived publish credential.
  # This is what replaces a stored npm token.
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      # Credentials are persisted here, unlike ci.yml: this workflow pushes the
      # version branch and the release tag.
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6

      # No dependency cache: npm's guidance is to avoid caching in release
      # builds, and a release runs rarely enough that the cache buys nothing.
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'

      # The OIDC exchange lives in npm 11 — npm 10 has no exchange endpoint at
      # all. Node 24 bundles npm 11 today, but that pairing is not contractual,
      # so pin it and assert, rather than meeting a stale npm as a confusing
      # authentication error at publish time.
      - name: Install and verify npm 11
        run: |
          npm install --global npm@^11.5.0
          installed="$(npm --version)"
          echo "npm $installed"
          INSTALLED="$installed" node -e '
            const version = process.env.INSTALLED ?? ""
            const [major, minor] = version.split(".").map(Number)
            if (!(major > 11 || (major === 11 && minor >= 5))) {
              console.error(`npm ${version} cannot perform the OIDC token exchange; 11.5.0 or newer is required.`)
              process.exit(1)
            }
          '

      - run: pnpm install --frozen-lockfile

      # Deliberately no `publish-script`. With one, the action runs
      # `changeset publish`, which spawns `pnpm publish` in this repo because
      # `packageManager` names pnpm — and pnpm 10 cannot perform npm's OIDC
      # exchange. Without one, the action only ever opens the version PR.
      - name: Open or update the Version Packages PR
        id: changesets
        uses: changesets/action@v2
        with:
          version-script: pnpm version-packages
          create-github-releases: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Writes `version=` and `published=` straight to the step outputs.
      - name: Decide whether to publish
        id: gate
        if: steps.changesets.outputs.has-changesets == 'false'
        run: pnpm --silent --filter @nat-ui/cli run is-published >> "$GITHUB_OUTPUT"

      # ci.yml already covers main, but this guarantees the artifact sent to npm
      # was built from a tree that compiled, type-checked, passed its tests, and
      # packed correctly. It only runs on the handful of commits that publish.
      - name: Verify before publishing
        if: steps.gate.outputs.published == 'false'
        run: |
          pnpm build
          pnpm typecheck
          pnpm test
          pnpm --filter @nat-ui/cli --fail-if-no-match run verify-pack

      # pnpm packs, npm publishes. Only pnpm resolves the `catalog:` and
      # `workspace:*` specifiers this repo authors, and only npm can exchange
      # the OIDC token for a publish credential.
      - name: Pack the tarball with pnpm
        if: steps.gate.outputs.published == 'false'
        run: |
          rm -rf "$RUNNER_TEMP/release"
          mkdir -p "$RUNNER_TEMP/release"
          pnpm pack --pack-destination "$RUNNER_TEMP/release"
        working-directory: packages/cli

      # Provenance is automatic for a public package published this way, so the
      # flag is redundant — it is passed so that a failure to attest is loud
      # rather than a silently missing attestation.
      - name: Publish to npm
        if: steps.gate.outputs.published == 'false'
        run: |
          tarball="$(find "$RUNNER_TEMP/release" -maxdepth 1 -name '*.tgz')"
          test -n "$tarball"
          npm publish "$tarball" --provenance

      # The action creates tags only when it publishes, and it is not publishing
      # here, so the tag and release are made explicitly. The tag format matches
      # what changesets produced for 0.1.0.
      - name: Tag and release
        if: steps.gate.outputs.published == 'false'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: '@nat-ui/cli@${{ steps.gate.outputs.version }}'
        run: |
          git tag "$TAG"
          git push origin "$TAG"
          gh release create "$TAG" --title "$TAG" --generate-notes
```

- [ ] **Step 2: Validate the YAML parses**

Prettier parses YAML, so it doubles as the syntax check — a malformed file fails
with a parse error rather than a formatting complaint. There is no `actionlint`
or standalone YAML CLI available here; do not reach for one.

Run: `cd /Users/natiperetz/react-apps/nat-ui && npx prettier --write .github/workflows/publish.yml`

Expected: the file is listed with a timing, and no parse error. If it reports a
syntax error, fix the YAML before continuing.

- [ ] **Step 3: Check it against the constraints**

Confirm by reading the file, since none of these can be caught by a linter:

- The filename is exactly `.github/workflows/publish.yml`.
- There is no `publish-script:` input anywhere.
- `id-token: write` is present.
- `concurrency` has no `cancel-in-progress`.
- Packing uses `pnpm pack`; publishing uses `npm publish`.
- No `secrets.` reference other than `secrets.GITHUB_TOKEN`.

Run: `rg -n "publish-script|cancel-in-progress|npm pack|secrets\." .github/workflows/publish.yml`

Expected: only two `secrets.GITHUB_TOKEN` matches, nothing else.

- [ ] **Step 4: Run format and lint**

Run: `pnpm format && pnpm format:check && pnpm lint`

Expected: all green (Prettier formats YAML too, so run `format` before `format:check`).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "$(cat <<'EOF'
ci: publish from GitHub Actions with npm trusted publishing

Opens a Version Packages PR when changesets are pending, and publishes when
none remain. pnpm packs the tarball because only it resolves this repo's
catalog:/workspace:* specifiers; npm publishes it because only it can exchange
an OIDC token for a publish credential. No npm token is stored.
EOF
)"
```

---

### Task 4: Close the local publish path and document releasing

`pnpm release` currently runs `pnpm build && changeset publish`. Left in place it is a loaded gun: it publishes through `pnpm publish` with whatever credential happens to be on the machine, producing a version with no provenance. Because pnpm can enforce that a package's trust level never regresses, that would be a visible downgrade for anyone who opted into `--trust-policy no-downgrade`.

**Files:**

- Modify: `package.json` (replace the `release` script)
- Modify: `README.md` (add a `## Releasing` section between `## Development` and `## License`)

**Interfaces:**

- Consumes: the workflow from Task 3, by name only.
- Produces: nothing.

- [ ] **Step 1: Replace the `release` script**

In `package.json`, replace this line:

```json
    "release": "pnpm build && changeset publish"
```

with:

```json
    "release": "node -e \"console.error('Releases run in CI via .github/workflows/publish.yml. Publishing from a laptop bypasses npm trusted publishing and would ship a version with no provenance.'); process.exit(1)\""
```

Keep `"version-packages": "changeset version"` as it is — the workflow calls it.

- [ ] **Step 2: Verify the guard fires**

Run: `cd /Users/natiperetz/react-apps/nat-ui && pnpm release; echo "exit: $?"`

Expected: the message above on stderr, and `exit: 1`.

- [ ] **Step 3: Document the release process**

In `README.md`, insert a new section immediately before `## License`:

```markdown
## Releasing

Releases are automated and run in CI; there is no local publish path.

1. Describe user-visible changes in a changeset: `pnpm changeset`. Commit it
   with the work it describes.
2. When that merges to `main`, the publish workflow opens a **Version Packages**
   pull request that bumps the version and writes the changelog.
3. Merging that pull request publishes `@nat-ui/cli` to npm, tags the commit,
   and creates a GitHub release.

Publishing authenticates with GitHub's OIDC identity through npm's trusted
publishing, so no npm token is stored in this repository, and every published
version carries a provenance attestation. The workflow filename
(`.github/workflows/publish.yml`) is registered on the package's npm trust
relationship and cannot be changed without updating that setting.
```

- [ ] **Step 4: Run format, lint, and the full suite**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "$(cat <<'EOF'
chore: close the local publish path and document releasing

`pnpm release` published through pnpm with whatever credential was on the
machine, producing a version with no provenance — a trust-level downgrade for
anyone enforcing no-downgrade. Replace it with a guard pointing at CI.
EOF
)"
```

---

### Task 5: Full verification and the first automated release

**Files:** none — this task verifies and then operates.

- [ ] **Step 1: Run the whole pipeline exactly as CI does**

```bash
cd /Users/natiperetz/react-apps/nat-ui
pnpm build && git diff --exit-code -- r && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @nat-ui/cli --fail-if-no-match run verify-pack
```

Expected: every command exits 0. The `git diff -- r` check must stay clean — this branch changes no components.

- [ ] **Step 2: Confirm no changeset was added for this work**

Run: `ls .changeset/*.md | grep -v README`

Expected: only `.changeset/add-command.md`. This branch is CI and tooling; the pending changeset is what drives `0.2.0`.

- [ ] **Step 3: Push and open the pull request**

```bash
git push -u origin feat/release-automation
gh pr create --title "Publish from CI with npm trusted publishing" --body "$(cat <<'EOF'
## Summary

Releases `@nat-ui/cli` from GitHub Actions, authenticated by GitHub's OIDC
identity through npm trusted publishing. No npm token is stored in this
repository, and every published version will carry a provenance attestation
(`0.1.0`, published by hand, has none).

`pnpm` packs the tarball and `npm` publishes it. That split is deliberate: this
repo authors dev dependencies as `catalog:` and `workspace:*`, which only pnpm
resolves, while only npm can exchange an OIDC token for a publish credential.
`changeset publish` cannot be used because it spawns `pnpm publish` in this
repo, and pnpm 10 has no OIDC support at all.

Also hardens `verify-pack`, which packed with npm while releases pack with
pnpm — so it was validating a manifest that never shipped. It now checks the
tarball that actually gets published and fails on any unresolved specifier.

## Notes for review

- The workflow filename `publish.yml` is registered on the package's npm trust
  relationship and cannot be renamed without updating that setting.
- `publish.yml` only triggers on pushes to `main`, so it does not run on this PR.
- Merging this is expected to immediately open a **Version Packages** PR for
  `0.2.0`, from the changeset already on `main`. That PR will have no CI checks,
  which is expected: GitHub does not trigger workflows for events created with
  the default `GITHUB_TOKEN`, and we deliberately did not add a PAT to work
  around it.
- `pnpm release` no longer publishes; it fails with a pointer to the workflow.

## Test plan

- [ ] `verify` and `pack-integrity` pass on this PR
- [ ] Merging opens a Version Packages PR for `0.2.0` and publishes nothing
- [ ] Merging that PR publishes `0.2.0` with a provenance attestation
- [ ] `npx @nat-ui/cli@0.2.0` init/add works in a clean project and compiles
EOF
)"
```

- [ ] **Step 4: Wait for CI, then merge**

Expected: `verify` (three matrix jobs) and `pack-integrity` pass. `publish.yml` does **not** run on the pull request — it triggers only on pushes to `main`.

- [ ] **Step 5: Confirm the first workflow run opens the version PR**

After merging, watch the run: `gh run list --workflow publish.yml --limit 3`

Expected: one run, succeeding, whose changesets step reports pending changesets and opens a **Version Packages** PR bumping `@nat-ui/cli` to `0.2.0`. Nothing is published in this run. Confirm the gate, verify, pack, publish, and tag steps were all skipped.

The version PR will arrive without CI checks, which is expected and documented in the spec.

- [ ] **Step 6: Merge the version PR to publish**

Expected, in the second run: the gate reports `published=false`, the verification steps pass, `npm publish` succeeds, and the tag `@nat-ui/cli@0.2.0` plus a GitHub release appear.

If `npm publish` fails on authentication, the trust relationship needs re-saving now that `publish.yml` exists on `main`; re-run the job afterwards. Nothing will have been published, so a re-run is safe.

- [ ] **Step 7: Verify the published artifact is what it should be**

```bash
curl -s https://registry.npmjs.org/@nat-ui/cli/0.2.0 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('version:',j.version);console.log('devDependencies:',JSON.stringify(j.devDependencies));console.log('attestations:',j.dist.attestations?'PRESENT':'MISSING')})"
```

Expected: `0.2.0`, dev dependencies showing resolved ranges (`^4.4.3`, not `catalog:`), and `attestations: PRESENT`. `0.1.0` has none, so this is the observable difference that proves trusted publishing worked.

- [ ] **Step 8: Smoke-test the published package**

```bash
cd /tmp && rm -rf natui-smoke && mkdir natui-smoke && cd natui-smoke
npm init -y >/dev/null && npm install --silent react@19 react-dom@19 typescript @types/react @types/node >/dev/null
mkdir -p src/app && printf "@import 'tailwindcss';\n" > src/app/globals.css
printf '{"compilerOptions":{"target":"ES2022","lib":["dom","esnext"],"jsx":"react-jsx","module":"esnext","moduleResolution":"bundler","strict":true,"noEmit":true,"skipLibCheck":true,"paths":{"@/*":["./src/*"]}},"include":["src/**/*.ts","src/**/*.tsx"]}\n' > tsconfig.json
npx --yes @nat-ui/cli@0.2.0 init --yes
npx --yes @nat-ui/cli@0.2.0 add dialog
./node_modules/.bin/tsc --noEmit && echo "compiles clean"
cd /tmp && rm -rf natui-smoke
```

Expected: `init` writes `components.json`, `src/lib/utils.ts`, and the theme block; `add dialog` writes `button.tsx` and `dialog.tsx` under `src/components/ui/`; `tsc` exits 0.

This runs the real published tarball fetched from npm, against the default registry, with no local build involved.

- [ ] **Step 9: Confirm the gate holds on an ordinary push**

On the next non-release push to `main`, check `gh run list --workflow publish.yml --limit 1`.

Expected: the run succeeds with the gate reporting `published=true` and every publish step skipped. A red run here means the gate is broken.

- [ ] **Step 10: Revoke the npm token used for `0.1.0`**

Only once a trusted publish has succeeded. It is a standing credential with nothing left to do, and leaving it is the largest remaining risk in the release path.
