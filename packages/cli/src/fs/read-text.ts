import {readFile, readdir} from 'node:fs/promises'

/**
 * Init inspects paths that are routinely absent, so absence is an answer here
 * rather than an exception every caller has to catch.
 */
export const readText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

export const fileExists = async (path: string): Promise<boolean> =>
  (await readText(path)) !== undefined

export const directoryExists = async (path: string): Promise<boolean> => {
  try {
    await readdir(path)

    return true
  } catch {
    return false
  }
}
