import {defineConfig} from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // Published as a binary run via `dlx`, so bundle workspace deps in and keep
  // the install as small as possible. No consumer ever imports from here.
  noExternal: [/^@nat-ui\//],
  dts: false,
  clean: true,
  minify: true,
})
