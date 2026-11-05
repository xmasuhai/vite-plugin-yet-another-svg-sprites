import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/options.js'

describe('resolveOptions', () => {
  it('provides standalone plugin defaults', () => {
    expect(resolveOptions()).toMatchObject({
      inputFolder: 'src/assets/icons',
      symbolId: 'icon-[name]',
      noOptimizeList: [],
      inline: false,
      dts: 'src/types/svg-icons.d.ts',
      enumName: 'SvgIconEnum',
      typeName: 'SvgIconName',
      updateMode: 'reload',
    })
    expect(resolveOptions({ dts: true }).dts).toBe('src/types/svg-icons.d.ts')
  })

  it('rejects invalid and conflicting declaration identifiers', () => {
    expect(() => resolveOptions({ enumName: 'not-valid' })).toThrow(/enumName/)
    expect(() => resolveOptions({ typeName: 'default' })).toThrow(/typeName/)
    expect(() => resolveOptions({ enumName: 'SvgIconName' })).toThrow(/must be different/)
  })
})