"use strict";

// Process-local admission only. The database lease remains the authority across
// processes. Waiting callers have not performed any financial operation.
function createMigrationGate({ maxPending = 24, waitMs = 15000, record = () => {} } = {}) {
  let held = false;
  const queue = [];
  const emit = event => { try { record(event); } catch { /* diagnostics only */ } };
  function releaseOnce() {
    let released = false;
    return () => { if (!released) { released = true; release(); } };
  }
  function release() {
    const next = queue.shift();
    if (next) {
      clearTimeout(next.timer);
      emit({ event: "operation_dequeued", operation: next.operation,
        waitMs: Date.now() - next.started, queueDepth: queue.length });
      next.resolve(releaseOnce()); // Keep held=true during ownership handoff.
    } else held = false;
  }
  return {
    get pending() { return queue.length; },
    acquire(operation, background = false) {
      if (!held) { held = true; return Promise.resolve(releaseOnce()); }
      if (background) return Promise.resolve(null);
      if (queue.length >= maxPending) {
        emit({ event: "operation_queue_full", operation, queueDepth: queue.length });
        return Promise.reject(Object.assign(new Error("WORKER_BUSY"), { code: "WORKER_BUSY" }));
      }
      return new Promise((resolve, reject) => {
        const entry = { resolve, operation, started: Date.now() };
        entry.timer = setTimeout(() => {
          const index = queue.indexOf(entry);
          if (index < 0) return;
          queue.splice(index, 1);
          emit({ event: "operation_queue_timeout", operation, waitMs: Date.now() - entry.started, queueDepth: queue.length });
          reject(Object.assign(new Error("WORKER_BUSY"), { code: "WORKER_BUSY" }));
        }, waitMs);
        queue.push(entry);
        emit({ event: "operation_queued", operation, queueDepth: queue.length });
      });
    },
  };
}
module.exports = { createMigrationGate };
