import type { SvgIcon } from './icons.js'
import { generateSprite } from './sprite.js'
import type { ResolvedSvgSpritesOptions, SvgSpritesOptions } from './options.js'

export const VIRTUAL_MODULES = {
  main: 'virtual:svg-sprites',
  names: 'virtual:svg-sprites/names',
  ids: 'virtual:svg-sprites/ids',
} as const

export const SPRITE_UPDATE_EVENT = 'vite-plugin-yet-another-svg-sprites:update'

const resolvedVirtualModules = new Map<string, string>(
  Object.values(VIRTUAL_MODULES).map(id => [id, `\0${id}`]),
)

export function resolveVirtualModule(id: string): string | undefined {
  return resolvedVirtualModules.get(id)
}

export function getPublicModuleId(resolvedId: string): string | undefined {
  return [...resolvedVirtualModules].find(([, internalId]) => internalId === resolvedId)?.[0]
}

function serialize(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildSpriteInjection(sprite: string, updateMode: 'reload' | 'hmr'): string {
  const spriteDeclaration = updateMode === 'hmr' ? 'let' : 'const'
  const hmrListener = updateMode === 'hmr'
    ? `
  if (import.meta.hot) {
    const handleSpriteUpdate = (data) => {
      if (typeof data?.sprite !== 'string') return;
      spriteMarkup = data.sprite;
      injectSprite();
    };
    import.meta.hot.on('${SPRITE_UPDATE_EVENT}', handleSpriteUpdate);
    import.meta.hot.dispose(() => import.meta.hot.off('${SPRITE_UPDATE_EVENT}', handleSpriteUpdate));
  }`
    : ''

  return `${spriteDeclaration} spriteMarkup = ${serialize(sprite)};
if (typeof document !== 'undefined') {
  const injectSprite = () => {
    if (!document.body) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = spriteMarkup;
    const sprite = wrapper.querySelector('svg');
    if (!sprite) return;
    sprite.setAttribute('data-svg-sprites', '');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.position = 'absolute';
    sprite.style.width = '0';
    sprite.style.height = '0';
    sprite.style.overflow = 'hidden';
    const previousSprite = document.querySelector('svg[data-svg-sprites]');
    if (previousSprite) previousSprite.replaceWith(sprite);
    else document.body.insertBefore(sprite, document.body.firstChild);
  };
  if (document.body) injectSprite();
  else document.addEventListener('DOMContentLoaded', injectSprite, { once: true });
${hmrListener}
}`
}

export function buildMainModule(
  sprite: string,
  icons: SvgIcon[],
  options: Pick<SvgSpritesOptions, 'enumName' | 'updateMode'> = {},
): string {
  const enumName = options.enumName ?? 'SvgIconEnum'
  const names = serialize(icons.map(icon => icon.name))
  const ids = serialize(icons.map(icon => icon.id))
  const enumValues = serialize(Object.fromEntries(icons.map(icon => [icon.enumMember, icon.name])))

  return `${buildSpriteInjection(sprite, options.updateMode ?? 'reload')}
export const svgIconNames = Object.freeze(${names});
export const iconNames = svgIconNames;
export const svgIconIds = Object.freeze(${ids});
export const ids = svgIconIds;
export const ${enumName} = Object.freeze(${enumValues});
export default svgIconNames;
`
}

export function buildNamesModule(icons: SvgIcon[]): string {
  return `export default Object.freeze(${serialize(icons.map(icon => icon.name))});\n`
}

export function buildIdsModule(icons: SvgIcon[]): string {
  return `export default Object.freeze(${serialize(icons.map(icon => icon.id))});\n`
}

export function buildVirtualModule(
  publicId: string,
  icons: SvgIcon[],
  options: ResolvedSvgSpritesOptions,
): string | null {
  if (publicId === VIRTUAL_MODULES.main) {
    return buildMainModule(generateSprite(icons, options), icons, options)
  }
  if (publicId === VIRTUAL_MODULES.names) return buildNamesModule(icons)
  if (publicId === VIRTUAL_MODULES.ids) return buildIdsModule(icons)
  return null
}