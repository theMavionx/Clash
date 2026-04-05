# Godot — Version Reference

| Field | Value |
|-------|-------|
| **Engine Version** | 4.6.1 |
| **Latest Stable** | 4.6.2 (2026-04-01) |
| **Project Pinned** | 2026-04-05 |
| **LLM Knowledge Cutoff** | May 2025 |
| **Risk Level** | HIGH — versions 4.4, 4.5, 4.6 are beyond LLM training data |

## Knowledge Gap

The LLM's training data reliably covers Godot up to ~4.3. Versions 4.4, 4.5, and 4.6
introduced changes that the LLM may not know about. Agents MUST consult
`breaking-changes.md` and `deprecated-apis.md` before suggesting APIs from these versions.

## Version History (Post-Training)

- **4.4** — CSG overhaul (Manifold library), Curve range enforcement, FileAccess return types, @export_file uid:// paths
- **4.5** — Abstract classes in GDScript, Jolt Physics integration, script backtracing, @export_file_path annotation, visionOS support, chunk TileMap physics, dedicated 2D nav server
- **4.6** — Glow post-processing reworked (screen blend, pre-tonemapping), Quaternion default → identity, Jolt default for new 3D, D3D12 default on Windows, IK system for 3D, scene tile rotation
- **4.6.1** — Maintenance: 100+ bug fixes, physics energy leak fixes, editor UI fixes
- **4.6.2** — Maintenance: further stability fixes (latest stable)
