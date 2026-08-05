import {createMDX} from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  headers() {
    return Promise.resolve([
      {
        // Registry documents are immutable for a given deploy: `add` fetches
        // them on every run, and GitHub raw never let us say so.
        source: '/r/:file*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          },
          {key: 'Access-Control-Allow-Origin', value: '*'},
        ],
      },
    ])
  },
}

export default withMDX(config)
