---
paths:
  - "scripts/**"
  - "web/**"
  - "scenes/**"
---

# UI Code Rules

- UI should display state and send commands; it should not own gameplay-critical truth.
- Keep user-facing text ready for localization when adding durable UI.
- Support mouse/keyboard first, and avoid blocking future gamepad/touch support.
- Check visual changes at relevant desktop and mobile sizes or in Godot scene view.
- Respect accessibility basics: readable contrast, scalable text, no required rapid input where avoidable.
- UI sounds and effects should use existing audio/VFX systems when present.
