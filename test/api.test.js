import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { after, before, test } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { loadData } from '../src/data/load-data.js';
import { createRecommendationService } from '../src/recommendation/recommendation-service.js';

let server;
let baseUrl;

before(async () => {
  const service = createRecommendationService(loadData());
  server = createServer(createRequestHandler({
    service,
    requestIdFactory: () => 'test-request-id',
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function get(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

function assertProblem(response, body, status, code, field = null) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('content-type'), 'application/problem+json; charset=utf-8');
  assert.equal(body.status, status);
  assert.equal(body.code, code);
  assert.equal(body.request_id, 'test-request-id');
  assert.equal(typeof body.title, 'string');
  assert.equal(typeof body.detail, 'string');
  assert.match(body.type, /^urn:circle-recommendations:error:/);
  if (field) assert.deepEqual(body.errors, [{ field, message: body.detail }]);
}

test('GET recommendations returns the documented response shape', async () => {
  const { response, body } = await get('/v1/users/23/circle-recommendations?limit=3');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(body.data.user_id, 23);
  assert.equal(body.data.recommendations[0].circle.id, 22);
  assert.equal(body.meta.requested_limit, 3);
  assert.equal(body.meta.returned, 3);
  assert.ok(!Object.hasOwn(body.data.recommendations[0], 'score'));
});

test('an empty recommendation list is returned as a successful response', async () => {
  const emptyService = {
    recommend: (userId) => ({ userId, mode: 'cold_start', recommendations: [] }),
  };
  const emptyServer = createServer(createRequestHandler({
    service: emptyService,
    requestIdFactory: () => 'empty-request-id',
  }));
  await new Promise((resolve) => emptyServer.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = emptyServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/v1/users/42/circle-recommendations`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.data.recommendations, []);
    assert.equal(body.meta.returned, 0);
  } finally {
    await new Promise((resolve, reject) => emptyServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('invalid user IDs return a structured 400 error', async () => {
  const { response, body } = await get('/v1/users/not-a-number/circle-recommendations');
  assertProblem(response, body, 400, 'INVALID_USER_ID', 'userId');
});

test('invalid limits return a structured 400 error', async () => {
  for (const limit of ['0', '11', '1.5', 'many']) {
    const { response, body } = await get(`/v1/users/7/circle-recommendations?limit=${limit}`);
    assertProblem(response, body, 400, 'INVALID_LIMIT', 'limit');
  }
  const repeated = await get('/v1/users/7/circle-recommendations?limit=2&limit=3');
  assertProblem(repeated.response, repeated.body, 400, 'INVALID_LIMIT', 'limit');
});

test('unknown users return a structured 404 error', async () => {
  const { response, body } = await get('/v1/users/9999/circle-recommendations');
  assertProblem(response, body, 404, 'USER_NOT_FOUND', 'userId');
});

test('unknown query parameters are rejected', async () => {
  const { response, body } = await get('/v1/users/7/circle-recommendations?debug=true');
  assertProblem(response, body, 400, 'UNKNOWN_QUERY_PARAMETER', 'debug');
});

test('GET request bodies are rejected', async () => {
  const { status, body } = await new Promise((resolve, reject) => {
    const payload = 'unexpected';
    const request = httpRequest(`${baseUrl}/v1/users/7/circle-recommendations`, {
      method: 'GET',
      headers: { 'content-length': Buffer.byteLength(payload) },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(responseBody) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
  assert.equal(status, 400);
  assert.equal(body.status, 400);
  assert.equal(body.code, 'REQUEST_BODY_NOT_ALLOWED');
  assert.equal(body.request_id, 'test-request-id');
});

test('unsupported HTTP methods return 405 with an Allow header', async () => {
  const { response, body } = await get('/v1/users/7/circle-recommendations', { method: 'POST' });
  assertProblem(response, body, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(response.headers.get('allow'), 'GET');
});
