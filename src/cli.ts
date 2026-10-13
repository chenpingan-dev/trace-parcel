#!/usr/bin/env node
import { readFile, writeFile, stat, access, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import {
  parseHar,
  prepare,
  parseLiterals,
  exportHar,
  exportHtml,
  exportMarkdown,
  MAX_BYTES,
  VERSION,
} from './core.js';

const usage = `Trace Parcel ${VERSION}
Usage: node dist/cli.mjs recording.har --out report.html [options]

  --out FILE        HTML report (required)
  --har FILE        Also write a redacted HAR
  --markdown FILE   Also write a Markdown summary
  --only-failed     Select status 0 or >= 400
  --keep-json       Retain JSON bodies after key and text rules
  --keep-hosts      Retain hostnames
  --rules FILE      UTF-8 literal values to hide, one per line
  --title TEXT      Report title
  --lang en|zh-CN   Report language

Files are processed locally. Existing files are never overwritten.
Review paths, business fields and notes before sharing.`;

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const input = resolve(args.shift()!);
  const values = new Map<string, string>(),
    flags = new Set<string>();
  const flagNames = new Set(['--only-failed', '--keep-json', '--keep-hosts']);
  const valueNames = new Set(['--out', '--har', '--markdown', '--rules', '--title', '--lang']);
  while (args.length) {
    const option = args.shift()!;
    if (flags.has(option) || values.has(option)) throw new Error(`Duplicate option: ${option}`);
    if (flagNames.has(option)) flags.add(option);
    else if (valueNames.has(option) && args.length && !args[0].startsWith('--'))
      values.set(option, args.shift()!);
    else throw new Error(`Unknown or incomplete option: ${option}`);
  }
  if (!values.has('--out')) throw new Error('--out is required');
  const lang = values.get('--lang') ?? 'en';
  if (lang !== 'en' && lang !== 'zh-CN') throw new Error('--lang must be en or zh-CN');
  const size = (await stat(input)).size;
  if (size > MAX_BYTES) throw new Error('HAR exceeds 20 MiB');
  const capture = parseHar(await readFile(input, 'utf8'));
  const selected = new Set(
    capture.entries
      .filter((e) => !flags.has('--only-failed') || e.status >= 400 || e.status === 0)
      .map((e) => e.id),
  );
  if (!selected.size) throw new Error('No requests selected');
  const rulePath = values.get('--rules');
  if (rulePath && (await stat(rulePath)).size > 64 * 1024) throw new Error('Rules exceed 64 KiB');
  const parcel = prepare(
    capture,
    selected,
    {
      hideHosts: !flags.has('--keep-hosts'),
      keepJson: flags.has('--keep-json'),
      literals: rulePath ? parseLiterals(await readFile(rulePath, 'utf8')) : [],
    },
    values.get('--title') ?? (lang === 'en' ? 'Network issue report' : '网络问题报告'),
    '',
    lang,
  );
  const outputs: [string, string][] = [[values.get('--out')!, exportHtml(parcel)]];
  if (values.has('--har')) outputs.push([values.get('--har')!, exportHar(parcel)]);
  if (values.has('--markdown')) outputs.push([values.get('--markdown')!, exportMarkdown(parcel)]);
  const destinations = new Set<string>();
  for (const [file] of outputs) {
    const absolute = resolve(file);
    const canonicalParent = await realpath(dirname(absolute));
    const canonical = resolve(canonicalParent, absolute.slice(dirname(absolute).length + 1));
    const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    if (destinations.has(key)) throw new Error('Output paths must be different');
    destinations.add(key);
    try {
      await access(absolute);
      throw new Error('An output already exists; choose a new filename');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  for (const [file, data] of outputs) await writeFile(file, data, { encoding: 'utf8', flag: 'wx' });
  console.log(
    `Created ${outputs.length} files · ${selected.size} requests · ${parcel.changes.length} redaction events`,
  );
}
main().catch((error) => {
  console.error(`Trace Parcel: ${error instanceof Error ? error.message : 'failed'}`);
  process.exitCode = 1;
});
