# Cannon Models

Ready-to-instance cannon scenes for levels 1 through 10.

- Use `level_XX/cannon_level_XX.tscn` in gameplay or test scenes.
- Level 1 is the actual two-part cannon extracted from the Town Hall 10 rooftop.
  Its GLB and palette texture are self-contained and do not instance the Town Hall.
- Levels 2 and 3 use the same authored barrel texture. Their bases intentionally use
  a solid brown material, as specified by the source README and visual reference.
  Both materials are double-sided because the authored base contains mixed face
  winding; this keeps the complete wooden platform visible.
- Levels 8 through 10 include the optional authored emission maps.
- Metallic maps use a stylized 0.35 strength so gold accents remain bright in the
  game's lighting instead of reflecting as nearly black.
- `cannon_flat_normals_post_import.gd` rebuilds imported surfaces with flat face
  normals so the low-poly planes stay crisp instead of looking over-smoothed.
- The same post-import step separates low platform rings, boards, and decorative
  fasteners that were authored inside the barrel meshes on Levels 2-10. Those
  triangles are appended to the fixed base mesh, while only the actual barrel
  and its collars remain in the rotating `CannonN` mesh.

Each level scene keeps the base and barrel as separate `MeshInstance3D` nodes, so
the barrel can still be aimed independently.
