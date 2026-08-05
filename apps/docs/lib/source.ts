import {loader} from 'fumadocs-core/source'
import {metaSchema, pageSchema} from 'fumadocs-core/source/schema'
import {defineDocs} from 'fumadocs-mdx/macro'
import {componentsRoute, docsRoute} from './shared'

const guides = defineDocs({
  dir: 'content/docs',
  docs: {schema: pageSchema},
  meta: {schema: metaSchema},
})

const components = defineDocs({
  dir: 'content/components',
  docs: {schema: pageSchema},
  meta: {schema: metaSchema},
})

/**
 * Two collections rather than one with `root: true` folders. A root folder
 * produces a switcher inside a single tree, which would put components under
 * /docs/components; separate top-level paths need separate loaders.
 */
export const docsSource = loader({
  baseUrl: docsRoute,
  source: guides.toFumadocsSource(),
})

export const componentsSource = loader({
  baseUrl: componentsRoute,
  source: components.toFumadocsSource(),
})
