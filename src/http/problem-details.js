export function sendJson(response, status, body, contentType = 'application/json') {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': `${contentType}; charset=utf-8`,
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function sendProblem(response, {
  status,
  code,
  title,
  detail,
  requestId,
  field,
  headers = {},
}) {
  const body = {
    type: `urn:circle-recommendations:error:${code.toLowerCase().replaceAll('_', '-')}`,
    title,
    status,
    code,
    detail,
    request_id: requestId,
  };
  if (field) body.errors = [{ field, message: detail }];
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/problem+json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}
