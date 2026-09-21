import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { clientBundle } from '../tsdown.client.ts'

const brandAssets = new Map([
  ['hailiang:mark', 'hailiang-mark.png'],
])

/** Inline the supplied raster artwork so the dynamic browser bundle has no asset URL to serve. */
const hailiangRasterAssets = {
  name: 'hailiang-raster-assets',
  resolveId(source: string) {
    const asset = brandAssets.get(source)
    if (asset === undefined) return null
    return fileURLToPath(new URL(`./src/client/assets/${asset}`, import.meta.url))
  },
  async load(id: string) {
    if (!id.includes('/src/client/assets/hailiang-')) return null
    const bytes = await readFile(id)
    return `export default ${JSON.stringify(`data:image/png;base64,${bytes.toString('base64')}`)};`
  },
}

const build = clientBundle('@deepseek-ai/dsh-client-ui-brand-hailiang', ['lib/types/index.js'])

/** Add the Hailiang artwork loader after the shared browser-bundle preset. */
export default (environment: { env?: { DSH_BUILD_FACE?: string } }) =>
  build(environment).map(config => ({ ...config, plugins: [...(config.plugins ?? []), hailiangRasterAssets] }))
