import {join} from 'node:path'
import {CONFIG_FILE_NAME, type Config, configSchema} from '@nat-ui/schema'
import {readText} from '../fs/read-text'

/**
 * Missing and malformed are separated because they call for different advice:
 * one means "run init", the other means "fix this file".
 */
export type ConfigResult =
  {status: 'missing'} | {status: 'invalid'; message: string} | {status: 'ok'; config: Config}

export const readConfig = async (cwd: string): Promise<ConfigResult> => {
  const text = await readText(join(cwd, CONFIG_FILE_NAME))
  if (text === undefined) return {status: 'missing'}

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {status: 'invalid', message: `${CONFIG_FILE_NAME} is not valid JSON. Fix it and retry.`}
  }

  const result = configSchema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where =
      issue === undefined ? '' : ` (${issue.path.join('.') || 'root'}: ${issue.message})`

    return {status: 'invalid', message: `${CONFIG_FILE_NAME} is not a valid config${where}.`}
  }

  return {status: 'ok', config: result.data}
}
