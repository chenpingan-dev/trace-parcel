import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 4178);
createServer(async (request, response) => {
  if (!['/', '/index.html'].includes(new URL(request.url, 'http://localhost').pathname)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(await readFile('dist/index.html'));
  } catch {
    response.writeHead(503).end('Run npm run build first');
  }
}).listen(port, '127.0.0.1', () => console.log(`Trace Parcel: http://127.0.0.1:${port}`));
