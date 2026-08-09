export function createRegisterAttemptManager({
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let current = null;

  const deactivate = (attempt) => {
    if (!attempt?.active) return false;
    attempt.active = false;
    if (attempt.timer !== null) clearTimer(attempt.timer);
    attempt.timer = null;
    if (current === attempt) current = null;
    return true;
  };

  return {
    begin(key, timeoutMs, onTimeout) {
      if (!key) throw new Error('Register attempt key is required');
      if (current?.active && current.key === key) return null;
      if (current) deactivate(current);

      const attempt = { key, active: true, timer: null };
      current = attempt;
      attempt.timer = setTimer(() => {
        if (current !== attempt || !attempt.active) return;
        attempt.active = false;
        attempt.timer = null;
        current = null;
        onTimeout?.();
      }, timeoutMs);
      return attempt;
    },

    isActive(attempt) {
      return !!attempt && attempt.active && current === attempt;
    },

    finish(attempt) {
      if (!attempt || current !== attempt) return false;
      return deactivate(attempt);
    },

    cancelCurrent() {
      return current ? deactivate(current) : false;
    },

    currentKey() {
      return current?.active ? current.key : null;
    },
  };
}
