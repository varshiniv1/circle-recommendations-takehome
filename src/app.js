import { randomUUID } from 'node:crypto';
import { DEFAULT_LIMIT, MAX_LIMIT, SNAPSHOT_AT } from './config.js';
import { sendJson, sendProblem } from './http/problem-details.js';

const ROUTE = /^\/v1\/users\/([^/]+)\/circle-recommendations\/?$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

function problem(response, requestId, values) {
  sendProblem(response, { requestId, ...values });
}

export function createRequestHandler({ service, requestIdFactory = randomUUID }) {
  return function requestHandler(request, response) {
    const requestId = requestIdFactory();
    response.setHeader('x-request-id', requestId);

    try {
      const url = new URL(request.url, 'http://localhost');
      const match = ROUTE.exec(url.pathname);
      if (!match) {
        problem(response, requestId, {
          status: 404,
          code: 'ROUTE_NOT_FOUND',
          title: 'Route not found',
          detail: 'The requested route does not exist.',
        });
        return;
      }

      if (request.method !== 'GET') {
        problem(response, requestId, {
          status: 405,
          code: 'METHOD_NOT_ALLOWED',
          title: 'Method not allowed',
          detail: 'This endpoint only supports GET.',
          headers: { allow: 'GET' },
        });
        return;
      }

      const hasRequestBody = (request.headers['content-length'] && request.headers['content-length'] !== '0')
        || request.headers['transfer-encoding'];
      if (hasRequestBody) {
        problem(response, requestId, {
          status: 400,
          code: 'REQUEST_BODY_NOT_ALLOWED',
          title: 'Invalid recommendation request',
          detail: 'A request body is not allowed for this endpoint.',
        });
        return;
      }

      const unknownParameter = [...url.searchParams.keys()].find((key) => key !== 'limit');
      if (unknownParameter) {
        problem(response, requestId, {
          status: 400,
          code: 'UNKNOWN_QUERY_PARAMETER',
          title: 'Invalid recommendation request',
          detail: `Unknown query parameter: ${unknownParameter}.`,
          field: unknownParameter,
        });
        return;
      }

      const rawUserId = match[1];
      const userId = Number(rawUserId);
      if (!POSITIVE_INTEGER.test(rawUserId) || !Number.isSafeInteger(userId)) {
        problem(response, requestId, {
          status: 400,
          code: 'INVALID_USER_ID',
          title: 'Invalid recommendation request',
          detail: 'userId must be a positive safe integer.',
          field: 'userId',
        });
        return;
      }

      const limits = url.searchParams.getAll('limit');
      const rawLimit = limits[0];
      const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
      if (limits.length > 1 || (rawLimit !== undefined && !POSITIVE_INTEGER.test(rawLimit)) || !Number.isSafeInteger(limit) || limit > MAX_LIMIT) {
        problem(response, requestId, {
          status: 400,
          code: 'INVALID_LIMIT',
          title: 'Invalid recommendation request',
          detail: `limit must be one integer between 1 and ${MAX_LIMIT}.`,
          field: 'limit',
        });
        return;
      }

      const result = service.recommend(userId, limit);
      if (!result) {
        problem(response, requestId, {
          status: 404,
          code: 'USER_NOT_FOUND',
          title: 'User not found',
          detail: `No user exists with id ${userId}.`,
          field: 'userId',
        });
        return;
      }

      sendJson(response, 200, {
        data: {
          user_id: result.userId,
          mode: result.mode,
          snapshot_at: SNAPSHOT_AT,
          recommendations: result.recommendations,
        },
        meta: {
          requested_limit: limit,
          returned: result.recommendations.length,
        },
      });
    } catch {
      if (!response.headersSent) {
        problem(response, requestId, {
          status: 500,
          code: 'INTERNAL_ERROR',
          title: 'Internal server error',
          detail: 'The recommendation request could not be completed.',
        });
      } else response.end();
    }
  };
}
