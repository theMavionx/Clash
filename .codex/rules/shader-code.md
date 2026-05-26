---
paths:
  - "shaders/**"
  - "**/*.gdshader"
---

# Shader Code Rules

- Use descriptive shader names and group related uniforms.
- Comment non-obvious math.
- Avoid magic numbers; use named constants or documented uniforms.
- Minimize fragment texture samples and dynamic branching.
- Document target renderer or quality tier for complex shaders.
- Provide simpler fallbacks when a shader is performance-sensitive.
