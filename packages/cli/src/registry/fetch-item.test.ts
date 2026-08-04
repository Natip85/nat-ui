import {describe, expect, test} from 'vitest'
import {fetchIndex, fetchItem, httpFetchJson, type FetchJson} from './fetch-item'

const payload = {
  schemaVersion: '1',
  name: 'button',
  type: 'ui',
  dependencies: ['@base-ui/react'],
  files: [{path: 'components/ui/button.tsx', type: 'ui', content: 'export const Button = 1\n'}],
}

const serving = (byUrl: Record<string, {status: number; body: string}>): FetchJson => {
  return (url) => {
    const response = byUrl[url] ?? {status: 404, body: 'Not Found'}

    return Promise.resolve(response)
  }
}

describe('fetchItem', () => {
  test('requests the item document and validates it', async () => {
    const fetchJson = serving({
      'https://r.test/button.json': {status: 200, body: JSON.stringify(payload)},
    })

    const item = await fetchItem('https://r.test', 'button', fetchJson)

    expect(item.name).toBe('button')
    expect(item.files[0]?.content).toBe('export const Button = 1\n')
  })

  test('reports a missing item distinctly from any other failure', async () => {
    await expect(fetchItem('https://r.test', 'nope', serving({}))).rejects.toThrow(
      /No component named "nope"/,
    )
  })

  test('reports the status code for other failures', async () => {
    const fetchJson = serving({'https://r.test/button.json': {status: 500, body: 'boom'}})

    await expect(fetchItem('https://r.test', 'button', fetchJson)).rejects.toThrow(/500/)
  })

  test('rejects a payload written against a newer contract', async () => {
    const fetchJson = serving({
      'https://r.test/button.json': {
        status: 200,
        body: JSON.stringify({...payload, schemaVersion: '2'}),
      },
    })

    await expect(fetchItem('https://r.test', 'button', fetchJson)).rejects.toThrow(/upgrade/i)
  })

  test('reports a malformed document without suggesting an upgrade', async () => {
    const fetchJson = serving({
      'https://r.test/button.json': {
        status: 200,
        body: JSON.stringify({schemaVersion: '1', name: 123, files: 'nope'}),
      },
    })

    try {
      await fetchItem('https://r.test', 'button', fetchJson)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(String(error)).toMatch(/malformed/i)
      expect(String(error)).not.toMatch(/upgrade/i)
    }
  })

  test('rejects a body that is not JSON', async () => {
    const fetchJson = serving({'https://r.test/button.json': {status: 200, body: '<html>'}})

    await expect(fetchItem('https://r.test', 'button', fetchJson)).rejects.toThrow(/not valid JSON/)
  })

  test('refuses an unsafe name before building a URL', async () => {
    await expect(fetchItem('https://r.test', '../secrets', serving({}))).rejects.toThrow(
      /not a valid component name/,
    )
  })
})

describe('httpFetchJson', () => {
  test('reports a connection failure with the URL', async () => {
    const url = 'http://127.0.0.1:1/button.json'

    await expect(httpFetchJson(url)).rejects.toThrow(new RegExp(`Could not reach ${url}`))
  })
})

describe('fetchIndex', () => {
  test('returns the list of available items', async () => {
    const fetchJson = serving({
      'https://r.test/index.json': {
        status: 200,
        body: JSON.stringify({schemaVersion: '1', items: [{name: 'button', type: 'ui'}]}),
      },
    })

    const index = await fetchIndex('https://r.test', fetchJson)

    expect(index.items.map((entry) => entry.name)).toEqual(['button'])
  })

  test('reports the status code for failures', async () => {
    const fetchJson = serving({'https://r.test/index.json': {status: 500, body: 'boom'}})

    await expect(fetchIndex('https://r.test', fetchJson)).rejects.toThrow(/500/)
  })

  test('rejects a body that is not JSON', async () => {
    const fetchJson = serving({'https://r.test/index.json': {status: 200, body: '<html>'}})

    await expect(fetchIndex('https://r.test', fetchJson)).rejects.toThrow(/not valid JSON/)
  })

  test('rejects an index written against a newer contract', async () => {
    const fetchJson = serving({
      'https://r.test/index.json': {
        status: 200,
        body: JSON.stringify({schemaVersion: '2', items: []}),
      },
    })

    await expect(fetchIndex('https://r.test', fetchJson)).rejects.toThrow(/upgrade/i)
  })

  test('reports a malformed index without suggesting an upgrade', async () => {
    const fetchJson = serving({
      'https://r.test/index.json': {
        status: 200,
        body: JSON.stringify({schemaVersion: '1', items: 'nope'}),
      },
    })

    try {
      await fetchIndex('https://r.test', fetchJson)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(String(error)).toMatch(/malformed/i)
      expect(String(error)).not.toMatch(/upgrade/i)
    }
  })
})
