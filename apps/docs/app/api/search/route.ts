import {createSearchAPI} from 'fumadocs-core/search/server'
import {componentsSource, docsSource} from '@/lib/source'

type Source = typeof docsSource

/**
 * `createFromSource` takes a single loader, so the two trees are indexed by
 * hand into one database. Searching from either tree should find both.
 */
const indexesOf = (source: Source) =>
  source.getPages().map((page) => ({
    id: page.url,
    url: page.url,
    title: page.data.title,
    description: page.data.description,
    structuredData: page.data.structuredData,
  }))

export const {GET} = createSearchAPI('advanced', {
  indexes: [...indexesOf(docsSource), ...indexesOf(componentsSource)],
})
