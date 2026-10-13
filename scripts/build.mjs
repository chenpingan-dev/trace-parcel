import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

await mkdir('dist', { recursive: true });
const browser = await build({
  entryPoints: ['src/app.ts'],
  bundle: true,
  write: false,
  minify: true,
  target: 'es2022',
  format: 'iife',
  legalComments: 'none',
  loader: { '.svg': 'text' },
});
const script = browser.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const hash = createHash('sha256').update(script).digest('base64');
const template = await readFile('src/index.html', 'utf8');
const css = await readFile('src/style.css', 'utf8');
const license = await readFile('LICENSE', 'utf8');
const thirdParty = await readFile('THIRD_PARTY.md', 'utf8');
await writeFile(
  'dist/index.html',
  template
    .replace('/* APP_CSS */', () => css)
    .replace(/<script>\s*\/\* APP_JS \*\/\s*<\/script>/, () => `<script>${script}</script>`)
    .replace('SCRIPT_HASH', () => hash)
    .replace('</head>', () => `<!--\n${license}\n${thirdParty.replaceAll('--', '—')}\n-->\n</head>`),
);
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/cli.mjs',
  banner: { js: `/*!\n${license}\n*/` },
});
await build({
  entryPoints: ['src/core.ts', 'src/sample.ts'],
  bundle: false,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'dist',
});
await writeFile('dist/.nojekyll', '');
console.log(
  `Built offline workspace (${Math.round((await readFile('dist/index.html')).byteLength / 1024)} KiB) and CLI`,
);
