---
paths:
  - "tests/**"
  - "server/test*"
  - "scenes/TestMain.tscn"
---

# Test Standards

- Prefer deterministic tests with clear arrange/act/assert structure.
- Regression fixes should include a test or a documented manual reproduction check.
- Integration tests must clean up created state.
- Mock network, wallet, and external API dependencies where practical.
- Performance tests need explicit thresholds.
- Use `TestMain.tscn` for scene-level validation before promotion to `Main.tscn`.
