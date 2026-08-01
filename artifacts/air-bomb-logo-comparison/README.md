# Air Bomb / ship sail Ostium comparison

Generated with Godot 4.6 stable on the Compatibility renderer using AMD Radeon
Graphics. Both renders use the exact shared fallback texture at
`Model/Town_Hall/Town Hall Level 1_FlagTexture2.png`.

- `final_air_bomb/02_flag_applied.png`: production Air Bomb at uniform scale
  `0.035`, with the complete source flag aspect-preserved and centered at 30%
  of a mipmapped 512x512 presentation canvas.
- `ship_sail_ostium_reference.png`: the existing main-ship sail presentation
  used as the orientation, centering, color, and filtering reference.
- `final_air_bomb/01_loaded_idle.png` through
  `final_air_bomb/10_full_payload_reloaded.png`: the full rigid-payload visual
  sequence with the Ostium flag applied after the idle frame.
- `final_air_bomb_thumbnail.png`: transparent-background close framing for
  presentation review; it is not the production web thumbnail.

The same ten Air Bomb frames were rendered at fixed 10, 20, 30, 60, and 120
FPS. All five runs passed the visual contract and each corresponding frame had
one unique SHA-256 across the five rates (no render-rate visual drift).

Reference hashes:

- Air Bomb Ostium frame:
  `B2305B5E2C77ECF2261529EFBF660EF3B65E09754BEB2C9461D919E01E146782`
- Main-ship sail reference:
  `E3D853413A621D778E5B701CBADAA62B204ABB68F96E313C30F22E8B6C525B51`
