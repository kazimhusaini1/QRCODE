const http = require('node:http');

const allowedOrigins = new Set(['http://localhost:8081', 'http://localhost:8082']);
const allowedHeaders = new Set(['authorization', 'content-type', 'idempotency-key', 'x-requested-with']);

http.createServer((request, response) => {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) {
    response.writeHead(403, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Origin is not allowed by the local Expo API proxy.' }));
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');

  if (request.method === 'OPTIONS') {
    const requestedHeaders = (request.headers['access-control-request-headers'] ?? '')
      .split(',').map(value => value.trim().toLowerCase()).filter(value => allowedHeaders.has(value));
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', requestedHeaders.join(', '));
    response.writeHead(204);
    response.end();
    return;
  }

  const upstream = http.request({
    hostname: '127.0.0.1', port: 4000, method: request.method, path: request.url,
    headers: { ...request.headers, host: 'localhost:4000' },
  }, upstreamResponse => {
    const headers = { ...upstreamResponse.headers };
    for (const name of Object.keys(headers)) if (name.startsWith('access-control-')) delete headers[name];
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-credentials'] = 'true';
    headers.vary = headers.vary ? `${headers.vary}, Origin` : 'Origin';
    response.writeHead(upstreamResponse.statusCode ?? 502, headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'The local API at localhost:4000 is unavailable.' }));
  });
  request.pipe(upstream);
}).listen(4001, '::1', () => console.log('Expo web API proxy: http://localhost:4001 → http://localhost:4000'));
