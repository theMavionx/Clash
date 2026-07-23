'use strict';

const assert = require('node:assert/strict');
const { mergeMonotonicTaskProgress } = require('./task_progress');

assert.deepEqual(
  mergeMonotonicTaskProgress(
    { progress: 1, progress_value: 320.515, target_value: 300 },
    { progress: 0, progress_value: 0, target_value: 300 },
  ),
  { progress: 1, progress_value: 320.515, target_value: 300 },
  'a partial history refresh must not erase completed progress',
);

assert.deepEqual(
  mergeMonotonicTaskProgress(
    { progress: 0.25, progress_value: 75, target_value: 300 },
    { progress: 0.5, progress_value: 150, target_value: 300 },
  ),
  { progress: 0.5, progress_value: 150, target_value: 300 },
  'new verified progress should advance normally',
);

assert.deepEqual(
  mergeMonotonicTaskProgress(
    { progress: 0.5, progress_value: 150, target_value: 300 },
    { progress: 0.25, progress_value: 75, target_value: 300 },
  ),
  { progress: 0.5, progress_value: 150, target_value: 300 },
  'temporary history gaps must not reduce partial progress',
);

console.log('task progress monotonic tests passed');
