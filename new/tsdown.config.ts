/**
 * dsh-we-wallpaper build: the node half (lib/index.js, host routes + scanner)
 * plus the browser half (lib/client.js, the ModuleLoader closure-factory
 * bundle the web GUI loads as a client plugin).
 *
 * The client bundle resolves its platform dependencies (react, cordis,
 * dsh-client-ui-slots, dsh-client-runtime/client, ...) from the shell's
 * frozen module table — they must stay external so the loader can answer
 * them; everything else is inlined.
 */
import type { UserConfig } from 'tsdown'

/** Plugin id stamped into the ModuleLoader handoff (the package name). */
const PLUGIN_ID = 'dsh-we-wallpaper'

/** Module-table entries the browser shell shares into every client bundle. */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
]

/** Everything a client bundle may require() from the loader table. */
const CLIENT_EXTERNALS = [
  ...PLATFORM_EXTERNALS,
  // Runtime mirror of the host-side settings scope; an immediately-tier
  // table row (see dsh-client-runtime's documented exemption).
  '@deepseek-ai/dsh-client-runtime/client',
]

/** Node half: host entry compiled to ESM; framework SDKs stay external. */
const nodeLib: UserConfig = {
  name: PLUGIN_ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  dts: false,
  clean: false,
  // The cordis framework and the host service SDKs resolve at runtime from
  // the dsh profile tree, never from this repo's install.
  deps: {
    neverBundle: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-host-webserver',
      'schemastery',
    ],
  },
  outputOptions: {
    entryFileNames: 'index.js',
  },
}

/** Browser half: the closure-factory bundle served as lib/client.js. */
const clientBundle: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    // The loader handoff: register the factory under the package name; the
    // shell fetches this bundle from /plugins/dsh-we-wallpaper/client.js.
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeLib, clientBundle] satisfies UserConfig[]
