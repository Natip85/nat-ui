import {describe, expect, test} from 'vitest'
import {rewriteImports} from './rewrite-imports'

const aliases = {ui: '~/ui', utils: '~/helpers/cn'}

describe('rewriteImports', () => {
  test('rewrites the utils import to the configured alias', () => {
    const source = "import {cn} from '@/lib/utils'\n"

    expect(rewriteImports(source, aliases)).toBe("import {cn} from '~/helpers/cn'\n")
  })

  test('rewrites a sibling component import to the ui alias', () => {
    const source = "import {buttonVariants} from '@/components/ui/button'\n"

    expect(rewriteImports(source, aliases)).toBe("import {buttonVariants} from '~/ui/button'\n")
  })

  test('rewrites re-exports too', () => {
    const source = "export {Button} from '@/components/ui/button'\n"

    expect(rewriteImports(source, aliases)).toBe("export {Button} from '~/ui/button'\n")
  })

  test('preserves double quotes', () => {
    expect(rewriteImports('import {cn} from "@/lib/utils"', aliases)).toBe(
      'import {cn} from "~/helpers/cn"',
    )
  })

  test('leaves package imports alone', () => {
    const source = "import {Dialog} from '@base-ui/react/dialog'\nimport {X} from 'lucide-react'\n"

    expect(rewriteImports(source, aliases)).toBe(source)
  })

  test('leaves a string that merely looks like a specifier alone', () => {
    const source = "const doc = '@/lib/utils'\n"

    expect(rewriteImports(source, aliases)).toBe(source)
  })

  test('rewrites every occurrence in a file', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import {buttonVariants} from '@/components/ui/button'",
      '',
    ].join('\n')

    const result = rewriteImports(source, aliases)

    expect(result).toContain("'~/helpers/cn'")
    expect(result).toContain("'~/ui/button'")
    expect(result).not.toContain('@/')
  })

  test('is a no-op when the project uses the same aliases', () => {
    const source = "import {cn} from '@/lib/utils'\n"

    expect(rewriteImports(source, {ui: '@/components/ui', utils: '@/lib/utils'})).toBe(source)
  })

  test('rewrites a rewritable import but leaves an unknown @/ specifier untouched', () => {
    const source = [
      "import {useThing} from '@/hooks/use-thing'",
      "import {cn} from '@/lib/utils'",
      '',
    ].join('\n')

    expect(rewriteImports(source, aliases)).toBe(
      ["import {useThing} from '@/hooks/use-thing'", "import {cn} from '~/helpers/cn'", ''].join(
        '\n',
      ),
    )
  })

  test('leaves an unknown @/ specifier untouched when it follows a rewritable one', () => {
    const source = [
      "import {cn} from '@/lib/utils'",
      "import {useThing} from '@/hooks/use-thing'",
      '',
    ].join('\n')

    expect(rewriteImports(source, aliases)).toBe(
      ["import {cn} from '~/helpers/cn'", "import {useThing} from '@/hooks/use-thing'", ''].join(
        '\n',
      ),
    )
  })

  test('rewrites side-effect imports', () => {
    const source = "import '@/lib/utils'\n"

    expect(rewriteImports(source, aliases)).toBe("import '~/helpers/cn'\n")
  })

  test('normalizes a trailing slash on the ui alias', () => {
    const source = "import {buttonVariants} from '@/components/ui/button'\n"
    const trailingSlashAliases = {ui: '~/ui/', utils: '~/helpers/cn'}

    expect(rewriteImports(source, trailingSlashAliases)).toBe(
      "import {buttonVariants} from '~/ui/button'\n",
    )
  })
})
