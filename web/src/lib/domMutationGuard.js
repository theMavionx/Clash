const PATCH_FLAG = Symbol.for('clash.domMutationGuard.installed');

function isDomParentMismatch(error, operation) {
  if (!error || error.name !== 'NotFoundError') return false;
  const message = String(error.message || '');
  if (operation === 'removeChild') {
    return /node to be removed is not a child/i.test(message);
  }
  if (operation === 'insertBefore') {
    return /node before which the new node is to be inserted/i.test(message);
  }
  return false;
}

export function installDomMutationGuard() {
  if (typeof Node === 'undefined') return;
  const proto = Node.prototype;
  if (!proto || proto[PATCH_FLAG]) return;

  const originalRemoveChild = proto.removeChild;
  const originalInsertBefore = proto.insertBefore;

  Object.defineProperty(proto, PATCH_FLAG, {
    configurable: false,
    enumerable: false,
    value: true,
  });

  if (typeof originalRemoveChild === 'function') {
    proto.removeChild = function guardedRemoveChild(child) {
      try {
        return originalRemoveChild.call(this, child);
      } catch (error) {
        if (isDomParentMismatch(error, 'removeChild')) {
          return child;
        }
        throw error;
      }
    };
  }

  if (typeof originalInsertBefore === 'function') {
    proto.insertBefore = function guardedInsertBefore(newNode, referenceNode) {
      try {
        return originalInsertBefore.call(this, newNode, referenceNode);
      } catch (error) {
        if (isDomParentMismatch(error, 'insertBefore')) {
          return originalInsertBefore.call(this, newNode, null);
        }
        throw error;
      }
    };
  }
}

installDomMutationGuard();
