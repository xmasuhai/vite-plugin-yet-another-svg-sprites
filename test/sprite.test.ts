import { describe, expect, it } from 'vitest'
import type { SvgIcon } from '../src/icons.js'
import { generateSprite } from '../src/sprite.js'
import type { SvgSpritesOptions } from '../src/options.js'

function icon(name: string, content: string): SvgIcon {
  return {
    name,
    id: `icon-${name}`,
    enumMember: name[0].toUpperCase() + name.slice(1),
    filePath: `${name}.svg`,
    relativePath: `${name}.svg`,
    content,
  }
}

describe('generateSprite', () => {
  it('optimizes each SVG with the defaults and preserves its viewBox', () => {
    const sprite = generateSprite([
      icon('sample', `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
        <!-- remove me -->
        <svg viewBox="0 0 24 24" data-name="sample" fill="red">
          <title>Sample icon</title><desc>Sample description</desc>
          <path d="M0 0h24v24H0z" fill="blue" class=""/>
        </svg>`),
      icon('second', '<svg viewBox="0 0 16 16"><path d="M0 0" fill="green"/></svg>'),
    ], { inline: true })

    expect(sprite).toContain('<symbol id="icon-sample" viewBox="0 0 24 24">')
    expect(sprite).toContain('<symbol id="icon-second" viewBox="0 0 16 16">')
    expect(sprite).not.toContain('data-name')
    expect(sprite).not.toContain('fill=')
    expect(sprite).not.toContain('<title')
    expect(sprite).not.toContain('<desc')
    expect(sprite).not.toContain('<!--')
    expect(sprite).not.toContain('class=""')
  })

  it('skips all SVGO processing for listed names but still adds each icon to the sprite', () => {
    const sprite = generateSprite([
      icon('skip', '<svg viewBox="0 0 10 10"><title>Keep title</title><path data-name="keep" fill="red" d="M0 0"/></svg>'),
      icon('optimize', '<svg viewBox="0 0 10 10"><path data-name="remove" fill="blue" d="M0 0"/></svg>'),
    ], { inline: true, noOptimizeList: ['skip'] })

    expect(sprite).toContain('<symbol id="icon-skip"')
    expect(sprite).toContain('<symbol id="icon-optimize"')
    expect(sprite).toContain('<title>Keep title</title>')
    expect(sprite).toContain('data-name="keep"')
    expect(sprite).toContain('fill="red"')
    expect(sprite).not.toContain('data-name="remove"')
    expect(sprite).not.toContain('fill="blue"')
  })

  it('uses a supplied SVGO configuration instead of the default plugins', () => {
    const options: SvgSpritesOptions = {
      inline: true,
      svgoConfig: {
        plugins: [{ name: 'removeAttrs', params: { attrs: 'stroke' } }],
      },
    }
    const sprite = generateSprite([
      icon('custom', '<svg viewBox="0 0 10 10"><path data-name="keep" fill="red" stroke="blue" d="M0 0"/></svg>'),
    ], options)

    expect(sprite).toContain('data-name="keep"')
    expect(sprite).toContain('fill="red"')
    expect(sprite).not.toContain('stroke=')
  })

  it('renames defs and their gradient and use references for each symbol', () => {
    const gradientIcon = (name: string) => icon(name, `<svg viewBox="0 0 10 10">
      <defs>
        <linearGradient id="shared"><stop offset="0" stop-color="red"/></linearGradient>
        <path id="shape" d="M0 0h10v10z"/>
        <clipPath id="clip"><path d="M0 0h5v5z"/></clipPath>
      </defs>
      <path fill="url(#shared)" d="M0 0"/>
      <path clip-path="url(#clip)" data-id="local" data-href="#shape" d="M0 0"/>
      <use href="#shape"/>
    </svg>`)
    const sprite = generateSprite([gradientIcon('first'), gradientIcon('second')], {
      inline: true,
      noOptimizeList: ['first', 'second'],
    })

    expect(sprite).toContain('id="icon-first_shared"')
    expect(sprite).toContain('id="icon-second_shared"')
    expect(sprite).toContain('fill="url(#icon-first_shared)"')
    expect(sprite).toContain('fill="url(#icon-second_shared)"')
    expect(sprite).toContain('clip-path="url(#icon-first_clip)"')
    expect(sprite).toContain('clip-path="url(#icon-second_clip)"')
    expect(sprite).toContain('data-id="local"')
    expect(sprite).toContain('data-href="#shape"')
    expect(sprite).toContain('href="#icon-first_shape"')
    expect(sprite).toContain('href="#icon-second_shape"')
  })

  it('honors svgstore inline output configuration', () => {
    const iconList = [icon('sample', '<svg viewBox="0 0 10 10"><path d="M0 0"/></svg>')]

    expect(generateSprite(iconList)).toMatch(/^<\?xml/)
    expect(generateSprite(iconList)).toContain('<!DOCTYPE svg PUBLIC')
    expect(generateSprite(iconList, { inline: true })).not.toContain('<!DOCTYPE')
  })
})