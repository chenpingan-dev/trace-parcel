import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  parseHar,
  prepare,
  exportHar,
  exportHtml,
  exportMarkdown,
  parseLiterals,
  DEFAULT_OPTIONS,
  MASK,
  OMITTED,
  MAX_BYTES,
} from '../dist/core.js';
import { SAMPLE } from '../dist/sample.js';

const fixture = () => JSON.parse(SAMPLE);
const captureOf = (data) => parseHar(JSON.stringify(data));
const all = (c) => new Set(c.entries.map((e) => e.id));
const make = (data = fixture(), options = DEFAULT_OPTIONS) => {
  const c = captureOf(data);
  return prepare(c, all(c), options);
};

test('default parcel excludes values, bodies and unrecognized metadata across all exports', () => {
  const data = fixture(),
    e = data.log.entries[0];
  data.log.comment = 'LOG-PRIVATE';
  data.log.browser = { name: 'BROWSER-PRIVATE' };
  data.log.pages = [{ title: 'PAGE-PRIVATE' }];
  e.request.headers.push({ name: 'X-Custom', value: 'HEADER-PRIVATE' });
  e._private = 'EXTENSION-PRIVATE';
  e.comment = 'COMMENT-PRIVATE';
  e.response.statusText = 'STATUS-PRIVATE';
  e.response.content.text = 'BODY-PRIVATE';
  e.request.url =
    'https://user:URL-PRIVATE@shop.example.invalid/path?q=QUERY-PRIVATE#FRAGMENT-PRIVATE';
  const parcel = make(data);
  for (const output of [exportHar(parcel), exportHtml(parcel), exportMarkdown(parcel)]) {
    for (const marker of [
      'LOG-PRIVATE',
      'BROWSER-PRIVATE',
      'PAGE-PRIVATE',
      'HEADER-PRIVATE',
      'EXTENSION-PRIVATE',
      'COMMENT-PRIVATE',
      'STATUS-PRIVATE',
      'BODY-PRIVATE',
      'URL-PRIVATE',
      'QUERY-PRIVATE',
      'FRAGMENT-PRIVATE',
      'synthetic-session',
      'synthetic-key-not-a-real-token',
      'avery@example.invalid',
      '192.0.2.10',
      '2026-01-01',
      'shop.example.invalid',
    ])
      assert.ok(!output.includes(marker), marker);
  }
  assert.equal(parcel.entries[0].har.request.httpVersion, 'HTTP/2.0');
  assert.ok(parcel.changes.every((c) => Object.keys(c).sort().join() === 'entry,location,reason'));
});

test('JSON option preserves useful fields and recursively masks sensitive keys and text patterns', () => {
  const data = fixture(),
    content = data.log.entries[0].response.content;
  content.mimeType = 'application/problem+json; charset=utf-8';
  content.text = JSON.stringify({
    error: 'GATEWAY_TIMEOUT',
    retry: true,
    nested: [
      {
        access_token: 'token-secret',
        email: 'someone@example.invalid',
        message: 'Contact someone@example.invalid with Bearer private-bearer',
      },
    ],
  });
  const parcel = make(data, { ...DEFAULT_OPTIONS, keepJson: true });
  const body = JSON.parse(parcel.entries[0].har.response.content.text);
  assert.equal(body.error, 'GATEWAY_TIMEOUT');
  assert.equal(body.retry, true);
  assert.equal(body.nested[0].access_token, MASK);
  assert.equal(body.nested[0].email, MASK);
  assert.ok(!JSON.stringify(body).includes('someone@example.invalid'));
  assert.ok(!JSON.stringify(body).includes('private-bearer'));
});

test('query values are removed and duplicate query keys remain consistent with the exported URL', () => {
  const data = fixture();
  data.log.entries[0].request.url = 'https://example.invalid/a?token=one&token=two&empty=';
  const request = make(data).entries[0].har.request;
  assert.deepEqual([...new URL(request.url).searchParams.values()], [MASK, MASK, MASK]);
  assert.deepEqual(request.queryString, [
    { name: 'token', value: MASK },
    { name: 'token', value: MASK },
    { name: 'empty', value: MASK },
  ]);
});

test('URL credentials and fragments are removed without decoding path separators', () => {
  const data = fixture();
  data.log.entries[0].request.url = 'https://u:p@example.invalid/a%2Fb/c%3Fd#secret';
  const url = new URL(make(data).entries[0].har.request.url);
  assert.equal(url.pathname, '/a%2Fb/c%3Fd');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  assert.equal(url.hash, '');
});

test('literal rules mask encoded paths, JSON values, titles and notes', () => {
  const data = fixture();
  data.log.entries[0].request.url = 'https://example.invalid/order/private%20order';
  data.log.entries[0].response.content = {
    size: 100,
    mimeType: 'application/json',
    text: '{"reference":"private order"}',
  };
  const c = captureOf(data),
    p = prepare(
      c,
      all(c),
      { ...DEFAULT_OPTIONS, keepJson: true, literals: ['private order'] },
      'private order report',
      'Note: private order',
    );
  const serialized = JSON.stringify(p);
  assert.ok(!serialized.includes('private order'));
  assert.ok(!serialized.includes('private%20order'));
  assert.equal(p.title, `${MASK} report`);
  assert.equal(p.note, `Note: ${MASK}`);
});

test('numeric JSON identifiers honor literal rules and host aliases survive a subset selection', () => {
  const data = fixture();
  data.log.entries[1].request.url = 'https://cdn.example.invalid/asset';
  data.log.entries[1].response.content = {
    size: 24,
    mimeType: 'application/json',
    text: '{"order":12345678,"count":2}',
  };
  const c = captureOf(data),
    p = prepare(c, new Set([1]), { ...DEFAULT_OPTIONS, keepJson: true, literals: ['12345678'] });
  assert.equal(new URL(p.entries[0].har.request.url).hostname, 'host-2.invalid');
  const body = JSON.parse(p.entries[0].har.response.content.text);
  assert.equal(body.order, MASK);
  assert.equal(body.count, 2);
});

test('host aliases are stable and explicit retained-host mode works', () => {
  const data = fixture();
  data.log.entries[1].request.url = 'https://cdn.example.invalid/a';
  const p = make(data);
  assert.equal(new URL(p.entries[0].har.request.url).host, 'host-1.invalid');
  assert.equal(new URL(p.entries[1].har.request.url).host, 'host-2.invalid');
  assert.equal(new URL(p.entries[2].har.request.url).host, 'host-1.invalid');
  const retained = make(data, { ...DEFAULT_OPTIONS, hideHosts: false });
  assert.equal(new URL(retained.entries[0].har.request.url).host, 'shop.example.invalid');
  const literal = make(data, {
    ...DEFAULT_OPTIONS,
    hideHosts: false,
    literals: ['shop.example.invalid'],
  });
  assert.equal(new URL(literal.entries[0].har.request.url).host, 'redacted.invalid');
});

test('base64, forms, malformed JSON and deeply nested JSON are omitted even in JSON mode', () => {
  for (const content of [
    { mimeType: 'application/json', encoding: 'base64', text: 'c2VjcmV0' },
    { mimeType: 'text/plain', text: 'secret' },
    { mimeType: 'application/json', text: 'not json' },
    { mimeType: 'application/json', text: '['.repeat(70) + '0' + ']'.repeat(70) },
  ]) {
    const data = fixture();
    data.log.entries[0].response.content = content;
    assert.equal(
      make(data, { ...DEFAULT_OPTIONS, keepJson: true }).entries[0].har.response.content.text,
      OMITTED,
    );
  }
  const data = fixture();
  data.log.entries[0].request.postData = {
    mimeType: 'multipart/form-data',
    params: [{ name: 'secret', value: 'private' }],
  };
  assert.equal(
    make(data, { ...DEFAULT_OPTIONS, keepJson: true }).entries[0].har.request.postData.text,
    OMITTED,
  );
});

test('subset exports contain only selected entries, with the original relative timing', () => {
  const c = parseHar(SAMPLE),
    p = prepare(c, new Set([6, 8]));
  assert.deepEqual(
    p.entries.map((e) => e.id),
    [6, 8],
  );
  const output = JSON.parse(exportHar(p));
  assert.equal(output.log.entries.length, 2);
  assert.equal(p.entries[0].offset, 1120);
  assert.equal(p.entries[0].har.time, 1840);
  assert.equal(p.entries[0].har.startedDateTime, '2000-01-01T00:00:01.120Z');
  assert.equal(parseHar(exportHar(p)).entries.length, 2);
  assert.ok(p.changes.every((e) => [6, 8].includes(e.entry)));
});

test('HTML and Markdown escape active markup without embedding original capture data', () => {
  const c = parseHar(SAMPLE),
    p = prepare(
      c,
      all(c),
      DEFAULT_OPTIONS,
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)> [x](https://bad.invalid)',
    );
  const html = exportHtml(p),
    markdown = exportMarkdown(p);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(markdown.includes('&lt;script&gt;'));
  assert.ok(!markdown.includes('[x](https://bad.invalid)'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes('synthetic-session'));
});

test('prototype-shaped JSON keys are data, not assignments to object prototypes', () => {
  const data = fixture();
  data.log.entries[0].response.content = {
    mimeType: 'application/json',
    size: 100,
    text: '{"__proto__":{"polluted":true},"constructor":{"api_key":"secret"}}',
  };
  const p = make(data, { ...DEFAULT_OPTIONS, keepJson: true });
  assert.equal({}.polluted, undefined);
  assert.equal(JSON.parse(p.entries[0].har.response.content.text).constructor.api_key, MASK);
});

test('input limits and schema errors fail with generic errors, without echoing values', () => {
  assert.throws(() => parseHar('x'.repeat(MAX_BYTES + 1)), /^Error: size$/);
  assert.throws(() => parseHar('PRIVATE invalid'), /^Error: json$/);
  assert.throws(() => parseHar('{}'), /^Error: format$/);
  const data = fixture();
  for (const [key, value, expected] of [
    ['url', 'javascript:alert(1)', 'url'],
    ['url', 'not-a-url', 'url'],
  ]) {
    data.log.entries[0].request[key] = value;
    assert.throws(() => captureOf(data), new RegExp(expected));
  }
  const dates = fixture();
  dates.log.entries[0].startedDateTime = 'invalid-private';
  assert.throws(() => captureOf(dates), /^Error: date$/);
  const statuses = fixture();
  statuses.log.entries[0].response.status = -9;
  assert.throws(() => captureOf(statuses), /^Error: status$/);
  assert.throws(
    () => captureOf({ log: { entries: Array(5001).fill(fixture().log.entries[0]) } }),
    /^Error: entries$/,
  );
});

test('empty captures work and rendering is deterministic without mutation', () => {
  assert.equal(make({ log: { entries: [] } }).entries.length, 0);
  const data = fixture(),
    before = JSON.stringify(data),
    p = make(data);
  assert.equal(JSON.stringify(data), before);
  assert.equal(exportHtml(p), exportHtml(make(data)));
  assert.deepEqual(parseLiterals('secret-one\nsecret-one\nsecond'), ['secret-one', 'second']);
  assert.throws(() => parseLiterals('ab'), /^Error: rules$/);
});

test('offline app CSP hash matches exact inline bytes and has no runtime remote assets', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(html.includes(`sha256-${createHash('sha256').update(script).digest('base64')}`));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(!/<(?:script|img|link)[^>]+(?:src|href)=["']https?:/i.test(html));
});
