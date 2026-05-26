---
paths:
  - "assets/data/**"
  - "**/*.json"
---

# Data File Rules

- JSON must remain valid and parseable.
- Prefer lowercase snake_case filenames for project-owned data.
- Keep schemas documented in either JSON Schema, design docs, or adjacent README files.
- Explain non-obvious numeric values through docs or comments in formats that support comments.
- Version or migrate data when schema changes are breaking.
- Avoid orphaned entries that nothing references.
