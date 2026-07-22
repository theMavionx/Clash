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

## WebGL2 shader compile is async and can take several rendered frames per
## variant. Keep combat warmup short enough that attack entry is not dominated
## by hidden pre-draw work; the nodes below already exercise each material
## variant on the first few frames.
const HOME_WARMUP_FRAMES: int = 4
const COMBAT_WARMUP_FRAMES: int = 6
const FIRE_DRAGON_PREWARM_REPEAT_FRAMES: Array[int] = [4]
## Sub-pixel scales (< ~0.005) are frustum-culled by both renderers — the draw
## call never reaches the GPU and the pipeline isn't compiled. 0.02 is small
## enough to be invisible against the water/sky but big enough to rasterize.
const WARMUP_SCALE: Vector3 = Vector3(0.02, 0.02, 0.02)
## Island origin, slightly above water so the warmup nodes are inside the
## main camera's frustum on the very first rendered frame.
const WARMUP_POS: Vector3 = Vector3(0.0, 0.1, 0.0)

signal finished

static var _combat_warmup_done: bool = false
static var _combat_warmup_active: bool = false
static var _combat_warmup_node: Node = null

@export_enum("home", "combat") var mode: String = "home"

var _frames_left: int = HOME_WARMUP_FRAMES
var _finished_emitted: bool = false
var _started_ticks: int = 0
var _last_report_ticks: int = 0
var _runtime_warmup_nodes: Array[Node] = []
var _combat_frames_elapsed: int = 0
var _fire_dragon_warmup_inst: Node = null
var _fire_dragon_repeat_index: int = 0
var _includes_combat_warmup: bool = false
var _combat_assets_spawned: bool = false


static func start_combat_warmup(parent: Node) -> Node:
	if _combat_warmup_done:
		return null
	if _combat_warmup_active:
		if is_instance_valid(_combat_warmup_node):
			return _combat_warmup_node
		_combat_warmup_active = false
		_combat_warmup_node = null
	if parent == null or not parent.is_inside_tree():
		return null
	var script: Script = load("res://scripts/warmup.gd")
	if script == null:
		return null
	var node: Node = script.new()
	node.set("mode", "combat")
	parent.add_child(node)
	_combat_warmup_active = true
	_combat_warmup_node = node
	return node


func _ready() -> void:
	_started_ticks = Time.get_ticks_msec()
	_last_report_ticks = _started_ticks
	position = WARMUP_POS
	scale = WARMUP_SCALE
	_includes_combat_warmup = mode == "combat" or (mode == "home" and not _combat_warmup_done)
	print(
		"[WARMUP_PROFILE] start mode=", mode,
		" frames=", COMBAT_WARMUP_FRAMES if _includes_combat_warmup else HOME_WARMUP_FRAMES,
		" includes_combat=", _includes_combat_warmup
	)
	if mode == "combat":
		_frames_left = COMBAT_WARMUP_FRAMES
	else:
		# The first attack used to pay this exact combat setup cost after the
		# clouds closed. Run it once under the initial loading overlay instead.
		# `start_combat_warmup()` still remains the runtime safety fallback.
		_frames_left = HOME_WARMUP_FRAMES
		if _includes_combat_warmup:
			_frames_left = maxi(HOME_WARMUP_FRAMES, COMBAT_WARMUP_FRAMES)
			_combat_warmup_active = true
			_combat_warmup_node = self
		_report_loading_progress(76, "home_warmup_start")
		_spawn_home_warmup_nodes()
		_report_loading_progress(82, "home_warmup_assets")
	set_process(true)


func _process(_delta: float) -> void:
	if _includes_combat_warmup:
		if not _combat_assets_spawned:
			# Some warmup representatives create their own child VFX. Running this
			# one frame after `_ready()` avoids mutating nodes while Godot is still
			# assembling the scene tree.
			_spawn_combat_warmup_nodes()
			_combat_assets_spawned = true
		_combat_frames_elapsed += 1
		var now := Time.get_ticks_msec()
		print(
			"[WARMUP_PROFILE] render_frame frame=", _combat_frames_elapsed,
			"/", COMBAT_WARMUP_FRAMES,
			" frame_ms=", now - _last_report_ticks,
			" total_ms=", now - _started_ticks
		)
		_last_report_ticks = now
		_process_fire_dragon_prewarm_frames()
	_frames_left -= 1
	if mode != "combat":
		var total: int = maxi(HOME_WARMUP_FRAMES, COMBAT_WARMUP_FRAMES) if _includes_combat_warmup else HOME_WARMUP_FRAMES
		total = maxi(1, total)
		var completed: int = total - _frames_left
		if completed < 0:
			completed = 0
		if completed > total:
			completed = total
		var progress: int = 82 + int(round((float(completed) / float(total)) * 6.0))
		_report_loading_progress(progress, "home_warmup_frames")
	if _frames_left <= 0:
		var finished_ticks := Time.get_ticks_msec()
		if _includes_combat_warmup:
			_combat_warmup_done = true
			_combat_warmup_active = false
			_combat_warmup_node = null
		if mode != "combat":
			# Remove every warmup representative before React is allowed to drop
			# the opaque loading cover. queue_free() alone is end-of-frame, which
			# can expose one compiled representative on a fast loader transition.
			visible = false
			_clear_runtime_warmup_nodes()
			_report_loading_progress(88, "home_warmup_done")
		print(
			"[WARMUP_PROFILE] finish mode=", mode,
			" total_ms=", Time.get_ticks_msec() - _started_ticks,
			" render_frames=", _combat_frames_elapsed,
			" cleanup_ms=", Time.get_ticks_msec() - finished_ticks
		)
		if not _finished_emitted:
			_finished_emitted = true
			finished.emit()
		set_process(false)
		queue_free()


## Instantiates one of each material variant that gameplay code will use later.
## Adding these to the tree inside the camera frustum forces the Compatibility
## renderer to compile their pipelines during loading, not during first use.
func _spawn_home_warmup_nodes() -> void:
	_report_loading_progress(77, "home_warmup_grid")
	_warmup_grid_material()
	_report_loading_progress(78, "home_warmup_ghost")
	_warmup_ghost_material()
	_report_loading_progress(79, "home_warmup_outline")
	_warmup_upgrade_outline()
	_report_loading_progress(80, "home_warmup_clicks")
	_warmup_click_indicators()


func _spawn_combat_warmup_nodes() -> void:
	_run_profiled_combat_step("defense_resources", "_warmup_defense_resources")
	_run_profiled_combat_step("hp_bar", "_warmup_hp_bar")
	_run_profiled_combat_step("additive_billboard_plain", "_warmup_additive_billboard_plain")
	_run_profiled_combat_step("additive_billboard_textured", "_warmup_additive_billboard_textured")
	_run_profiled_combat_step("turret_trail", "_warmup_turret_trail")
	_run_profiled_combat_step("target_ring", "_warmup_target_ring")
	_run_profiled_combat_step("rally_marker", "_warmup_rally_marker")
	_run_profiled_combat_step("magic_orb", "_warmup_magic_orb")
	_run_profiled_combat_step("troop_models_and_scripts", "_warmup_one_troop_glb")
	_run_profiled_combat_step("demon_king", "_warmup_demon_king")
	_run_profiled_combat_step("fire_dragon", "_warmup_fire_dragon_attack")
	_run_profiled_combat_step("mage_tower", "_warmup_mage_tower")
	_run_profiled_combat_step("flag", "_warmup_flag_glb")
	_run_profiled_combat_step("ships", "_warmup_ship_glbs")
	_run_profiled_combat_step("troop_animation_libraries", "_prewarm_troop_anim_libraries")
	_run_profiled_combat_step("weapon_scenes", "_prewarm_weapon_scenes")
	_run_profiled_combat_step("fire_bomb", "_warmup_fire_bomb")
	_run_profiled_combat_step("building_destruction", "_warmup_building_destruction")


func _run_profiled_combat_step(step: String, method_name: StringName) -> void:
	var started := Time.get_ticks_msec()
	print(
		"[WARMUP_PROFILE] step_start step=", step,
		" total_ms=", started - _started_ticks
	)
	call(method_name)
	var finished := Time.get_ticks_msec()
	print(
		"[WARMUP_PROFILE] step_done step=", step,
		" step_ms=", finished - started,
		" total_ms=", finished - _started_ticks
	)


func _warmup_defense_resources() -> void:
	BuildingSystem._preload_defense_resources()


func _warmup_fire_bomb() -> void:
	BaseTroop._preload_fire_bomb()


func _report_loading_progress(progress: int, phase: String, meta: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		return
	var now := Time.get_ticks_msec()
	var payload := meta.duplicate()
	payload["mode"] = mode
	payload["ticks_ms"] = now
	payload["warmup_elapsed_ms"] = now - _started_ticks if _started_ticks > 0 else 0
	payload["warmup_dt_ms"] = now - _last_report_ticks if _last_report_ticks > 0 else 0
	payload["frames_left"] = _frames_left
	_last_report_ticks = now
	JavaScriptBridge.eval(
		"if(window.godotLoadingProgress) window.godotLoadingProgress(%d, %s, %s);" %
		[progress, JSON.stringify(phase), JSON.stringify(payload)]
	)


func _warmup_grid_material() -> void:
	var mat := BuildingSystem._get_grid_material()
	if mat == null:
		return
	var mi := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.08, 0.001, 0.08)
	mi.mesh = box
	mi.material_override = mat
	add_child(mi)


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


## Warm Godot's internal load() cache with every weapon/projectile scene used
## by troop subclasses in `_setup_weapons`. Paths mirror the @export defaults
## in knight/mage/archer — keep in sync if those change.
func _prewarm_weapon_scenes() -> void:
	const WEAPON_PATHS: Array[String] = [
		"res://Model/Characters/Assets/sword_1handed.gltf",
		"res://Model/Characters/Assets/staff.gltf",
		"res://Model/Characters/Assets/bow_withString.gltf",
		"res://Model/Characters/Assets/arrow_bow.gltf",
	]
	var loaded := 0
	for path in WEAPON_PATHS:
		if ResourceLoader.load(path, "PackedScene") != null:
			loaded += 1


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


## Additive billboard WITHOUT a texture. Covers the rare variants where the
## material runs without an albedo texture (pure-color glow).
func _warmup_additive_billboard_plain() -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = QuadMesh.new()
	mi.material_override = _make_additive_billboard(null, Color(1.0, 1.0, 1.0, 0.01))
	add_child(mi)


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


## Covers BSRally's four pipeline variants in one pass: the flying grenade
## (UNSHADED + opaque + default cull/blend), the ground ring (UNSHADED +
## ALPHA + MIX blend + cull_disabled), the additive glow core (UNSHADED +
## ALPHA + ADD blend + cull_disabled + no_depth_test), and the spark
## particle (same as core but no_depth_test=false). Without this, the FIRST
## rally drop compiles all four pipelines on the impact frame and lags
## visibly during the grenade flight + impact burst.
func _warmup_rally_marker() -> void:
	# 1) Grenade body — opaque unshaded sphere. Different variant from the
	# additive billboards below because there's no transparency / blend flag.
	var grenade := MeshInstance3D.new()
	var grenade_mesh := SphereMesh.new()
	grenade_mesh.radius = 0.035
	grenade_mesh.height = 0.07
	grenade_mesh.radial_segments = 12
	grenade_mesh.rings = 6
	grenade.mesh = grenade_mesh
	var grenade_mat := StandardMaterial3D.new()
	grenade_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	grenade_mat.albedo_color = Color(0.8, 0.05, 0.03, 1.0)
	grenade.material_override = grenade_mat
	add_child(grenade)
	# 2) Ground ring — torus with alpha-mix material (NOT additive).
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.18
	torus.outer_radius = 0.24
	torus.rings = 32
	torus.ring_segments = 14
	ring.mesh = torus
	var ring_mat := StandardMaterial3D.new()
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	ring_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	ring_mat.no_depth_test = false
	ring_mat.albedo_color = Color(1.0, 0.18, 0.12, 0.9)
	ring.material_override = ring_mat
	add_child(ring)
	# 3) Additive core — small sphere, ADD blend + no_depth_test.
	var core := MeshInstance3D.new()
	var core_mesh := SphereMesh.new()
	core_mesh.radius = 0.065
	core_mesh.height = 0.13
	core_mesh.radial_segments = 16
	core_mesh.rings = 8
	core.mesh = core_mesh
	var core_mat := StandardMaterial3D.new()
	core_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	core_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	core_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	core_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	core_mat.no_depth_test = true
	core_mat.albedo_color = Color(1.0, 0.18, 0.12, 1.0)
	core.material_override = core_mat
	add_child(core)
	# 4) Spark — same flags as the spark material on the rally CPUParticles3D
	# but on a static MeshInstance3D. The rendering pipeline depends on
	# material+mesh, not on whether it's spawned by a particle system, so a
	# static instance is enough to compile the variant.
	var spark := MeshInstance3D.new()
	var spark_mesh := SphereMesh.new()
	spark_mesh.radius = 0.018
	spark_mesh.height = 0.036
	spark_mesh.radial_segments = 8
	spark_mesh.rings = 4
	spark.mesh = spark_mesh
	var spark_mat := StandardMaterial3D.new()
	spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	spark_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	spark_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	spark_mat.no_depth_test = false
	spark_mat.albedo_color = Color(1.0, 0.35, 0.2, 1.0)
	spark.material_override = spark_mat
	add_child(spark)


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


## DemonKing uses a separate FBX body, custom mask-tint shader, and FBX
## animation set. Warm those resources explicitly so the first DemonKing
## deployment does not pay shader/material/model parsing costs mid-attack.
func _warmup_demon_king() -> void:
	var body_res: Resource = ResourceLoader.load("res://Model/Characters/Model/DemonKing_Body.fbx", "PackedScene")
	if body_res == null:
		print("[WARMUP] DemonKing body FBX missing — skipped")
		return
	var inst: Node3D = body_res.instantiate()
	inst.scale = Vector3(1.0, 1.0, 1.0)
	var script_res: Script = ResourceLoader.load("res://scripts/demon_king.gd", "Script")
	if script_res != null:
		# Match the attack-time spawn path (`instantiate` -> `set_script` ->
		# `_ready`) so DemonKing's embedded AnimationPlayer merge and material
		# setup happen during warmup, not on the first landing frame.
		inst.set_script(script_res)
	else:
		_apply_demon_king_material(inst)
	_force_shadow_casting(inst)
	add_child(inst)

	const DEMON_ANIM_FILES: Array[String] = [
		"res://Model/Characters/Animations/DemonKing/DemonKing_Attack01.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_Attack02.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_Die.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_Dizzy.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_GetHit.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_IdleBattle.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_IdleNormal.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_RunFWD.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_SenseSomethingMaint.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_SenseSomethingStart.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_Taunting.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_Victory.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_WalkBWD.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_WalkFWD.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_WalkLFT.fbx",
		"res://Model/Characters/Animations/DemonKing/DemonKing_WalkRGT.fbx",
	]
	var loaded_anims := 0
	for path in DEMON_ANIM_FILES:
		if ResourceLoader.load(path, "PackedScene") != null:
			loaded_anims += 1


## FireDragon swaps FBX scenes at runtime for each animation and creates
## additive fire-breath materials on first attack. Warm the attack clip and
## those exact material flags before the first Dragon reaches a target.
func _warmup_fire_dragon_attack() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("FireDragon", {})
	var model_res: Resource = entry.get("model", null)
	var script_res: Script = entry.get("script", null)
	if model_res == null:
		model_res = ResourceLoader.load("res://Model/Characters/FireDragon/FireDragon.tscn", "PackedScene")
	if script_res == null:
		script_res = ResourceLoader.load("res://scripts/fire_dragon.gd", "Script")
	if model_res == null:
		print("[WARMUP] FireDragon scene missing - skipped")
		return

	var inst: Node3D = (model_res as PackedScene).instantiate()
	inst.name = "WarmupFireDragon"
	if script_res != null:
		inst.set_script(script_res)
	var fire_dragon_scale := AttackSystem._scale_for_troop("FireDragon", 0.1)
	inst.set("_spawn_scale", fire_dragon_scale)
	inst.scale = Vector3(fire_dragon_scale, fire_dragon_scale, fire_dragon_scale)
	_force_shadow_casting(inst)
	add_child(inst)
	if inst.has_method("_play_dragon_animation"):
		inst.call("_play_dragon_animation", "fly_fire_breath_attack_low", true)
	if inst.has_method("prewarm_fire_breath_vfx"):
		inst.call("prewarm_fire_breath_vfx")
	_fire_dragon_warmup_inst = inst
	_warmup_fire_dragon_breath_materials()


func _process_fire_dragon_prewarm_frames() -> void:
	if _fire_dragon_warmup_inst == null or not is_instance_valid(_fire_dragon_warmup_inst):
		return
	if _fire_dragon_repeat_index >= FIRE_DRAGON_PREWARM_REPEAT_FRAMES.size():
		return
	var frame_target: int = int(FIRE_DRAGON_PREWARM_REPEAT_FRAMES[_fire_dragon_repeat_index])
	if _combat_frames_elapsed < frame_target:
		return
	var started := Time.get_ticks_msec()
	print("[WARMUP_PROFILE] dragon_repeat_start frame=", _combat_frames_elapsed, " total_ms=", started - _started_ticks)
	if _fire_dragon_warmup_inst.has_method("prewarm_fire_breath_vfx"):
		_fire_dragon_warmup_inst.call("prewarm_fire_breath_vfx")
	print("[WARMUP_PROFILE] dragon_repeat_done frame=", _combat_frames_elapsed, " step_ms=", Time.get_ticks_msec() - started)
	_fire_dragon_repeat_index += 1


func _warmup_fire_dragon_breath_materials() -> void:
	var breath: Texture2D = ResourceLoader.load("res://Model/Characters/FireDragon/Textures/fx_fire_breath.tga", "Texture2D")
	if breath == null:
		print("[WARMUP] FireDragon breath textures incomplete - skipped")
		return

	if OS.has_feature("web"):
		_spawn_warmup_fire_dragon_cpu_particles(breath)
		return

	var flame_particles := GPUParticles3D.new()
	flame_particles.name = "WarmupFireDragonFlameParticles"
	flame_particles.amount = 46
	flame_particles.lifetime = 0.74
	flame_particles.one_shot = true
	flame_particles.explosiveness = 0.48
	flame_particles.randomness = 0.62
	flame_particles.fixed_fps = 24
	flame_particles.interpolate = true
	flame_particles.local_coords = true
	flame_particles.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	var flame_mesh := QuadMesh.new()
	flame_mesh.size = Vector2(0.13, 0.16)
	flame_mesh.material = _make_particle_billboard_material(breath, Color(1.0, 0.92, 0.22, 0.84), true)
	flame_particles.draw_passes = 1
	flame_particles.set_draw_pass_mesh(0, flame_mesh)
	var flame_process := ParticleProcessMaterial.new()
	flame_process.direction = Vector3(0.0, 1.0, 0.0)
	flame_process.spread = 5.2
	flame_process.gravity = Vector3.ZERO
	flame_process.initial_velocity_min = 0.72
	flame_process.initial_velocity_max = 1.16
	flame_process.lifetime_randomness = 0.22
	flame_process.scale_min = 0.32
	flame_process.scale_max = 1.00
	flame_process.angle_min = -90.0
	flame_process.angle_max = 90.0
	flame_process.angular_velocity_min = -130.0
	flame_process.angular_velocity_max = 130.0
	flame_process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	flame_process.emission_sphere_radius = 0.03
	flame_particles.process_material = flame_process
	add_child(flame_particles)
	flame_particles.restart()

	var trail_particles := GPUParticles3D.new()
	trail_particles.name = "WarmupFireDragonTrailParticles"
	trail_particles.amount = 16
	trail_particles.lifetime = 0.52
	trail_particles.one_shot = true
	trail_particles.explosiveness = 0.86
	trail_particles.randomness = 0.76
	trail_particles.fixed_fps = 20
	trail_particles.interpolate = true
	trail_particles.local_coords = true
	trail_particles.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	var trail_mesh := QuadMesh.new()
	trail_mesh.size = Vector2(0.10, 0.09)
	trail_mesh.material = _make_particle_billboard_material(breath, Color(1.0, 0.82, 0.14, 0.46), true)
	trail_particles.draw_passes = 1
	trail_particles.set_draw_pass_mesh(0, trail_mesh)
	var trail_process := ParticleProcessMaterial.new()
	trail_process.direction = Vector3(0.0, 1.0, 0.0)
	trail_process.spread = 14.0
	trail_process.gravity = Vector3.ZERO
	trail_process.initial_velocity_min = 0.05
	trail_process.initial_velocity_max = 0.18
	trail_process.lifetime_randomness = 0.28
	trail_process.scale_min = 0.38
	trail_process.scale_max = 1.10
	trail_process.angle_min = -100.0
	trail_process.angle_max = 100.0
	trail_process.angular_velocity_min = -110.0
	trail_process.angular_velocity_max = 110.0
	trail_process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	trail_process.emission_box_extents = Vector3(0.04, 0.18, 0.03)
	trail_particles.process_material = trail_process
	add_child(trail_particles)
	trail_particles.restart()

	_spawn_warmup_fire_dragon_cpu_particles(breath)
	_spawn_warmup_fire_dragon_light()


func _spawn_warmup_fire_dragon_cpu_particles(breath: Texture2D) -> void:
	var cpu_particles := CPUParticles3D.new()
	cpu_particles.name = "WarmupFireDragonCpuParticles"
	cpu_particles.amount = 16
	cpu_particles.lifetime = 0.52
	cpu_particles.one_shot = true
	cpu_particles.explosiveness = 0.86
	cpu_particles.randomness = 0.76
	cpu_particles.local_coords = true
	cpu_particles.direction = Vector3(0.0, 1.0, 0.0)
	cpu_particles.spread = 14.0
	cpu_particles.gravity = Vector3.ZERO
	cpu_particles.initial_velocity_min = 0.05
	cpu_particles.initial_velocity_max = 0.18
	cpu_particles.color = Color(1.0, 0.82, 0.14, 0.46)
	cpu_particles.scale_amount_min = 0.38
	cpu_particles.scale_amount_max = 1.10
	cpu_particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	cpu_particles.emission_box_extents = Vector3(0.04, 0.18, 0.03)
	var cpu_mesh := QuadMesh.new()
	cpu_mesh.size = Vector2(0.10, 0.09)
	cpu_mesh.material = _make_particle_billboard_material(breath, Color(1.0, 0.82, 0.14, 0.46), true)
	cpu_particles.mesh = cpu_mesh
	add_child(cpu_particles)
	cpu_particles.restart()


func _spawn_warmup_fire_dragon_light() -> void:
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.76, 0.12)
	light.light_energy = 0.4
	light.omni_range = 0.5
	add_child(light)


## Mage Tower is an FBX with runtime-applied albedo/emission textures and a
## distinct solid-blue orb material. Warm both the building model pipeline and
## the projectile material before the first tower is placed or fires.
func _warmup_mage_tower() -> void:
	var tower_res: Resource = ResourceLoader.load("res://Model/MageTower/1.fbx", "PackedScene")
	if tower_res == null:
		print("[WARMUP] MageTower FBX missing — skipped")
		return
	var tower: Node3D = tower_res.instantiate()
	tower.scale = Vector3(1.0, 1.0, 1.0)
	_apply_mage_tower_material(tower)
	_force_shadow_casting(tower)
	add_child(tower)

	# Cache the runtime script without attaching it here; the projectile material
	# below covers the visible shader variant without spawning pooled scene nodes.
	ResourceLoader.load("res://scripts/tower_mage.gd", "Script")

	var orb := MeshInstance3D.new()
	var orb_mesh := SphereMesh.new()
	orb_mesh.radius = 0.05
	orb_mesh.height = 0.10
	orb_mesh.radial_segments = 8
	orb_mesh.rings = 4
	orb.mesh = orb_mesh
	var orb_mat := StandardMaterial3D.new()
	orb_mat.albedo_color = Color(0.2, 0.6, 1.0)
	orb_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	orb_mat.emission_enabled = true
	orb_mat.emission = Color(0.2, 0.6, 1.0)
	orb_mat.emission_energy_multiplier = 2.0
	orb.material_override = orb_mat
	add_child(orb)
	_warmup_mage_tower_beam_visuals()


func _warmup_mage_tower_beam_visuals() -> void:
	var glow := _make_mage_tower_beam_cylinder(0.030, _make_mage_tower_beam_material(Color(0.15, 0.65, 1.0, 0.30), 2.0))
	var core := _make_mage_tower_beam_cylinder(0.010, _make_mage_tower_beam_material(Color(0.45, 0.90, 1.0, 0.95), 4.0))
	var impact := _make_mage_tower_impact_sphere(_make_mage_tower_beam_material(Color(0.55, 0.85, 1.0, 0.85), 5.0))
	glow.position = Vector3(0.12, 0.0, 0.0)
	core.position = Vector3(0.18, 0.0, 0.0)
	impact.position = Vector3(0.24, 0.0, 0.0)
	add_child(glow)
	add_child(core)
	add_child(impact)


func _make_mage_tower_beam_material(color: Color, energy: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = energy
	return mat


func _make_mage_tower_beam_cylinder(radius: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.height = 0.5
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.radial_segments = 12
	mesh.rings = 1
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


func _make_mage_tower_impact_sphere(mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = 0.045
	mesh.height = 0.090
	mesh.radial_segments = 12
	mesh.rings = 6
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


## Pre-draws the pirate flag marker used by attack_system when a ship is
## placed. It also starts the waving animation and runs the real marker spawn
## path once so the first player click does not pay the AnimationPlayer setup.
func _warmup_flag_glb() -> void:
	var flag_res: Resource = ResourceLoader.load("res://Model/flag/pirate_flag_animated.glb", "PackedScene")
	if flag_res == null:
		print("[WARMUP] flag GLB missing — skipped")
		return
	var inst: Node3D = flag_res.instantiate()
	inst.scale = Vector3(1.0, 1.0, 1.0)
	_force_shadow_casting(inst)
	add_child(inst)
	_warmup_flag_animation(inst)

	var attack_system := _find_attack_system()
	if attack_system and attack_system.has_method("prewarm_flag_marker"):
		var marker = attack_system.call("prewarm_flag_marker")
		if marker is Node:
			_runtime_warmup_nodes.append(marker)


## Pre-draws one instance of each ship level so the "first cannon-ship
## placement" no longer stalls on shader compile for the ship-hull variant.
func _warmup_ship_glbs() -> void:
	AttackSystem._preload_ship_resources()
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


func _warmup_building_destruction() -> void:
	if not BaseTroop._fire_bomb_textures.is_empty():
		var explosion := MeshInstance3D.new()
		var quad := QuadMesh.new()
		quad.size = Vector2(BaseTroop.FIRE_BOMB_SCALE, BaseTroop.FIRE_BOMB_SCALE)
		explosion.mesh = quad
		explosion.position = Vector3(0.0, 0.15, 0.0)
		explosion.material_override = _make_additive_billboard(BaseTroop._fire_bomb_textures[0], Color.WHITE)
		add_child(explosion)

	if BuildingSystem._ruins_res == null:
		var cached = BuildingSystem._scene_res_cache.get(BuildingSystem.RUINS_MODEL, null)
		if cached == null:
			cached = BuildingSystem._load_packed_scene_resource(BuildingSystem.RUINS_MODEL)
			if cached != null:
				BuildingSystem._scene_res_cache[BuildingSystem.RUINS_MODEL] = cached
		BuildingSystem._ruins_res = cached

	var ruins_res: PackedScene = BuildingSystem._ruins_res as PackedScene
	if ruins_res == null:
		return
	var ruins := ruins_res.instantiate() as Node3D
	if ruins == null:
		return
	ruins.scale = WARMUP_SCALE
	ruins.position = Vector3(0.08, 0.0, 0.0)
	_force_shadow_casting(ruins)
	add_child(ruins)


func _warmup_flag_animation(root: Node) -> void:
	var ap := _find_anim_player(root)
	if ap == null:
		return
	var anim_name := "flag|Action"
	if not ap.has_animation(anim_name):
		var anims := ap.get_animation_list()
		if anims.is_empty():
			return
		anim_name = String(anims[0])
	var anim := ap.get_animation(anim_name)
	if anim != null:
		anim.loop_mode = Animation.LOOP_LINEAR
	ap.speed_scale = 0.4
	ap.play(anim_name)
	ap.advance(0.033)


func _find_attack_system() -> Node:
	var scene := get_tree().current_scene
	if scene == null:
		return null
	var attack_system := scene.get_node_or_null("AttackSystem")
	if attack_system != null:
		return attack_system
	return _find_named_node(scene, "AttackSystem")


func _find_named_node(node: Node, target_name: String) -> Node:
	if node.name == target_name:
		return node
	for child in node.get_children():
		var found := _find_named_node(child, target_name)
		if found != null:
			return found
	return null


func _clear_runtime_warmup_nodes() -> void:
	for node in _runtime_warmup_nodes:
		if is_instance_valid(node):
			node.queue_free()
	_runtime_warmup_nodes.clear()


# ─── Helpers ──────────────────────────────────────────────────────────

## Factory for the additive-billboard StandardMaterial3D variant used by
## bs_cannon flash/explosion, turret muzzle flash and fire-bomb explosion.
## Kept as one helper so the warmup variants match runtime flag-for-flag.
static func _make_additive_billboard(tex: Texture2D, color: Color) -> StandardMaterial3D:
	return _make_additive_material(tex, color, true)


static func _make_additive_material(tex: Texture2D, color: Color, billboard: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED if billboard else BaseMaterial3D.BILLBOARD_DISABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	if tex:
		mat.albedo_texture = tex
	mat.albedo_color = color
	return mat


static func _make_particle_billboard_material(tex: Texture2D, color: Color, additive: bool) -> StandardMaterial3D:
	var mat := _make_additive_material(tex, color, true)
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if additive else BaseMaterial3D.BLEND_MODE_MIX
	mat.vertex_color_use_as_albedo = true
	return mat


func _apply_demon_king_material(root: Node) -> void:
	var shader: Shader = ResourceLoader.load("res://shaders/demon_mask_tint.gdshader", "Shader")
	var albedo: Texture2D = ResourceLoader.load("res://Model/Characters/Model/DemonKing_mask_albedo.png", "Texture2D")
	var emission: Texture2D = ResourceLoader.load("res://Model/Characters/Model/DemonKing_emission.png", "Texture2D")
	var mask01: Texture2D = ResourceLoader.load("res://Model/Characters/Model/DemonKing_mask01.png", "Texture2D")
	var mask02: Texture2D = ResourceLoader.load("res://Model/Characters/Model/DemonKing_mask02.png", "Texture2D")
	var mask03: Texture2D = ResourceLoader.load("res://Model/Characters/Model/DemonKing_mask03.png", "Texture2D")
	if shader == null or albedo == null or emission == null or mask01 == null or mask02 == null or mask03 == null:
		print("[WARMUP] DemonKing material resources incomplete — shader warm skipped")
		return
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("albedo", albedo)
	mat.set_shader_parameter("emission_tex", emission)
	mat.set_shader_parameter("mask01", mask01)
	mat.set_shader_parameter("mask02", mask02)
	mat.set_shader_parameter("mask03", mask03)
	var palette: Array[Color] = [
		Color(0.91, 0.16, 0.55),
		Color(0.97, 0.13, 0.45),
		Color(0.71, 0.06, 0.40),
		Color(0.85, 0.28, 0.62),
		Color(0.88, 0.21, 0.50),
		Color(0.78, 0.28, 0.55),
		Color(1.00, 0.17, 0.60),
		Color(0.36, 0.36, 0.36),
		Color(0.95, 0.70, 0.85),
	]
	for i in 9:
		mat.set_shader_parameter("color%02d" % (i + 1), palette[i])
	_assign_surface_material_recursive(root, mat)


func _apply_mage_tower_material(root: Node) -> void:
	var albedo: Texture2D = ResourceLoader.load("res://Model/MageTower/mage_tower_albedo.png", "Texture2D")
	if albedo == null:
		print("[WARMUP] MageTower albedo missing — material warm skipped")
		return
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = albedo
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	var emission: Texture2D = ResourceLoader.load("res://Model/MageTower/mage_tower_emit.png", "Texture2D")
	if emission != null:
		mat.emission_enabled = true
		mat.emission_texture = emission
		mat.emission_energy_multiplier = 1.2
	_assign_surface_material_recursive(root, mat)


func _assign_surface_material_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var count: int = mi.mesh.get_surface_count() if mi.mesh else 0
		for i in count:
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_assign_surface_material_recursive(child, mat)


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
