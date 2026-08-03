import {defineConfig} from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // Published as a binary run via `dlx`, so bundle every dependency in and keep
  // the install as small as possible. No consumer ever imports from here.
  //
  // Bundling is why nothing below appears in `dependencies`. It also means a
  // change to @nat-ui/schema changes what this package ships, so schema
  // releases need an accompanying changeset here.
  noExternal: [/^@nat-ui\//, 'zod', '@clack/prompts'],
  dts: false,
  clean: true,
  minify: true,
  // Read after the build to work out whose licenses have to ship.
  metafile: true,
  onSuccess: 'tsx scripts/write-notices.ts',
})
