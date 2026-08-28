import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clientLogRetryDelayMs,
  isRetriableClientLogStatus,
  requeueFailedClientLogBatch,
} from './src/lib/clientLogRetry.js';

const failed = [{ id: 'old-1' }, { id: 'old-2' }];
const queued = [{ id: 'new-1' }, { id: 'new-2' }];
assert.deepEqual(
  requeueFailedClientLogBatch(queued, failed, 10).map(event => event.id),
  ['old-1', 'old-2', 'new-1', 'new-2'],
  'failed diagnostics must be retried before newer queued diagnostics',
);
assert.deepEqual(
  requeueFailedClientLogBatch(queued, failed, 3).map(event => event.id),
  ['old-1', 'old-2', 'new-1'],
  'the bounded queue must retain the failed batch first when capacity is exhausted',
);
assert.equal(clientLogRetryDelayMs(1), 2_000);
assert.equal(clientLogRetryDelayMs(2), 4_000);
assert.equal(clientLogRetryDelayMs(5), 30_000);
assert.equal(clientLogRetryDelayMs(50), 30_000);
assert.equal(isRetriableClientLogStatus(429), true);
assert.equal(isRetriableClientLogStatus(503), true);
assert.equal(isRetriableClientLogStatus(undefined), true);
assert.equal(isRetriableClientLogStatus(400), false);

const loggerSource = readFileSync(new URL('./src/lib/clientLogger.js', import.meta.url), 'utf8');
assert.match(loggerSource, /requeueFailedClientLogBatch\(queue, events, MAX_QUEUE\)/u);
assert.match(loggerSource, /if \(!response\?\.ok && isRetriableClientLogStatus\(response\?\.status\)\)/u);

console.log('Client log retry queue/backoff tests passed.');
