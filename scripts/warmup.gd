extends Node3D
## Shader pipeline warmup node.
##
## WebGL2 (Godot 4.6 Compatibility renderer on web exports) has no pipeline
## precompile API and no persistent shader cache between sessions — every page
## load recompiles every material variant on its first draw. The official
## mitigation (docs/tutorials/performance/pipeline_compilations.rst) is to
## "preload materials, shaders, and particles by displaying them for at least
## one frame in the view frustum when the level is loading."
##
## This node instantiates one representative of every material variant the
## gameplay code will later use, keeps them visible for WARMUP_FRAMES frames
## (long enough for the GPU driver to finish pipeline creation), and then
## frees itself. The representatives are placed at `WARMUP_POS` inside the
## main-camera frustum at tiny scale so the player never notices them.
##
## Placed in Main.tscn — runs once when the island loads, before the first
## attack starts.

## WebGL2 shader compile is async and can take 3-8 frames per variant on
## first compile (browser/driver-dependent). 16 gives real headroom; the
## nodes are already invisible, so extra frames cost nothing visually.
const WARMUP_FRAMES: int = 16
## Sub-pixel scales (< ~0.005) are frustum-culled by both renderers — the draw
## call never reaches the GPU and the pipeline isn't compiled. 0.02 is small
## enough to be invisible against the water/sky but big enough to rasterize.
const WARMUP_SCALE: Vector3 = Vector3(0.02, 0.02, 0.02)
## Island origin, slightly above water so the warmup nodes are inside the
## main camera's frustum on the very first rendered frame.
const WARMUP_POS: Vector3 = Vector3(0.0, 0.1, 0.0)

var _frames_left: int = WARMUP_FRAMES


func _ready() -> void:
	# Instrumentation — helps diagnose "did warmup actually run?" from the
	# browser console. Remove once first-use lag is resolved across builds.
	print("[WARMUP] _ready fired — spawning warmup variants")
	position = WARMUP_POS
	scale = WARMUP_SCALE
	_spawn_warmup_nodes()
	set_process(true)


func _process(_delta: float) -> void:
	_frames_left -= 1
	if _frames_left <= 0:
		print("[WARMUP] complete — freeing")
		set_process(false)
		queue_free()


## Instantiates one of each material variant that gameplay code will use later.
## Adding these to the tree inside the camera frustum forces the Compatibility
## renderer to compile their pipelines during loading, not during first use.
func _spawn_warmup_nodes() -> void:
	_warmup_hp_bar()
	_warmup_additive_billboard_plain()
	_warmup_additive_billboard_textured()
	_warmup_turret_trail()
	_warmup_target_ring()
	_warmup_magic_orb()
	_warmup_one_troop_glb()
	_warmup_flag_glb()
	_warmup_ship_glbs()
	_warmup_ghost_material()
	_warmup_upgrade_outline()
	_warmup_click_indicators()
	# Build the shared AnimationLibrary ONCE at boot so the first troop deployed
	# during an attack skips the "load 5 GLBs + duplicate every track + strip
	# scale/pos tracks" work that otherwise stalls the first landing.
	_prewarm_troop_anim_libraries()
	# Warm every weapon/projectile scene used by _setup_weapons so the FIRST
	# troop of each type doesn't pay a fresh GLB load during disembark.
	_prewarm_weapon_scenes()
	# Fire-bomb explosion textures — if a mage/archer lands their first shot,
	# this avoids 6 synchronous PNG loads on the explosion frame.
	BaseTroop._preload_fire_bomb()
	print("[WARMUP] fire bomb textures preloaded")


## Pre-draws a mesh with BuildingSystem's ghost placement material (unshaded
## + ALPHA + no_depth_test, no billboard). Covers the "green outline appears"
## frame when player first picks a building to place.
func _warmup_ghost_material() -> void:
	var mat := BuildingSystem._get_ghost_material()
	if mat == null:
		print("[WARMUP] ghost material not available — skipped")
		return
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.1, 0.1, 0.1)
	mi.mesh = box
	mi.material_override = mat
	add_child(mi)
	print("[WARMUP] ghost_material OK")


## Pre-draws the range indicator fill/ring materials and the move-arrow
## material used when the player clicks a building. Previously these were
## allocated fresh on every click — first click paid the pipeline compile.
func _warmup_click_indicators() -> void:
	var fill_mat := BuildingSystem._get_range_fill_material()
	var ring_mat := BuildingSystem._get_range_ring_material()
	var arrow_mat := BuildingSystem._get_move_arrow_material()
	if fill_mat == null or ring_mat == null or arrow_mat == null:
		print("[WARMUP] click indicator mats unavailable — skipped")
		return
	# Use a single tiny BoxMesh for all three — we only care about triggering
	# the pipeline compile, not about geometry fidelity.
	for mat in [fill_mat, ring_mat, arrow_mat]:
		var mi := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.05, 0.05, 0.05)
		mi.mesh = box
		mi.material_override = mat
		add_child(mi)
	print("[WARMUP] click indicators OK")


## `material_overlay` triggers a second render pass with its own pipeline
## variant. Without warmup, the first building upgrade click hitches while
## the overlay pipeline compiles for every mesh in the upgraded building.
## We warm it by stacking the overlay on top of a tiny BoxMesh here.
func _warmup_upgrade_outline() -> void:
	var mat := BuildingSystem._get_upgrade_outline_material()
	if mat == null:
		print("[WARMUP] upgrade outline shader missing — skipped")
		return
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.1, 0.1, 0.1)
	mi.mesh = box
	# Main material can be anything opaque — overlay is what we actually
	# care about compiling. Use a basic unshaded fill.
	var base := StandardMaterial3D.new()
	base.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	base.albedo_color = Color(0.5, 0.5, 0.5, 1.0)
	mi.material_override = base
	mi.material_overlay = mat
	add_child(mi)
	print("[WARMUP] upgrade_outline OK")


## Warm Godot's internal load() cache with every weapon/projectile scene used
## by troop subclasses in `_setup_weapons`. Paths mirror the @export defaults
## in knight/mage/barbarian/archer/ranger — keep in sync if those change.
func _prewarm_weapon_scenes() -> void:
	const WEAPON_PATHS: Array[String] = [
		"res://Model/Characters/Assets/sword_1handed.gltf",
		"res://Model/Characters/Assets/staff.gltf",
		"res://Model/Characters/Assets/axe_1handed.gltf",
		"res://Model/Characters/Assets/bow_withString.gltf",
		"res://Model/Characters/Assets/arrow_bow.gltf",
		"res://Model/Characters/Assets/crossbow_1handed.gltf",
		"res://Model/Characters/Assets/arrow_crossbow.gltf",
	]
	var loaded := 0
	for path in WEAPON_PATHS:
		if load(path) != null:
			loaded += 1
	print("[WARMUP] weapon/projectile scenes cached: ", loaded, "/", WEAPON_PATHS.size())


## Parses every troop rig's GLB set into a cached AnimationLibrary. Covers the
## medium rig (used by all 5 current troops) and the skeleton-guard rig. Runs
## off the main attack path so gameplay never pays this cost.
func _prewarm_troop_anim_libraries() -> void:
	var t0 := Time.get_ticks_msec()
	BaseTroop.prewarm_anim_library(BaseTroop.MEDIUM_RIG_ANIM_FILES)
	# Skeleton-guard rig (different cache key — scripts/skeleton_guard.gd).
	BaseTroop.prewarm_anim_library([
		"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	])
	# Tower-archer subset.
	BaseTroop.prewarm_anim_library([
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	])
	print("[WARMUP] anim libraries prewarmed in ", Time.get_ticks_msec() - t0, " ms")


func _warmup_hp_bar() -> void:
	var mi := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(BaseTroop.HP_BAR_W, BaseTroop.HP_BAR_H)
	mi.mesh = quad
	var mat := ShaderMaterial.new()
	mat.shader = BaseTroop._get_hp_shader()
	mat.set_shader_parameter("albedo", Color(0.2, 0.8, 0.2, 0.8))
	mat.set_shader_parameter("bar_size", Vector2(BaseTroop.HP_BAR_W, BaseTroop.HP_BAR_H))
	mi.material_override = mat
	add_child(mi)
	print("[WARMUP] hp_bar OK")


## Additive billboard WITHOUT a texture. Covers the rare variants where the
## material runs without an albedo texture (pure-color glow).
func _warmup_additive_billboard_plain() -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = QuadMesh.new()
	mi.material_override = _make_additive_billboard(null, Color(1.0, 1.0, 1.0, 0.01))
	add_child(mi)
	print("[WARMUP] additive_billboard_plain OK")


## Additive billboard WITH a texture — this is what bs_cannon flash, turret
## muzzle flash, and base_troop fire-bomb explosion ALL use. A textured
## material is a different pipeline variant from an untextured one (Godot
## emits a different GLSL #define). Without this, the first cannon shot still
## hitches even though the "billboard" pipeline is technically warm.
func _warmup_additive_billboard_textured() -> void:
	var tex: Texture2D = null
	# Reuse a texture gameplay will actually use, so we hit the right path.
	var flash_path := "res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_000.png"
	tex = load(flash_path)
	if tex == null:
		print("[WARMUP] flash texture missing — textured billboard skipped")
		return
	var mi := MeshInstance3D.new()
	mi.mesh = QuadMesh.new()
	mi.material_override = _make_additive_billboard(tex, Color(1.5, 1.2, 0.8, 1.0))
	add_child(mi)
	print("[WARMUP] additive_billboard_textured OK")


func _warmup_turret_trail() -> void:
	# Matches turret.gd's _shared_trail_mat exactly — any flag mismatch makes
	# Godot compile a different variant that we never warmed.
	var mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.01
	cyl.bottom_radius = 0.01
	cyl.height = 0.02
	mi.mesh = cyl
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.88, 0.15, 1.0)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.88, 0.15, 1.0)
	mat.emission_energy_multiplier = 6.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.no_depth_test = false
	mi.material_override = mat
	add_child(mi)
	print("[WARMUP] turret_trail OK")


## Covers bs_cannon._spawn_target_ring — unshaded + ALPHA + cull_disabled on
## a TorusMesh, NO billboard, NO additive. Different variant from everything
## else in the warmup set.
func _warmup_target_ring() -> void:
	var mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.02
	torus.outer_radius = 0.3
	torus.rings = 24
	torus.ring_segments = 12
	mi.mesh = torus
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 1.0, 1.0, 0.01)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = mat
	add_child(mi)
	print("[WARMUP] target_ring OK")


## Covers mage.gd's magic_orb.gdshader ShaderMaterial on a SphereMesh.
## Without this, the FIRST mage projectile compiles cold on fire.
func _warmup_magic_orb() -> void:
	var shader: Shader = load("res://shaders/magic_orb.gdshader")
	if shader == null:
		print("[WARMUP] magic_orb shader missing — skipped")
		return
	var mi := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.038
	sphere.height = 0.076
	sphere.radial_segments = 8
	sphere.rings = 4
	mi.mesh = sphere
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("tint", Vector3(0.65, 0.1, 1.0))
	mat.set_shader_parameter("intensity", 2.0)
	# Placeholder noise textures — the shader expects bound samplers, and
	# some drivers stall on unbound sampler reads.
	var img := Image.create(4, 4, false, Image.FORMAT_L8)
	img.fill(Color(0.5, 0.5, 0.5))
	var placeholder := ImageTexture.create_from_image(img)
	mat.set_shader_parameter("noise1", placeholder)
	mat.set_shader_parameter("noise2", placeholder)
	mi.material_override = mat
	add_child(mi)
	print("[WARMUP] magic_orb OK")


func _warmup_one_troop_glb() -> void:
	# Forces the skinned-mesh pipeline variant every troop rig uses.
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var knight_entry: Dictionary = AttackSystem._troop_res_cache.get("Knight", {})
	var model_res: Resource = knight_entry.get("model", null)
	if model_res == null:
		print("[WARMUP] knight GLB missing from cache — skipped")
		return
	var inst: Node3D = model_res.instantiate()
	inst.scale = Vector3(1.0, 1.0, 1.0)
	# Force shadow-casting ON so the shadow-pass pipeline variant is also
	# compiled (DirectionalLight3D in Main.tscn has shadow_enabled=true).
	_force_shadow_casting(inst)
	add_child(inst)
	print("[WARMUP] knight GLB OK")


## Pre-draws the pirate flag marker used by attack_system when a ship is
## placed. Also pre-mutates the animation loop_mode here so the attack-time
## spawn path doesn't trigger Animation resource CoW (re-upload) per flag.
func _warmup_flag_glb() -> void:
	var flag_res: Resource = load("res://Model/flag/pirate_flag_animated.glb")
	if flag_res == null:
		print("[WARMUP] flag GLB missing — skipped")
		return
	var inst: Node3D = flag_res.instantiate()
	inst.scale = Vector3(1.0, 1.0, 1.0)
	_force_shadow_casting(inst)
	add_child(inst)
	# Touch the animation so its loop_mode mutation happens now (during
	# loading), not on first flag spawn (during gameplay).
	var ap := _find_anim_player(inst)
	if ap and ap.has_animation("flag|Action"):
		ap.get_animation("flag|Action").loop_mode = Animation.LOOP_LINEAR
	print("[WARMUP] flag GLB OK")


## Pre-draws one instance of each ship level so the "first cannon-ship
## placement" no longer stalls on shader compile for the ship-hull variant.
func _warmup_ship_glbs() -> void:
	if AttackSystem._ship_model_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var spawned := 0
	for i in range(AttackSystem._ship_model_cache.size()):
		var ship_res: Resource = AttackSystem._ship_model_cache[i]
		if ship_res == null:
			continue
		var inst: Node3D = ship_res.instantiate()
		inst.position = Vector3(0.2 * i, 0.0, 0.0)
		inst.scale = Vector3(1.0, 1.0, 1.0)
		_force_shadow_casting(inst)
		add_child(inst)
		spawned += 1
	print("[WARMUP] ships OK, count=", spawned)


# ─── Helpers ──────────────────────────────────────────────────────────

## Factory for the additive-billboard StandardMaterial3D variant used by
## bs_cannon flash/explosion, turret muzzle flash and fire-bomb explosion.
## Kept as one helper so the warmup variants match runtime flag-for-flag.
static func _make_additive_billboard(tex: Texture2D, color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	if tex:
		mat.albedo_texture = tex
	mat.albedo_color = color
	return mat


## Walks `node`'s descendants and sets `cast_shadow = ON` on every
## MeshInstance3D. Some GLB imports default to SHADOW_CASTING_SETTING_OFF
## per-surface, which means the shadow-pass pipeline variant is never
## exercised at warmup time — then hitches on first attack.
func _force_shadow_casting(node: Node) -> void:
	if node is MeshInstance3D:
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for child in node.get_children():
		_force_shadow_casting(child)


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_anim_player(child)
		if found:
			return found
	return null
