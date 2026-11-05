declare module 'svgstore' {
  interface SvgStoreOptions {
    inline?: boolean
    renameDefs?: boolean
  }

  interface SvgStore {
    add(id: string, svg: string): this
    toString(options?: SvgStoreOptions): string
  }

  function svgstore(options?: SvgStoreOptions): SvgStore

  export default svgstore
}