# Theme Token Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible to ship a component that references a theme token a shadcn project does not define, without noticing.

**Tech Stack:** TypeScript, Vitest, GitHub Actions, Tailwind v4, Next.js 16.

## The debt this pays

Every component page tells the reader that the shadcn install route needs no extra setup, because `shadcn init` writes both the `cn` helper and the theme tokens. That claim is currently true, and nothing keeps it true.

It was false once already. The `destructive` button variant used `text-destructive-foreground`, which nat-ui's own theme defines and shadcn's does not, so a shadcn user got near-black text on a red button. It was found by reading, not by tooling, and fixed by switching to `text-white`.

The failure mode is what makes this worth guarding. A missing custom property is not an error in CSS — `color: var(--destructive-foreground)` with nothing defining it simply produces no colour. Nothing fails, nothing warns, the build is green, and the damage appears only in a stranger's project.

## The approach, and why it changed

The earlier note in `2026-08-07-reach-and-add-all.md` proposed collecting the `--` properties referenced by each `*-variants.tsx` and comparing them against a captured list of shadcn's default `:root` tokens.

Do not build that. It requires knowing how every Tailwind utility maps to a custom property — a mapping Tailwind owns and can change — and it requires a snapshot of shadcn's theme that silently goes stale.

Build this instead: `smoke-shadcn` already scaffolds a Next app, runs shadcn's own `init`, installs `button` from the `/s/` registry, and builds it. That build produces the real compiled CSS for a real shadcn project with nat-ui components in it. **Every custom property that CSS references but never defines is exactly the bug.** No mapping table, no snapshot, and it stays correct when Tailwind changes how utilities compile or when shadcn changes its theme.

## Global Constraints

- Prettier: `semi: false`, `singleQuote: true`, `bracketSpacing: false`, `trailingComma: "all"`, `arrowParens: "always"`, `printWidth: 100`, `tabWidth: 2`. Write code in this style directly.
- Nothing in this plan changes `r/` or `s/`, or any component source. `git diff --exit-code -- r s` must be empty.
- Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` before committing. **Never pipe a gate command into `tail` or `head` when you are checking whether it passed** — the pipeline reports `tail`'s exit status, not the gate's, which has already caused one bad commit in this repository.

---

### Task 1: The analysis, as a tested pure function

**Files:**

- Create: `packages/registry/scripts/css-custom-properties.ts`
- Create: `packages/registry/scripts/css-custom-properties.test.ts`

**Interfaces:**

- Produces: `undefinedCustomProperties(css: string): readonly string[]` — every custom property the stylesheet reads but never defines, sorted, deduplicated.

**What counts as defined.** A property is defined if the stylesheet contains a declaration `--name:` anywhere, or registers it with `@property --name`. Tailwind v4 registers its internal `--tw-*` properties through `@property`, so both forms are required or the guard drowns in false positives.

**What counts as referenced.** A `var(--name)` with no fallback. **`var(--name, something)` does not count** — a fallback is an explicit statement that absence is expected and handled. This matters immediately: `button-variants.tsx` uses `scale-[var(--press-scale,0.96)]`, and `--press-scale` is written inline per element by `pressStyle` rather than in any stylesheet. Treating that as a defect would make the guard cry wolf on correct code.

- [ ] **Step 1: Write the failing tests**

Create `packages/registry/scripts/css-custom-properties.test.ts`:

```ts
import {describe, expect, test} from 'vitest'
import {undefinedCustomProperties} from './css-custom-properties'

describe('undefinedCustomProperties', () => {
  test('finds a property that is read but never defined', () => {
    expect(undefinedCustomProperties('.a{color:var(--ghost)}')).toEqual(['--ghost'])
  })

  test('accepts a property defined anywhere in the sheet', () => {
    expect(undefinedCustomProperties(':root{--brand:red}.a{color:var(--brand)}')).toEqual([])
  })

  test('accepts a property registered with @property, as Tailwind registers its own', () => {
    const css = '@property --tw-shadow{syntax:"*";inherits:false}.a{box-shadow:var(--tw-shadow)}'

    expect(undefinedCustomProperties(css)).toEqual([])
  })

  test('ignores a reference that supplies a fallback', () => {
    // `scale-[var(--press-scale,0.96)]` is correct code: `pressStyle` sets the
    // property inline per element, and the fallback is the deliberate default.
    expect(undefinedCustomProperties('.a{scale:var(--press-scale,0.96)}')).toEqual([])
  })

  test('reports each missing property once, sorted', () => {
    const css = '.a{color:var(--b)}.c{color:var(--a)}.d{background:var(--b)}'

    expect(undefinedCustomProperties(css)).toEqual(['--a', '--b'])
  })

  test('tolerates the whitespace a minifier leaves behind', () => {
    expect(undefinedCustomProperties('.a{color:var( --ghost )}')).toEqual(['--ghost'])
  })

  test('is not fooled by a property name appearing inside a string', () => {
    expect(undefinedCustomProperties('.a{content:"--ghost"}')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/registry/scripts/css-custom-properties.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement it**

Create `packages/registry/scripts/css-custom-properties.ts`. Regular expressions are adequate and appropriate here — this reads compiled output looking for two specific shapes, and adding a CSS parser dependency to inspect a build artifact would be a poor trade.

Write a file-level comment explaining what the function is for, because a reader who finds it without context will not guess: a custom property that is read but never defined is silent in CSS, and this is the only thing that makes it loud.

Requirements:

- Definitions: `--name:` in a declaration, and `@property --name`.
- References: `var(--name)` where no comma follows the name before the closing parenthesis.
- Return sorted, deduplicated names, each including the leading `--`.
- Do not report a name that is both referenced and defined, regardless of order in the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/registry/scripts/css-custom-properties.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/registry/scripts/css-custom-properties.ts packages/registry/scripts/css-custom-properties.test.ts
git commit -m "feat(registry): find custom properties a stylesheet reads but never defines"
```

---

### Task 2: The executable that runs it over a built app

**Files:**

- Create: `packages/registry/scripts/verify-theme-tokens.ts`
- Modify: `packages/registry/package.json` — add a `verify-theme-tokens` script

**Interfaces:**

- Consumes: `undefinedCustomProperties` from Task 1.
- Invoked as: `pnpm --filter @nat-ui/registry verify-theme-tokens <directory>`, where the directory is searched recursively for `.css` files.

- [ ] **Step 1: Read the existing pattern**

Read `packages/cli/scripts/verify-pack.ts` first. It is the closest thing in this repository to what you are writing — an executable run only by CI, which collects issues, prints them all with enough context to act on, and sets `process.exitCode`. Match its structure and its comment style rather than inventing a new shape.

- [ ] **Step 2: Write it**

Behaviour:

- Take one argument, a directory. Exit non-zero with a clear message if it is missing or does not exist.
- Find every `.css` file beneath it, recursively.
- **Concatenate them and analyse the whole as one stylesheet, not file by file.** Next splits CSS across chunks, and a property defined in one chunk and read in another is fine in the browser. Analysing per file would report failures that are not real.
- If any property is undefined, print each one, print which files referenced it, and set `process.exitCode = 1`.
- On success, print how many files and how many distinct properties were checked. A guard that prints nothing is indistinguishable from a guard that did nothing — and the failure mode here, finding no CSS at all and passing, is exactly what would make this useless.
- **Exit non-zero if no `.css` files were found.** That is not a pass; it means the guard was pointed somewhere wrong.

- [ ] **Step 3: Prove it fails when it should**

The guard must be shown to catch the original bug. Construct the failure directly:

```bash
mkdir -p /tmp/token-guard-check
printf ':root{--primary:#000}.a{color:var(--primary)}.b{color:var(--destructive-foreground)}' > /tmp/token-guard-check/app.css
pnpm --filter @nat-ui/registry verify-theme-tokens /tmp/token-guard-check
echo "exit: $?"
```

Expected: exit 1, naming `--destructive-foreground` and the file. This is the exact class of bug the button shipped with.

Then confirm the empty-directory case:

```bash
mkdir -p /tmp/token-guard-empty
pnpm --filter @nat-ui/registry verify-theme-tokens /tmp/token-guard-empty
echo "exit: $?"
```

Expected: exit 1, saying no CSS was found.

- [ ] **Step 4: Gate and commit**

```bash
git add packages/registry
git commit -m "feat(registry): fail the build on a theme token nothing defines"
```

---

### Task 3: Rehearse against a real shadcn project

Before wiring this into CI, run the whole thing by hand exactly as CI will. A guard that fails on its first real input is worse than no guard, because the next person disables it.

**Files:** none — this task produces evidence, not code.

- [ ] **Step 1: Reproduce the CI job locally**

Read `.github/workflows/ci.yml`'s `smoke-shadcn` job and follow it step for step: build the registry with `NAT_UI_SHADCN_BASE_URL=http://localhost:8420`, serve `s/`, scaffold the Next app, `shadcn@latest init -b base -p nova --yes`, `shadcn@latest add http://localhost:8420/button.json --yes`, write the `app/page.tsx` the job writes, then `pnpm build` in the consumer.

- [ ] **Step 2: Run the guard over the built CSS**

```bash
pnpm --filter @nat-ui/registry verify-theme-tokens "$CONSUMER/.next"
```

- [ ] **Step 3: Report every property it names, and judge each one**

This is the point of the task. For each property reported, decide which it is:

1. **A real defect** — a token nat-ui references and shadcn does not ship. Do not fix the component here; report it, because that is a finding about the product, not about this guard.
2. **A false positive** — something defined by the browser, by a `@property` form the analyser missed, or supplied at runtime. Fix the analyser, or narrow what the guard scans, and add a test to Task 1 covering it.

Do not add an ignore list to make the output empty. If you find yourself wanting one, the analyser is wrong and the test file is where the fix belongs. An exception is only acceptable if you can name the mechanism that defines the property at runtime and write that reason down.

- [ ] **Step 4: Record the evidence**

Write the full output, and your judgement on each property, into your report. If the guard passed clean on the first run, say so explicitly — that is a meaningful result, not an absence of one.

---

### Task 4: Wire it into CI, and write it down

**Files:**

- Modify: `.github/workflows/ci.yml` — the `smoke-shadcn` job
- Modify: `docs/superpowers/plans/2026-08-07-reach-and-add-all.md` — close out the follow-up note

- [ ] **Step 1: Add the step**

In `smoke-shadcn`, after the consumer's `pnpm build`, add a step running the guard over the consumer's `.next` directory. It runs from the repository checkout, against the consumer app's build output, so mind the working directory — the other steps in that job use `${{ runner.temp }}/consumer` and this one does not.

Comment it the way that job's other steps are commented: say what failure it catches and why that failure is otherwise silent, not what the command does.

- [ ] **Step 2: Confirm the job's page still exercises the variants**

The job's `app/page.tsx` renders one `<Button animation='bouncy'>`. Tailwind v4 scans source files rather than rendered output, so every class in `button-variants.tsx` should compile into the CSS regardless of which variant the page uses. **Verify that is actually happening** — grep the built CSS for a class that only the `destructive` variant produces. If the variants are not being compiled, this guard only covers the default variant and the step needs the page to render all of them.

Report what you found either way.

- [ ] **Step 3: Close the follow-up note**

In `docs/superpowers/plans/2026-08-07-reach-and-add-all.md`, the section "Follow-up this plan deliberately leaves open" describes this debt and proposes the snapshot approach. Rewrite it to record that the debt is paid, what was built instead, and why the snapshot approach was rejected. Leave the description of the risk intact — it is the reason the guard exists and it should stay readable.

- [ ] **Step 4: Full gate**

```bash
pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git diff --exit-code -- r s
```

Check exit codes directly. Do not pipe.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/superpowers/plans
git commit -m "ci: fail when a component reads a theme token shadcn does not define"
```

---

## Notes for the implementer

**No changeset.** Nothing here changes `@nat-ui/cli` or any published file. This is a guard on the repository, invisible to users of the package.

**If Task 3 finds a real defect,** stop and report it rather than fixing the component. A component change alters `r/` and `s/`, which this plan forbids, and it deserves its own commit with its own reasoning about what a user's copy of that component now does.
