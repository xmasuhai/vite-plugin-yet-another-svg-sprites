# vite-plugin-yet-another-svg-sprites 又一个SVG Sprites Vite 插件

> 此插件仅供个人研究学习使用，勿用于生产环境

- 推荐类似的插件：
  - [vite-plugin-svg-icons-ng](https://github.com/yangxu52/vite-plugin-svg-icons-ng)
  - [vite-plugin-svg-sprite](https://github.com/meowtec/vite-plugin-svg-sprite)
  - ~~[vite-plugin-svg-icons 已停止维护](https://github.com/vbenjs/vite-plugin-svg-icons)~~

---

Framework-independent Vite plugin that optimizes SVG files individually and combines them into an injected sprite.
The current verified environment is Node.js 26.12.1 and Vite 8.3.6; the package declares Node.js `>=26.12.1` and Vite `^8.3.6`.

## Install

Build and pack this directory with `pnpm install`, `pnpm build`, and `pnpm pack`, then install the resulting tarball and Vite in the consuming project:

```sh
pnpm add -D ./vite-plugin-yet-another-svg-sprites-0.1.0.tgz 'vite@^8.3.6'
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { svgSprites } from 'vite-plugin-yet-another-svg-sprites'

export default defineConfig({
  plugins: [svgSprites()],
})
```

Place SVG files under `src/assets/icons`. Subdirectories are scanned recursively; each icon name is its filename without the extension. Duplicate names, generated symbol IDs, or PascalCase enum members are errors, with the conflicting files reported. Only one plugin instance is supported per Vite configuration.

## Use

Import the main virtual module once to inject the hidden sprite. It exports frozen name and ID lists, aliases, and an enum-like object:

```ts
import names, {
  svgIconNames, iconNames, svgIconIds, ids, SvgIconEnum,
  type SvgIconName, type SvgIconId,
} from 'virtual:svg-sprites'

const icon: SvgIconName = SvgIconEnum.Add
console.log(icon, names, svgIconNames, iconNames, svgIconIds, ids)
```

With `add.svg` and the default ID template, use a symbol from plain HTML:

```html
<svg aria-hidden="true"><use href="#icon-add"></use></svg>
```

The following modules export only their frozen list and do not inject a sprite:

```ts
import namesOnly from 'virtual:svg-sprites/names'
import idsOnly from 'virtual:svg-sprites/ids'
```

The plugin writes `src/types/svg-icons.d.ts` relative to the Vite root when the configuration is resolved. Include that file in the consuming project's TypeScript configuration. The generated declaration provides literal unions, the configured enum, and all virtual-module exports; an empty icon directory uses `string` for the name and ID types.

## Options

```ts
svgSprites({
  inputFolder: 'src/assets/icons', // relative to Vite root; absolute paths are also accepted
  symbolId: 'icon-[name]',
  noOptimizeList: ['colored-icon'], // names without .svg
  // svgoConfig: { plugins: [...] }, // replaces the plugin's default SVGO configuration
  inline: false, // passed to svgstore
  dts: 'src/types/svg-icons.d.ts', // true uses this default; false disables generation
  enumName: 'SvgIconEnum',
  typeName: 'SvgIconName',
  updateMode: 'reload', // or 'hmr'
})
```

By default SVGO removes doctype, comments, titles, descriptions, empty attributes, `data-name`, and `fill` from each input, and cleans attributes. Removing `fill` makes icons easier to color with `currentColor`; use `noOptimizeList` or a custom `svgoConfig` for multicolored icons. Listed icons skip all SVGO processing but still undergo ID namespacing and `svgstore` merging. `viewBox` is retained. The generated sprite namespaces local IDs, embedded CSS ID selectors, animation timing references, and common URL, `href`, and ARIA ID references per icon. With `inline: false`, `svgstore` adds an XML declaration and doctype to the combined output.

`enumName` and `typeName` must be distinct valid TypeScript identifiers and must not conflict with generated exports. Declarations are rewritten only when their contents change.

## Development updates

The default `reload` mode rescans on SVG creation, modification, and deletion, updates declarations, invalidates the virtual modules, and reloads the page. In `hmr` mode a custom Vite event replaces the sprite DOM and Vite propagates updates to the virtual modules. Consumers must accept the relevant modules and update their own state; otherwise Vite may perform a full reload:

```ts
import initialNames from 'virtual:svg-sprites'

let names = initialNames
if (import.meta.hot) {
  import.meta.hot.accept('virtual:svg-sprites', (updated) => {
    if (updated) names = updated.default
  })
}
```

Also accept `virtual:svg-sprites/names` and/or `virtual:svg-sprites/ids` if they are imported and page-state preservation is required. HMR does not guarantee that every consumer has an accepting boundary.

SVG inputs must be trusted: the generated markup is injected using `innerHTML`. Importing the main module without `document` is safe, but this plugin does not inject a server-rendered sprite.

## Development

Run `pnpm install`, `pnpm test`, `pnpm typecheck`, and `pnpm build`. Browser integration tests require a local Chromium-compatible browser; set `SVG_SPRITES_TEST_BROWSER` to its executable if it is not in a standard location. The package-consumer test builds and packs the plugin, then installs the tarball into an isolated native Vite fixture using the pnpm offline store.

---
---
