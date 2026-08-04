// Publishing locally goes through `pnpm publish`, which cannot perform npm's
// OIDC exchange, so the result carries no provenance attestation. That is a
// trust-level downgrade for anyone installing under `--trust-policy
// no-downgrade`, which is why this is opt-in rather than merely discouraged.
// It stays reachable because a broken workflow or a revoked trust
// relationship must not leave the package unshippable.
const OPT_IN = 'NAT_UI_ALLOW_LOCAL_RELEASE'

if (process.env[OPT_IN] !== '1') {
  console.error(
    [
      'Releases run in CI, through .github/workflows/publish.yml: merge the',
      'Version Packages pull request and the workflow publishes with npm',
      'trusted publishing.',
      '',
      'Publishing from here instead would ship a version with no provenance',
      `attestation. If that is genuinely what you want, set ${OPT_IN}=1.`,
    ].join('\n'),
  )
  process.exit(1)
}

console.warn(`${OPT_IN}=1 is set: publishing locally, without a provenance attestation.`)
