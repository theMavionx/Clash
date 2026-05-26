---
paths:
  - "scripts/**"
  - "addons/**"
  - "tools/**"
---

# Engine Code Rules

- Check `docs/engine-reference/godot/VERSION.md` and nearby Godot reference docs before using uncertain APIs.
- Avoid allocations, broad node searches, and expensive tree traversal in hot paths.
- Profile before and after performance changes.
- Keep reusable engine-style helpers independent from gameplay-specific rules.
- Document public helper APIs with a short usage note when they are reused across systems.
- Do not edit `.import` files manually.
