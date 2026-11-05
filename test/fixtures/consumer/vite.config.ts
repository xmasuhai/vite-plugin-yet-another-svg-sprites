import { defineConfig } from 'vite'
import { svgSprites, type SvgSpritesOptions } from 'vite-plugin-yet-another-svg-sprites'

const options: SvgSpritesOptions = {
  inputFolder: 'src/icons',
  dts: 'src/types/svg-icons.d.ts',
}

export default defineConfig({ plugins: [svgSprites(options)] })