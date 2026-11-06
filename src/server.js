import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { loadData } from './data/load-data.js';
import { createRecommendationService } from './recommendation/recommendation-service.js';

function getPort() {
  const rawPort = process.env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

const data = loadData();
const service = createRecommendationService(data);
const server = createServer(createRequestHandler({ service }));
const port = getPort();

server.listen(port, () => {
  console.log(`Circle recommendations API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
