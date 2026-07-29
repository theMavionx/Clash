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
## Island startup only warms the small set needed to reveal the home scene.
## Combat representatives render into an unpresented SubViewport after the
## island is interactive. Idle rendering is submitted once per paced step, so
## representatives never appear on screen and the hidden viewport does not
## keep consuming frames between compilation steps.
##
## Placed in Main.tscn — runs once when the island loads, before the first
## attack starts.

## WebGL2 shader compile is async and can take several rendered frames per
## variant. Keep combat warmup short enough that attack entry is not dominated
## by hidden pre-draw work; the nodes below already exercise each material
## variant on the first few frames.
const HOME_WARMUP_FRAMES: int = 4
const COMBAT_WARMUP_FRAMES: int = 6
const COMBAT_IDLE_SETTLE_MSEC: int = 1200
const COMBAT_IDLE_STEP_INTERVAL_MSEC: int = 450
const COMBAT_IDLE_RENDER_INTERVAL_MSEC: int = 180
const STARTUP_LOADOUT_REQUEST_GRACE_MSEC: int = 1500
const COMBAT_VIEWPORT_SIZE: Vector2i = Vector2i(64, 64)
const STARTUP_COMMON_STEP_NAMES: Array[String] = [
	"defense_resources",
	"hp_bar",
	"additive_billboard_plain",
	"additive_billboard_textured",
	"turret_trail",
	"building_cannon",
	"target_ring",
	"rally_marker",
	"mage_tower",
	"fire_bomb",
	"building_destruction",
]
const COMBAT_STEP_NAMES: Array[String] = [
	"defense_resources",
	"hp_bar",
	"additive_billboard_plain",
	"additive_billboard_textured",
	"turret_trail",
	"building_cannon",
	"target_ring",
	"rally_marker",
	"magic_orb",
	"troop_models_and_scripts",
	"mimic",
	"demon_king",
	"fire_dragon",
	"necromancer",
	"horror_evolution",
	"mechanical_dragon",
	"ice_golem",
	"wind_mage",
	"pea_shooter",
	"ship_cannon",
	"ship_freeze",
	"ship_medkit",
	"ship_rage",
	"skeleton_barrel",
	"mage_tower",
	"flag",
	"ships",
	"troop_animation_libraries",
	"troop_crowd_poses",
	"weapon_scenes",
	"fire_bomb",
	"building_destruction",
]
const COMBAT_STEP_METHODS: Array[StringName] = [
	&"_warmup_defense_resources",
	&"_warmup_hp_bar",
	&"_warmup_additive_billboard_plain",
	&"_warmup_additive_billboard_textured",
	&"_warmup_turret_trail",
	&"_warmup_building_cannon",
	&"_warmup_target_ring",
	&"_warmup_rally_marker",
	&"_warmup_magic_orb",
	&"_warmup_one_troop_glb",
	&"_warmup_mimic",
	&"_warmup_demon_king",
	&"_warmup_fire_dragon_attack",
	&"_warmup_necromancer",
	&"_warmup_horror_evolution",
	&"_warmup_mechanical_dragon",
	&"_warmup_ice_golem",
	&"_warmup_wind_mage",
	&"_warmup_pea_shooter",
	&"_warmup_ship_cannon",
	&"_warmup_ship_freeze",
	&"_warmup_ship_medkit",
	&"_warmup_ship_rage",
	&"_warmup_skeleton_barrel",
	&"_warmup_mage_tower",
	&"_warmup_flag_glb",
	&"_warmup_ship_glbs",
	&"_prewarm_troop_anim_libraries",
	&"_prewarm_troop_crowd_poses",
	&"_prewarm_weapon_scenes",
	&"_warmup_fire_bomb",
	&"_warmup_building_destruction",
]
const HEAVY_LOADOUT_GPU_STEP_NAMES: Array[String] = [
	"troop_models_and_scripts",
	"mimic",
	"demon_king",
	"fire_dragon",
	"necromancer",
	"horror_evolution",
	"mechanical_dragon",
	"ice_golem",
	"wind_mage",
	"pea_shooter",
]
const FIRE_DRAGON_PREWARM_REPEAT_FRAMES: Array[int] = [4]
const MECHANICAL_DRAGON_PREWARM_PHASES: Array[float] = [
	0.08,
	0.24,
	0.42,
	0.52,
	0.70,
	0.88,
]
const NECROMANCER_SUMMON_PREWARM_PHASES: Array[float] = [
	0.0,
	0.18,
	0.42,
	0.68,
	0.86,
	1.0,
]
const WIND_MAGE_PREWARM_PHASES: Array[float] = [
	0.08,
	0.28,
	0.52,
	0.72,
	0.92,
]
const PEA_SHOOTER_PREWARM_PHASES: Array[float] = [
	0.08,
	0.22,
	0.50,
	0.78,
	0.94,
]
const BUILDING_CANNON_SCENE_PATHS: Array[String] = [
	"res://Model/cannons/level_01/cannon_level_01.tscn",
	"res://Model/cannons/level_02/cannon_level_02.tscn",
	"res://Model/cannons/level_03/cannon_level_03.tscn",
	"res://Model/cannons/level_04/cannon_level_04.tscn",
	"res://Model/cannons/level_05/cannon_level_05.tscn",
	"res://Model/cannons/level_06/cannon_level_06.tscn",
	"res://Model/cannons/level_07/cannon_level_07.tscn",
]
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
static var _island_startup_warmup_done: bool = false
static var _combat_idle_requested: bool = false
static var _combat_idle_parent: Node = null
static var _combat_requested_troops: Array[String] = []
static var _combat_requested_troop_counts: Dictionary = {}
static var _combat_scope_restricted: bool = false
static var _combat_loadout_request_pending: bool = false
static var _combat_loadout_request_resolved: bool = false
static var _island_common_warmup_done: bool = false
static var _island_common_warmup_node: Node = null
static var _startup_loadout_gpu_warmup_done: bool = false


static func is_combat_profile_ready() -> bool:
	return (
		_island_startup_warmup_done
		and _combat_warmup_done
		and not _combat_warmup_active
		and not is_instance_valid(_island_common_warmup_node)
	)

@export_enum("home", "startup_common", "startup_loadout_gpu", "combat_idle", "combat") var mode: String = "home"

var _frames_left: int = HOME_WARMUP_FRAMES
var _finished_emitted: bool = false
var _started_ticks: int = 0
var _last_report_ticks: int = 0
var _runtime_warmup_nodes: Array[Node] = []
var _combat_frames_elapsed: int = 0
var _fire_dragon_warmup_inst: Node = null
var _fire_dragon_repeat_index: int = 0
var _mechanical_dragon_warmup_player: AnimationPlayer = null
var _mechanical_dragon_phase_index: int = 0
var _necromancer_warmup_inst: Node = null
var _necromancer_phase_index: int = 0
var _wind_mage_warmup_player: AnimationPlayer = null
var _wind_mage_phase_index: int = 0
var _pea_shooter_warmup_player: AnimationPlayer = null
var _pea_shooter_phase_index: int = 0
var _animation_sample_jobs: Array[Dictionary] = []
var _crowd_pose_baker: TroopCrowdBatch = null
var _includes_combat_warmup: bool = false
var _combat_execution_started: bool = false
var _combat_step_index: int = 0
var _combat_post_frames: int = 0
var _last_combat_step_finished_ticks: int = 0
var _idle_interactive_ticks: int = 0
var _warmup_host_viewport: SubViewport = null
var _requested_troop_names: Array[String] = []
var _requested_troop_counts: Dictionary = {}
var _combat_render_step_indices: Array[int] = []
var _combat_preload_troops: Array[String] = []
var _restrict_to_requested_troops: bool = false
var _startup_loadout_wait_ticks: int = 0
var _resource_preload_already_satisfied: bool = false
var _protected_crowd_pose_troop: String = ""


static func begin_combat_idle_warmup_request(parent: Node) -> void:
	if _combat_warmup_done:
		return
	_combat_loadout_request_pending = true
	_combat_loadout_request_resolved = false
	if parent != null and parent.is_inside_tree():
		_combat_idle_parent = parent


static func cancel_combat_idle_warmup_request() -> void:
	_combat_loadout_request_pending = false
	_combat_loadout_request_resolved = true


static func request_combat_idle_warmup(parent: Node, troop_names: Array = []) -> Node:
	_combat_idle_requested = true
	_combat_loadout_request_pending = false
	_combat_loadout_request_resolved = true
	_combat_scope_restricted = true
	_merge_requested_troops(troop_names)
	_sync_active_requested_troops()
	if parent != null and parent.is_inside_tree():
		_combat_idle_parent = parent
	if _combat_warmup_done:
		return null
	if _combat_warmup_active and is_instance_valid(_combat_warmup_node):
		return _combat_warmup_node
	if _island_startup_warmup_done:
		# A session/loadout often resolves after the island is already visible.
		# Continue through the paced hidden idle mode instead of deferring all
		# model and shader work to the first battle. This mode submits only one
		# warmup step at a time and leaves the presented viewport interactive.
		return _create_hidden_combat_warmup(
			_combat_idle_parent if is_instance_valid(_combat_idle_parent) else parent,
			"combat_idle"
		)
	return null


static func start_combat_warmup(parent: Node, troop_names: Array = []) -> Node:
	_merge_requested_troops(troop_names)
	_sync_active_requested_troops()
	if _combat_warmup_done:
		return null
	if _combat_warmup_active:
		if is_instance_valid(_combat_warmup_node):
			if _combat_warmup_node.has_method("_promote_to_blocking_combat"):
				_combat_warmup_node.call("_promote_to_blocking_combat")
			return _combat_warmup_node
		_combat_warmup_active = false
		_combat_warmup_node = null
	return _create_hidden_combat_warmup(parent, "combat")


static func _create_hidden_combat_warmup(parent: Node, requested_mode: String) -> Node:
	return _create_hidden_warmup(parent, requested_mode, true)


static func _create_hidden_warmup(parent: Node, requested_mode: String, track_combat: bool) -> Node:
	if parent == null or not parent.is_inside_tree():
		return null
	var script: Script = load("res://scripts/warmup.gd")
	if script == null:
		return null

	var viewport := SubViewport.new()
	viewport.name = "CombatIdleWarmupViewport"
	viewport.size = COMBAT_VIEWPORT_SIZE
	viewport.own_world_3d = true
	viewport.transparent_bg = false
	viewport.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	viewport.render_target_update_mode = (
		SubViewport.UPDATE_DISABLED
		if requested_mode == "combat_idle"
		else SubViewport.UPDATE_ALWAYS
	)
	var world_root := Node3D.new()
	world_root.name = "CombatIdleWarmupWorld"
	viewport.add_child(world_root)

	var camera := Camera3D.new()
	camera.name = "CombatIdleWarmupCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 0.28
	camera.position = Vector3(0.0, 0.20, 0.72)
	camera.look_at_from_position(camera.position, Vector3(0.0, 0.04, 0.0))
	world_root.add_child(camera)
	camera.current = true

	var light := DirectionalLight3D.new()
	light.name = "CombatIdleWarmupLight"
	light.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	light.light_energy = 1.0
	light.shadow_enabled = not OS.has_feature("web")
	world_root.add_child(light)

	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.08, 0.10, 0.14)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.72, 0.78, 0.88)
	environment.ambient_light_energy = 0.65
	world_environment.environment = environment
	world_root.add_child(world_environment)

	var node: Node = script.new()
	node.set("mode", requested_mode)
	node.set("_warmup_host_viewport", viewport)
	node.set("_requested_troop_names", _combat_requested_troops.duplicate())
	node.set("_requested_troop_counts", _combat_requested_troop_counts.duplicate())
	node.set("_restrict_to_requested_troops", _combat_scope_restricted)
	node.set(
		"_resource_preload_already_satisfied",
		requested_mode == "combat_idle" and _startup_loadout_gpu_warmup_done
	)
	world_root.add_child(node)
	parent.add_child(viewport)
	if track_combat:
		_combat_warmup_active = true
		_combat_warmup_node = node
	else:
		_island_common_warmup_node = node
	return node


static func _merge_requested_troops(troop_names: Array) -> void:
	var request_counts: Dictionary = {}
	var request_order: Array[String] = []
	for raw_value in troop_names:
		var troop_name := str(raw_value).split(":", false, 1)[0].strip_edges()
		if troop_name == "" or troop_name.begins_with("_"):
			continue
		request_counts[troop_name] = int(request_counts.get(troop_name, 0)) + 1
		if not request_order.has(troop_name):
			request_order.append(troop_name)
	if request_counts.is_empty():
		return
	# A request describes the current ship or upcoming battle, not an additive
	# asset wishlist. Replacing stale types keeps the bounded pose cache focused
	# on the army that can actually enter combat.
	_combat_requested_troops = request_order
	_combat_requested_troop_counts = request_counts


static func _sync_active_requested_troops() -> void:
	if not is_instance_valid(_combat_warmup_node):
		return
	_combat_warmup_node.set(
		"_requested_troop_names",
		_combat_requested_troops.duplicate()
	)
	_combat_warmup_node.set(
		"_requested_troop_counts",
		_combat_requested_troop_counts.duplicate()
	)
	_combat_warmup_node.set("_restrict_to_requested_troops", _combat_scope_restricted)


func _ready() -> void:
	_started_ticks = Time.get_ticks_msec()
	_last_report_ticks = _started_ticks
	position = WARMUP_POS
	scale = WARMUP_SCALE
	_includes_combat_warmup = mode != "home"
	if _includes_combat_warmup:
		if mode == "startup_common":
			_combat_preload_troops = []
		else:
			_combat_preload_troops = (
				_requested_troop_names.duplicate()
				if _restrict_to_requested_troops
				else AttackSystem.ACTIVE_PRELOAD_TROOPS.duplicate()
			)
		_combat_render_step_indices = _build_combat_render_step_indices()
	print(
		"[WARMUP_PROFILE] start mode=", mode,
		" frames=", COMBAT_WARMUP_FRAMES if _includes_combat_warmup else HOME_WARMUP_FRAMES,
		" includes_combat=", _includes_combat_warmup
	)
	if _includes_combat_warmup:
		_frames_left = COMBAT_WARMUP_FRAMES
		_report_combat_idle_state("waiting")
	else:
		_frames_left = HOME_WARMUP_FRAMES
		if not _island_common_warmup_done and not is_instance_valid(_island_common_warmup_node):
			call_deferred("_start_startup_common_warmup")
		_report_loading_progress(76, "home_warmup_start")
		_spawn_home_warmup_nodes()
		_report_loading_progress(82, "home_warmup_assets")
	set_process(true)


func _start_startup_common_warmup() -> void:
	if _island_common_warmup_done or is_instance_valid(_island_common_warmup_node):
		return
	var parent := get_parent()
	if parent == null or not parent.is_inside_tree():
		push_warning("Island startup warmup skipped: scene parent is unavailable")
		_island_common_warmup_done = true
		return
	var common_warmup := _create_hidden_warmup(parent, "startup_common", false)
	if not is_instance_valid(common_warmup):
		push_warning("Island startup warmup skipped: hidden viewport could not be created")
		_island_common_warmup_done = true


func _process(_delta: float) -> void:
	if _includes_combat_warmup:
		_process_combat_warmup()
		return

	if _frames_left > 0:
		_frames_left -= 1
	var total: int = maxi(1, HOME_WARMUP_FRAMES)
	var completed: int = clampi(total - _frames_left, 0, total)
	var progress: int = 82 + int(round((float(completed) / float(total)) * 6.0))
	_report_loading_progress(progress, "home_warmup_frames")
	if _frames_left <= 0:
		if not _island_common_warmup_done:
			return
		if _combat_warmup_active:
			return
		if (
			_combat_idle_requested
			and not _startup_loadout_gpu_warmup_done
			and not _combat_requested_troops.is_empty()
		):
			var gpu_warmup := _create_hidden_combat_warmup(
				_combat_idle_parent if is_instance_valid(_combat_idle_parent) else get_parent(),
				"startup_loadout_gpu"
			)
			if is_instance_valid(gpu_warmup):
				_report_loading_progress(
					89,
					"combat_loadout_warmup_start",
					{"troops": _combat_requested_troops.duplicate()}
				)
				return
			push_warning("Startup loadout GPU warmup skipped: hidden viewport could not be created")
		if _combat_loadout_request_pending and not _combat_loadout_request_resolved:
			if _startup_loadout_wait_ticks <= 0:
				_startup_loadout_wait_ticks = Time.get_ticks_msec()
				_report_loading_progress(88, "combat_loadout_waiting")
			if Time.get_ticks_msec() - _startup_loadout_wait_ticks < STARTUP_LOADOUT_REQUEST_GRACE_MSEC:
				return
			print(
				"[WARMUP_PROFILE] startup_loadout_request_timeout wait_ms=",
				Time.get_ticks_msec() - _startup_loadout_wait_ticks
			)
			_combat_loadout_request_pending = false
		_island_startup_warmup_done = true
		_report_loading_progress(88, "home_warmup_done")
		print(
			"[WARMUP_PROFILE] finish mode=", mode,
			" total_ms=", Time.get_ticks_msec() - _started_ticks,
			" render_frames=0 cleanup_ms=0"
		)
		if (
			_combat_idle_requested
			and not _combat_warmup_done
			and not _combat_warmup_active
		):
			var idle_warmup := _create_hidden_combat_warmup(
				_combat_idle_parent if is_instance_valid(_combat_idle_parent) else get_parent(),
				"combat_idle"
			)
			if not is_instance_valid(idle_warmup):
				push_warning("Combat idle warmup skipped: hidden viewport could not be created")
		_finish_warmup_node()


func _process_combat_warmup() -> void:
	if not _combat_execution_started:
		if mode == "combat_idle" and not _idle_window_is_ready():
			return
		_combat_execution_started = true
		_last_combat_step_finished_ticks = Time.get_ticks_msec()
		print(
			"[WARMUP_PROFILE] combat_execution_start mode=", mode,
			" idle_delay_ms=", _last_combat_step_finished_ticks - _started_ticks,
			" hidden_viewport=", _warmup_host_viewport != null
		)
		_report_combat_idle_state("running")

	var preload_step_count: int = 0
	if not _skip_incremental_resource_preload():
		preload_step_count = AttackSystem.SHIP_MODELS.size() + _combat_preload_troops.size()
	var total_step_count: int = preload_step_count + _combat_render_step_indices.size()
	if _combat_step_index < total_step_count:
		var now := Time.get_ticks_msec()
		if (
			mode == "combat_idle"
			and now - _last_combat_step_finished_ticks < COMBAT_IDLE_STEP_INTERVAL_MSEC
		):
			return
		if _combat_step_index > 0:
			print(
				"[WARMUP_PROFILE] render_gap step_index=", _combat_step_index,
				" frame_ms=", now - _last_combat_step_finished_ticks,
				" total_ms=", now - _started_ticks
			)
		_run_incremental_combat_step(_combat_step_index, preload_step_count)
		_combat_step_index += 1
		_request_hidden_render_once()
		_last_combat_step_finished_ticks = Time.get_ticks_msec()
		return

	var frame_now := Time.get_ticks_msec()
	if (
		mode == "combat_idle"
		and frame_now - _last_combat_step_finished_ticks < COMBAT_IDLE_RENDER_INTERVAL_MSEC
	):
		return
	_combat_frames_elapsed += 1
	_combat_post_frames += 1
	print(
		"[WARMUP_PROFILE] render_frame frame=", _combat_post_frames,
		"/", COMBAT_WARMUP_FRAMES,
		" frame_ms=", frame_now - _last_combat_step_finished_ticks,
		" total_ms=", frame_now - _started_ticks
	)
	_last_combat_step_finished_ticks = frame_now
	_process_fire_dragon_prewarm_frames()
	_process_mechanical_dragon_prewarm_frames()
	_process_necromancer_prewarm_frames()
	_process_wind_mage_prewarm_frames()
	_process_pea_shooter_prewarm_frames()
	_process_animation_sample_jobs()
	_request_hidden_render_once()
	if _combat_post_frames >= COMBAT_WARMUP_FRAMES:
		if mode == "startup_common":
			_island_common_warmup_done = true
			_island_common_warmup_node = null
		elif mode == "startup_loadout_gpu":
			_startup_loadout_gpu_warmup_done = true
			_combat_warmup_active = false
			_combat_warmup_node = null
		else:
			_combat_warmup_done = true
			_combat_warmup_active = false
			_combat_warmup_node = null
		visible = false
		_clear_runtime_warmup_nodes()
		print(
			"[WARMUP_PROFILE] finish mode=", mode,
			" total_ms=", Time.get_ticks_msec() - _started_ticks,
			" render_frames=", _combat_frames_elapsed,
			" combat_steps=", total_step_count
		)
		_report_combat_idle_state("complete")
		if mode == "startup_loadout_gpu":
			_report_loading_progress(
				91,
				"combat_loadout_warmup_done",
				{"troops": _requested_troop_names.duplicate()}
			)
		_finish_warmup_node()


func _idle_window_is_ready() -> bool:
	if _idle_interactive_ticks <= 0:
		_idle_interactive_ticks = Time.get_ticks_msec()
		print("[WARMUP_PROFILE] combat_idle_window_open settle_ms=", COMBAT_IDLE_SETTLE_MSEC)
		return false
	return Time.get_ticks_msec() - _idle_interactive_ticks >= COMBAT_IDLE_SETTLE_MSEC


func _promote_to_blocking_combat() -> void:
	if mode != "combat_idle":
		return
	mode = "combat"
	if _warmup_host_viewport != null and is_instance_valid(_warmup_host_viewport):
		_warmup_host_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	print(
		"[WARMUP_PROFILE] combat_idle_promoted step_index=", _combat_step_index,
		" elapsed_ms=", Time.get_ticks_msec() - _started_ticks
	)


func _request_hidden_render_once() -> void:
	if (
		mode == "combat_idle"
		and _warmup_host_viewport != null
		and is_instance_valid(_warmup_host_viewport)
	):
		_warmup_host_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE


func _run_incremental_combat_step(step_index: int, preload_step_count: int) -> void:
	if not _skip_incremental_resource_preload():
		if step_index < AttackSystem.SHIP_MODELS.size():
			var ship_index := step_index
			_run_profiled_callable_step(
				"preload_ship_%d" % (ship_index + 1),
				func() -> void:
					AttackSystem._get_ship_model_resource(ship_index)
			)
			return

		var troop_step := step_index - AttackSystem.SHIP_MODELS.size()
		if troop_step < _combat_preload_troops.size():
			var troop_name: String = _combat_preload_troops[troop_step]
			_run_profiled_callable_step(
				"preload_troop_%s" % troop_name,
				func() -> void:
					AttackSystem._get_or_load_troop_resources(troop_name)
			)
			if troop_step == _combat_preload_troops.size() - 1:
				AttackSystem._finalize_incremental_combat_preload()
			return

	var render_step := _combat_render_step_indices[step_index - preload_step_count]
	_run_profiled_combat_step(
		COMBAT_STEP_NAMES[render_step],
		COMBAT_STEP_METHODS[render_step]
	)


func _skip_incremental_resource_preload() -> bool:
	return _resource_preload_already_satisfied


func _build_combat_render_step_indices() -> Array[int]:
	if mode == "startup_common":
		var startup_steps: Array[int] = []
		for index in range(COMBAT_STEP_NAMES.size()):
			if STARTUP_COMMON_STEP_NAMES.has(COMBAT_STEP_NAMES[index]):
				startup_steps.append(index)
		print("[WARMUP_PROFILE] combat_scope=startup_common render_steps=", startup_steps.size())
		return startup_steps
	if not _restrict_to_requested_troops:
		var all_steps: Array[int] = []
		for index in range(COMBAT_STEP_METHODS.size()):
			all_steps.append(index)
		print("[WARMUP_PROFILE] combat_scope=full render_steps=", all_steps.size())
		return all_steps

	var common_step_names: Array[String] = [
		"ship_cannon",
		"ship_freeze",
		"ship_medkit",
		"ship_rage",
		"skeleton_barrel",
	]
	var conditional_steps := {
		"magic_orb": ["Mage", "Necromancer"],
		"mimic": ["Mimic"],
		"demon_king": ["DemonKing"],
		"fire_dragon": ["FireDragon"],
		"necromancer": ["Necromancer"],
		"horror_evolution": ["Horror"],
		"mechanical_dragon": ["MechanicalDragon"],
		"ice_golem": ["IceGolem"],
		"wind_mage": ["WindMage"],
		"pea_shooter": ["PeaShooter"],
		"troop_models_and_scripts": AttackSystem.ACTIVE_PRELOAD_TROOPS,
		"troop_animation_libraries": AttackSystem.ACTIVE_PRELOAD_TROOPS,
		"troop_crowd_poses": AttackSystem.ACTIVE_PRELOAD_TROOPS,
		"weapon_scenes": ["Knight", "Mage", "Archer"],
	}
	var selected: Array[int] = []
	for index in range(COMBAT_STEP_NAMES.size()):
		var step_name: String = COMBAT_STEP_NAMES[index]
		if common_step_names.has(step_name):
			selected.append(index)
			continue
		var required_troops: Array = conditional_steps.get(step_name, [])
		for troop_name in required_troops:
			if _requested_troop_names.has(str(troop_name)):
				selected.append(index)
				break
	print(
		"[WARMUP_PROFILE] combat_scope=loadout troops=", _requested_troop_names,
		" render_steps=", selected.size()
	)
	if mode == "startup_loadout_gpu":
		return selected.filter(
			func(index: int) -> bool:
				return HEAVY_LOADOUT_GPU_STEP_NAMES.has(COMBAT_STEP_NAMES[index])
		)
	if mode == "combat_idle" and _startup_loadout_gpu_warmup_done:
		return selected.filter(
			func(index: int) -> bool:
				return not HEAVY_LOADOUT_GPU_STEP_NAMES.has(COMBAT_STEP_NAMES[index])
		)
	return selected


func _run_profiled_callable_step(step: String, callback: Callable) -> void:
	var started := Time.get_ticks_msec()
	print("[WARMUP_PROFILE] step_start step=", step, " total_ms=", started - _started_ticks)
	callback.call()
	var finished := Time.get_ticks_msec()
	print(
		"[WARMUP_PROFILE] step_done step=", step,
		" step_ms=", finished - started,
		" total_ms=", finished - _started_ticks
	)


func _report_combat_idle_state(state: String) -> void:
	if mode != "combat_idle" or not OS.has_feature("web"):
		return
	var payload := {
		"state": state,
		"mode": mode,
		"ticks_ms": Time.get_ticks_msec(),
		"elapsed_ms": Time.get_ticks_msec() - _started_ticks,
		"step_index": _combat_step_index,
	}
	JavaScriptBridge.eval(
		"window.__clashCombatIdleWarmup = %s;" % JSON.stringify(payload),
		true
	)


func _finish_warmup_node() -> void:
	if not _finished_emitted:
		_finished_emitted = true
		finished.emit()
	set_process(false)
	if _warmup_host_viewport != null and is_instance_valid(_warmup_host_viewport):
		_warmup_host_viewport.call_deferred("queue_free")
	else:
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
	if _restrict_to_requested_troops:
		if _requested_troop_names.has("Archer"):
			BaseTroop.prewarm_anim_library(
				BaseTroop.PIRATE_ARCHER_ANIM_FILES,
				BaseTroop.PIRATE_ARCHER_ANIM_ALIASES
			)
		if _requested_troop_names.has("Mage"):
			BaseTroop.prewarm_anim_library(
				BaseTroop.PIRATE_MAGE_ANIM_FILES,
				BaseTroop.PIRATE_MAGE_ANIM_ALIASES
			)
		if _requested_troop_names.has("Knight"):
			BaseTroop.prewarm_anim_library(
				BaseTroop.PIRATE_KNIGHT_ANIM_FILES,
				BaseTroop.PIRATE_KNIGHT_ANIM_ALIASES
			)
		if _requested_troop_names.has("Mimic"):
			BaseTroop.prewarm_anim_library(
				[
					"res://Model/Characters/MimicBarrel/Animations/Idle.fbx",
					"res://Model/Characters/MimicBarrel/Animations/Roll_Forward_WO_Root.fbx",
					"res://Model/Characters/MimicBarrel/Animations/Tongue_Attack.fbx",
					"res://Model/Characters/MimicBarrel/Animations/Take_Damage.fbx",
					"res://Model/Characters/MimicBarrel/Animations/Die.fbx",
				],
				{
					"res://Model/Characters/MimicBarrel/Animations/Idle.fbx": "Idle_A",
					"res://Model/Characters/MimicBarrel/Animations/Roll_Forward_WO_Root.fbx": "Running_A",
					"res://Model/Characters/MimicBarrel/Animations/Tongue_Attack.fbx": "Tongue_Attack",
					"res://Model/Characters/MimicBarrel/Animations/Take_Damage.fbx": "GetHit",
					"res://Model/Characters/MimicBarrel/Animations/Die.fbx": "Die",
				}
			)
		if _requested_troop_names.has("Necromancer"):
			BaseTroop.prewarm_anim_library(
				[
					"res://Model/Characters/Necromancer/Animations/necromancer_idle.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_move.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_attack.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_summon.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_hit.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_die.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_spawn.fbx",
					"res://Model/Characters/Necromancer/Animations/necromancer_victory.fbx",
				],
				{
					"res://Model/Characters/Necromancer/Animations/necromancer_idle.fbx": "Idle_A",
					"res://Model/Characters/Necromancer/Animations/necromancer_move.fbx": "Running_A",
					"res://Model/Characters/Necromancer/Animations/necromancer_attack.fbx": "Necromancer_Attack",
					"res://Model/Characters/Necromancer/Animations/necromancer_summon.fbx": "Necromancer_Summon",
					"res://Model/Characters/Necromancer/Animations/necromancer_hit.fbx": "GetHit",
					"res://Model/Characters/Necromancer/Animations/necromancer_die.fbx": "Death_A",
					"res://Model/Characters/Necromancer/Animations/necromancer_spawn.fbx": "Spawn_A",
					"res://Model/Characters/Necromancer/Animations/necromancer_victory.fbx": "Cheering",
				}
			)
			BaseTroop.prewarm_anim_library([
				"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
				"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
				"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
				"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
			])
		if _requested_troop_names.has("WindMage"):
			_prewarm_wind_mage_anim_libraries()
		if _requested_troop_names.has("PeaShooter"):
			_prewarm_pea_shooter_anim_libraries()
		return
	BaseTroop.prewarm_anim_library(BaseTroop.MEDIUM_RIG_ANIM_FILES)
	BaseTroop.prewarm_anim_library(
		BaseTroop.PIRATE_ARCHER_ANIM_FILES,
		BaseTroop.PIRATE_ARCHER_ANIM_ALIASES
	)
	BaseTroop.prewarm_anim_library(
		BaseTroop.PIRATE_MAGE_ANIM_FILES,
		BaseTroop.PIRATE_MAGE_ANIM_ALIASES
	)
	BaseTroop.prewarm_anim_library(
		BaseTroop.PIRATE_KNIGHT_ANIM_FILES,
		BaseTroop.PIRATE_KNIGHT_ANIM_ALIASES
	)
	BaseTroop.prewarm_anim_library(
		[
			"res://Model/Characters/MimicBarrel/Animations/Idle.fbx",
			"res://Model/Characters/MimicBarrel/Animations/Roll_Forward_WO_Root.fbx",
			"res://Model/Characters/MimicBarrel/Animations/Tongue_Attack.fbx",
			"res://Model/Characters/MimicBarrel/Animations/Take_Damage.fbx",
			"res://Model/Characters/MimicBarrel/Animations/Die.fbx",
		],
		{
			"res://Model/Characters/MimicBarrel/Animations/Idle.fbx": "Idle_A",
			"res://Model/Characters/MimicBarrel/Animations/Roll_Forward_WO_Root.fbx": "Running_A",
			"res://Model/Characters/MimicBarrel/Animations/Tongue_Attack.fbx": "Tongue_Attack",
			"res://Model/Characters/MimicBarrel/Animations/Take_Damage.fbx": "GetHit",
			"res://Model/Characters/MimicBarrel/Animations/Die.fbx": "Die",
		}
	)
	# Skeleton-guard rig (different cache key — scripts/skeleton_guard.gd).
	BaseTroop.prewarm_anim_library(
		[
			"res://Model/Characters/Necromancer/Animations/necromancer_idle.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_move.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_attack.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_summon.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_hit.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_die.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_spawn.fbx",
			"res://Model/Characters/Necromancer/Animations/necromancer_victory.fbx",
		],
		{
			"res://Model/Characters/Necromancer/Animations/necromancer_idle.fbx": "Idle_A",
			"res://Model/Characters/Necromancer/Animations/necromancer_move.fbx": "Running_A",
			"res://Model/Characters/Necromancer/Animations/necromancer_attack.fbx": "Necromancer_Attack",
			"res://Model/Characters/Necromancer/Animations/necromancer_summon.fbx": "Necromancer_Summon",
			"res://Model/Characters/Necromancer/Animations/necromancer_hit.fbx": "GetHit",
			"res://Model/Characters/Necromancer/Animations/necromancer_die.fbx": "Death_A",
			"res://Model/Characters/Necromancer/Animations/necromancer_spawn.fbx": "Spawn_A",
			"res://Model/Characters/Necromancer/Animations/necromancer_victory.fbx": "Cheering",
		}
	)
	BaseTroop.prewarm_anim_library([
		"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
		"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
		"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
	])
	_prewarm_wind_mage_anim_libraries()
	_prewarm_pea_shooter_anim_libraries()


## Bake the six dense-crowd pose frames before combat. Runtime batching uses
## these same keys, so the first large army no longer skins every representative
## pose on the main thread while the fight is already visible.
func _prewarm_troop_crowd_poses() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	if _crowd_pose_baker == null:
		_crowd_pose_baker = TroopCrowdBatch.new()
		_crowd_pose_baker.name = "WarmupTroopCrowdPoseBaker"
		add_child(_crowd_pose_baker)

	var candidates: Array[String] = _requested_troop_names.duplicate()
	if not _restrict_to_requested_troops:
		# The unrestricted fallback stays bounded. Session-aware warmup uses the
		# actual loadout and therefore warms every selected compatible troop.
		candidates = ["Knight", "Mage", "Archer"]
	candidates.sort_custom(func(left: String, right: String) -> bool:
		var left_count := int(_requested_troop_counts.get(left, 1))
		var right_count := int(_requested_troop_counts.get(right, 1))
		if left_count == right_count:
			return left < right
		return left_count < right_count
	)
	_protected_crowd_pose_troop = _select_protected_crowd_pose_troop(
		candidates
	)
	TroopCrowdBatch.begin_pose_cache_scope()
	for troop_name in candidates:
		if troop_name == "FireDragon":
			continue
		var entry: Dictionary = AttackSystem._troop_res_cache.get(troop_name, {})
		var model_res := entry.get("model", null) as PackedScene
		var script_res := entry.get("script", null) as Script
		if model_res == null or script_res == null:
			continue
		var troop := model_res.instantiate() as Node3D
		if troop == null:
			continue
		troop.name = "WarmupCrowdPose_%s" % troop_name
		troop.set_script(script_res)
		troop.set("_spawn_scale", AttackSystem._scale_for_troop(troop_name, 0.1))
		troop.scale = Vector3.ONE * float(troop.get("_spawn_scale"))
		add_child(troop)
		# Match live dense combat before deriving the visual signature.
		if troop.has_method("_set_dense_render_tier"):
			troop.call("_set_dense_render_tier", 2)
		var live_manager: Node = troop.get("_crowd_batch_manager") as Node
		if live_manager != null and is_instance_valid(live_manager):
			live_manager.call("unregister_troop", troop, true)
			troop.set("_crowd_batch_registered", false)
			troop.set("_crowd_batch_manager", null)
		troop.process_mode = Node.PROCESS_MODE_DISABLED
		_runtime_warmup_nodes.append(troop)

		var player := troop.get("anim_player") as AnimationPlayer
		if player == null:
			continue
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		var animation_names: Array[String] = ["Idle_A", "Running_A"]
		var attack_name := str(troop.get("attack_anim"))
		if not attack_name.is_empty() and not animation_names.has(attack_name):
			animation_names.append(attack_name)
		for animation_name in animation_names:
			if not player.has_animation(animation_name):
				continue
			var samples: Array = []
			for frame_index in range(TroopCrowdBatch.POSE_FRAME_COUNT):
				samples.append({
					"animation": animation_name,
					"phase": (float(frame_index) + 0.5) / float(TroopCrowdBatch.POSE_FRAME_COUNT),
					"crowd_root": troop,
					"crowd_animation": animation_name,
					"crowd_frame": frame_index,
				})
			_queue_animation_samples(troop, samples)
		var static_samples: Array = []
		for frame_index in range(TroopCrowdBatch.POSE_FRAME_COUNT):
			static_samples.append({
				"crowd_static": true,
				"crowd_root": troop,
				"crowd_animation": "static",
				"crowd_frame": frame_index,
			})
			_queue_animation_samples(troop, static_samples)


func _select_protected_crowd_pose_troop(
	candidates: Array[String]
) -> String:
	var selected := ""
	var selected_count := -1
	for troop_name in candidates:
		var troop_count := int(_requested_troop_counts.get(troop_name, 1))
		if (
			troop_count > selected_count
			or (
				troop_count == selected_count
				and troop_name == "Knight"
			)
		):
			selected = troop_name
			selected_count = troop_count
	return selected


func _prewarm_wind_mage_anim_libraries() -> void:
	BaseTroop.prewarm_anim_library(
		[
			"res://Model/Characters/WindMage/Animations/wind_mage_idle.fbx",
			"res://Model/Characters/WindMage/Animations/wind_mage_move.fbx",
			"res://Model/Characters/WindMage/Animations/wind_mage_attack.fbx",
			"res://Model/Characters/WindMage/Animations/wind_mage_summon.fbx",
			"res://Model/Characters/WindMage/Animations/wind_mage_spawn.fbx",
			"res://Model/Characters/WindMage/Animations/wind_mage_hit.fbx",
			"res://Model/Characters/WindMage/Animations/wind_mage_die.fbx",
		],
		{
			"res://Model/Characters/WindMage/Animations/wind_mage_idle.fbx": "Idle_A",
			"res://Model/Characters/WindMage/Animations/wind_mage_move.fbx": "Running_A",
			"res://Model/Characters/WindMage/Animations/wind_mage_attack.fbx": "Wind_Slash",
			"res://Model/Characters/WindMage/Animations/wind_mage_summon.fbx": "Wind_Summon",
			"res://Model/Characters/WindMage/Animations/wind_mage_spawn.fbx": "Spawn_A",
			"res://Model/Characters/WindMage/Animations/wind_mage_hit.fbx": "GetHit",
			"res://Model/Characters/WindMage/Animations/wind_mage_die.fbx": "Death_A",
		}
	)
	BaseTroop.prewarm_anim_library(
		[
			"res://Model/Characters/Windling/Animations/windling_idle.fbx",
			"res://Model/Characters/Windling/Animations/windling_move.fbx",
			"res://Model/Characters/Windling/Animations/windling_attack.fbx",
			"res://Model/Characters/Windling/Animations/windling_spawn.fbx",
			"res://Model/Characters/Windling/Animations/windling_hit.fbx",
			"res://Model/Characters/Windling/Animations/windling_die.fbx",
		],
		{
			"res://Model/Characters/Windling/Animations/windling_idle.fbx": "Idle_A",
			"res://Model/Characters/Windling/Animations/windling_move.fbx": "Running_A",
			"res://Model/Characters/Windling/Animations/windling_attack.fbx": "Windling_Attack",
			"res://Model/Characters/Windling/Animations/windling_spawn.fbx": "Spawn_A",
			"res://Model/Characters/Windling/Animations/windling_hit.fbx": "GetHit",
			"res://Model/Characters/Windling/Animations/windling_die.fbx": "Death_A",
		}
	)


func _prewarm_pea_shooter_anim_libraries() -> void:
	BaseTroop.prewarm_anim_library(
		[
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_idle.fbx",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_move.fbx",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_hit.fbx",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_die.fbx",
		],
		{
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_idle.fbx": "Idle_A",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_move.fbx": "Running_A",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx": "Pea_Combo",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_hit.fbx": "GetHit",
			"res://Model/Characters/PeaShooter/Animations/pea_shooter_die.fbx": "Death_A",
		}
	)


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


## Compile every authored building Cannon level plus the exact runtime
## cannonball, highlight, trail, and muzzle-flash material variants.
func _warmup_building_cannon() -> void:
	var cannon_script := ResourceLoader.load("res://scripts/cannon.gd", "Script") as Script
	if cannon_script == null:
		print("[WARMUP] building Cannon script missing - skipped")
		return

	for level_index in range(BUILDING_CANNON_SCENE_PATHS.size()):
		var scene_path: String = BUILDING_CANNON_SCENE_PATHS[level_index]
		var packed_scene := ResourceLoader.load(scene_path, "PackedScene") as PackedScene
		if packed_scene == null:
			print("[WARMUP] building Cannon scene missing: ", scene_path)
			continue
		var visual := packed_scene.instantiate() as Node3D
		visual.name = "WarmupBuildingCannonL%d" % (level_index + 1)
		# Warmup itself is scaled to 0.02. Keep authored scene scale so each
		# material surface is still large enough to rasterize in the viewport.
		visual.position = Vector3((float(level_index) - 3.0) * 0.55, 0.0, 0.0)
		_force_shadow_casting(visual)
		add_child(visual)

	var resource_probe := Node3D.new()
	resource_probe.set_script(cannon_script)
	resource_probe.set("attack_sfx_enabled", false)
	var resources: Dictionary = resource_probe.call("_get_warmup_visual_resources")
	resource_probe.free()

	_add_cannon_warmup_mesh(
		"WarmupBuildingCannonball",
		resources.get("ball_mesh") as Mesh,
		resources.get("ball_material") as Material,
		Vector3(-1.15, 2.1, 0.0),
		Vector3.ONE * 8.0,
	)
	_add_cannon_warmup_mesh(
		"WarmupBuildingCannonHighlight",
		resources.get("highlight_mesh") as Mesh,
		resources.get("highlight_material") as Material,
		Vector3(-0.72, 2.1, 0.0),
		Vector3.ONE * 12.0,
	)
	_add_cannon_warmup_mesh(
		"WarmupBuildingCannonTrail",
		resources.get("trail_mesh") as Mesh,
		resources.get("trail_material") as Material,
		Vector3(0.0, 2.1, 0.0),
		Vector3(20.0, 0.12, 20.0),
	)
	var flash_material := resources.get("flash_material") as Material
	if flash_material != null:
		var flash := MeshInstance3D.new()
		flash.name = "WarmupBuildingCannonFlash"
		var flash_quad := QuadMesh.new()
		var flash_scale := float(resources.get("flash_scale", 0.13))
		flash_quad.size = Vector2(flash_scale, flash_scale)
		flash.mesh = flash_quad
		flash.material_override = flash_material
		flash.position = Vector3(1.35, 2.1, 0.0)
		flash.scale = Vector3.ONE * 8.0
		flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(flash)


func _add_cannon_warmup_mesh(
	node_name: String,
	mesh: Mesh,
	material: Material,
	local_position: Vector3,
	local_scale: Vector3,
) -> void:
	if mesh == null or material == null:
		return
	var representative := MeshInstance3D.new()
	representative.name = node_name
	representative.mesh = mesh
	representative.material_override = material
	representative.position = local_position
	representative.scale = local_scale
	representative.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(representative)


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
	var candidates: Array[String] = _requested_troop_names.duplicate()
	if not _restrict_to_requested_troops:
		candidates = ["Knight"]
	var model_res: Resource = null
	for troop_name in candidates:
		var troop_entry: Dictionary = AttackSystem._troop_res_cache.get(str(troop_name), {})
		model_res = troop_entry.get("model", null)
		if model_res != null:
			break
	if model_res == null:
		print("[WARMUP] knight GLB missing from cache — skipped")
		return
	var inst: Node3D = model_res.instantiate()
	inst.scale = Vector3(1.0, 1.0, 1.0)
	# Native warmup also compiles the shadow-pass variant. Web runtime shadows
	# are disabled, so _force_shadow_casting() intentionally does nothing there.
	_force_shadow_casting(inst)
	add_child(inst)


## Mimic has a unique barrel rig and rolls with a different animation/material
## pipeline from the medium humanoid troops. Sample every combat-relevant clip
## in the hidden viewport so the first deployed Mimic does not hitch.
func _warmup_mimic() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("Mimic", {})
	var model_res: PackedScene = entry.get("model", null) as PackedScene
	var script_res: Script = entry.get("script", null) as Script
	if model_res == null or script_res == null:
		print("[WARMUP] Mimic resources missing - skipped")
		return
	var inst := model_res.instantiate() as Node3D
	inst.name = "WarmupMimic"
	inst.set_script(script_res)
	var mimic_scale := AttackSystem._scale_for_troop("Mimic", 0.1)
	inst.set("_spawn_scale", mimic_scale)
	inst.scale = Vector3.ONE * mimic_scale
	_force_shadow_casting(inst)
	add_child(inst)
	_queue_animation_samples(inst, [
		{"animation": "Running_A", "phase": 0.50},
		{"animation": "Tongue_Attack", "phase": 0.18},
		{"animation": "Tongue_Attack", "phase": 0.45},
		{"animation": "Tongue_Attack", "phase": 0.78},
		{"animation": "GetHit", "phase": 0.50},
		{"animation": "Die", "phase": 0.55},
	])


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


## FireDragon keeps one skinned model and lazily caches imported clips. Load
## every combat-state clip here, then leave the representative on its attack
## frame so both animation tracks and fire-breath materials reach the GPU.
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
		for animation_name in [
			"fly_idle",
			"fly_forward",
			"fly_take_damage",
			"fly_die",
		]:
			inst.call("_play_dragon_animation", animation_name, true)
		inst.call("_play_dragon_animation", "fly_fire_breath_attack_low", true)
	if inst.has_method("prewarm_fire_breath_vfx"):
		inst.call("prewarm_fire_breath_vfx")
	_fire_dragon_warmup_inst = inst
	_warmup_fire_dragon_breath_materials()


## Mechanical Dragon has a unique skinned model, FBX animation library, and
## a batched additive chain-lightning effect. Draw the real effect once under
## the loading cover so its ArrayMesh, transparency, particles, and materials
## do not compile on the first live strike.
func _warmup_mechanical_dragon() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("MechanicalDragon", {})
	var model_res: Resource = entry.get("model", null)
	var script_res: Script = entry.get("script", null)
	if model_res == null or script_res == null:
		print("[WARMUP] MechanicalDragon resources missing - skipped")
		return

	var inst: Node3D = (model_res as PackedScene).instantiate()
	inst.name = "WarmupMechanicalDragon"
	inst.set_script(script_res)
	# The warmup root is already scaled to 0.02. Applying the live 0.1 troop
	# scale again made the effective model 0.002, below the renderer's culling
	# threshold, so WebGL never submitted the skinned draw that compiles the
	# Mechanical Dragon pipeline.
	inst.scale = Vector3.ONE
	_force_shadow_casting(inst)
	add_child(inst)

	var player := inst.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player != null and player.has_animation("Lightning_Attack"):
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		player.play("Lightning_Attack")
		_mechanical_dragon_warmup_player = player
		_mechanical_dragon_phase_index = 0

	if inst.has_method("prewarm_lightning_vfx"):
		var warmed_vfx: Variant = inst.call("prewarm_lightning_vfx")
		if warmed_vfx is Array:
			set_meta("mechanical_lightning_prepared_count", warmed_vfx.size())
			for vfx in warmed_vfx:
				if vfx is Node and is_instance_valid(vfx):
					_runtime_warmup_nodes.append(vfx)
		elif warmed_vfx is Node and is_instance_valid(warmed_vfx):
			set_meta("mechanical_lightning_prepared_count", 1)
			_runtime_warmup_nodes.append(warmed_vfx)

	var animation_files: Variant = inst.get("anim_files")
	var animation_aliases: Variant = inst.get("anim_file_aliases")
	if animation_files is Array and animation_aliases is Dictionary:
		BaseTroop.prewarm_anim_library(animation_files, animation_aliases)


## Necromancer adds a custom FBX/material set, green projectile shader, summon
## portal, and a second animated troop model. Exercise all of them while the
## loading cover is visible so the first live summon does not compile mid-fight.
func _warmup_necromancer() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("Necromancer", {})
	var model_res: Resource = entry.get("model", null)
	var script_res: Script = entry.get("script", null)
	if model_res == null or script_res == null:
		print("[WARMUP] Necromancer resources missing - skipped")
		return

	var inst: Node3D = (model_res as PackedScene).instantiate()
	inst.name = "WarmupNecromancer"
	inst.set_script(script_res)
	var necromancer_scale := AttackSystem._scale_for_troop("Necromancer", 0.1)
	inst.set("_spawn_scale", necromancer_scale)
	inst.scale = Vector3.ONE * necromancer_scale
	_force_shadow_casting(inst)
	add_child(inst)
	_necromancer_warmup_inst = inst

	var animation_files: Variant = inst.get("anim_files")
	var animation_aliases: Variant = inst.get("anim_file_aliases")
	if animation_files is Array and animation_aliases is Dictionary:
		BaseTroop.prewarm_anim_library(animation_files, animation_aliases)
	if inst.has_method("prewarm_necromancer_vfx"):
		var warmed_nodes: Variant = inst.call("prewarm_necromancer_vfx", self)
		if warmed_nodes is Array:
			set_meta("necromancer_prepared_node_count", warmed_nodes.size())
			for warmed_node in warmed_nodes:
				if warmed_node is Node and is_instance_valid(warmed_node):
					_runtime_warmup_nodes.append(warmed_node)
	_queue_animation_samples(inst, [
		{"animation": "Necromancer_Attack", "phase": 0.18},
		{"animation": "Necromancer_Attack", "phase": 0.52},
		{"animation": "Necromancer_Attack", "phase": 0.82},
		{"animation": "Necromancer_Summon", "phase": 0.35},
		{"animation": "GetHit", "phase": 0.50},
		{"animation": "Death_A", "phase": 0.55},
	])


## The Horror changes mesh and animation library twice during combat. Warm all
## three generations now so a lethal split cannot block the first battle frame.
func _warmup_horror_evolution() -> void:
	var script_res := load("res://scripts/horror_evolution.gd") as Script
	if script_res == null:
		print("[WARMUP] Horror script missing - skipped")
		return
	var stage_models: Array[String] = [
		"res://Model/Characters/HorrorEvolution/horror.fbx",
		"res://Model/Characters/HorrorEvolution/creeper.fbx",
		"res://Model/Characters/HorrorEvolution/lurker.fbx",
	]
	var horror_scale := AttackSystem._scale_for_troop("Horror", 0.1)
	for stage_index in range(stage_models.size()):
		var model_res := load(stage_models[stage_index]) as PackedScene
		if model_res == null:
			print("[WARMUP] Horror stage missing: ", stage_models[stage_index])
			continue
		var inst := model_res.instantiate() as Node3D
		inst.name = "WarmupHorrorStage%d" % stage_index
		inst.set_script(script_res)
		inst.set("evolution_stage", stage_index)
		inst.set("_spawn_scale", horror_scale)
		inst.scale = Vector3.ONE * horror_scale
		_force_shadow_casting(inst)
		add_child(inst)
		var animation_files: Variant = inst.get("anim_files")
		var animation_aliases: Variant = inst.get("anim_file_aliases")
		if animation_files is Array and animation_aliases is Dictionary:
			BaseTroop.prewarm_anim_library(animation_files, animation_aliases)
		_queue_animation_samples(inst, [
			{"animation": "Spawn_A", "phase": 0.55},
			{"animation": "Running_A", "phase": 0.50},
			{"animation": "Bite_Attack", "phase": 0.20},
			{"animation": "Bite_Attack", "phase": 0.42},
			{"animation": "Bite_Attack", "phase": 0.78},
			{"animation": "Death_A", "phase": 0.55},
		])


## Ice Golem adds a skinned FBX, a custom smash/death animation set, and the
## transparent radial/frost VFX. Exercise the real resources while the loading
## cover is still visible so the first death does not compile them mid-battle.
func _warmup_ice_golem() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("IceGolem", {})
	var model_res: Resource = entry.get("model", null)
	var script_res: Script = entry.get("script", null)
	if model_res == null or script_res == null:
		print("[WARMUP] IceGolem resources missing - skipped")
		return

	var inst: Node3D = (model_res as PackedScene).instantiate()
	inst.name = "WarmupIceGolem"
	inst.set_script(script_res)
	var golem_scale := AttackSystem._scale_for_troop("IceGolem", 0.1)
	inst.scale = Vector3.ONE * golem_scale
	_force_shadow_casting(inst)
	add_child(inst)

	var animation_files: Variant = inst.get("anim_files")
	var animation_aliases: Variant = inst.get("anim_file_aliases")
	if animation_files is Array and animation_aliases is Dictionary:
		BaseTroop.prewarm_anim_library(animation_files, animation_aliases)

	var vfx := IceFreezeVFX.new()
	vfx.name = "WarmupIceFreezeVFX"
	add_child(vfx)
	vfx.show_freeze(
		inst.global_position,
		0.22,
		0.18,
		[{"node": inst, "server_id": -1, "show_overlay": true}]
	)
	_queue_animation_samples(inst, [
		{"animation": "Spawn_A", "phase": 0.50},
		{"animation": "Running_A", "phase": 0.50},
		{"animation": "Smash_Attack", "phase": 0.20},
		{"animation": "Smash_Attack", "phase": 0.56},
		{"animation": "Smash_Attack", "phase": 0.82},
		{"animation": "Death_A", "phase": 0.55},
	])


## Wind Mage compiles two animated rigs, its translucent wind ribbons, and the
## summoned-unit material pipeline before the first live cast.
func _warmup_wind_mage() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("WindMage", {})
	var model_res: Resource = entry.get("model", null)
	var script_res: Script = entry.get("script", null)
	if model_res == null or script_res == null:
		print("[WARMUP] WindMage resources missing - skipped")
		return

	var mage := (model_res as PackedScene).instantiate() as Node3D
	mage.name = "WarmupWindMage"
	mage.set_script(script_res)
	var mage_scale := AttackSystem._scale_for_troop("WindMage", 0.1)
	mage.set("_spawn_scale", mage_scale)
	mage.scale = Vector3.ONE * mage_scale
	_force_shadow_casting(mage)
	add_child(mage)

	var player := mage.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player != null and player.has_animation("Wind_Slash"):
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		player.play("Wind_Slash")
		_wind_mage_warmup_player = player
		_wind_mage_phase_index = 0

	if mage.has_method("prewarm_wind_vfx"):
		var warmed_vfx: Variant = mage.call("prewarm_wind_vfx", self)
		if warmed_vfx is Array:
			set_meta("wind_mage_prepared_node_count", warmed_vfx.size())
			for warmed_node in warmed_vfx:
				if warmed_node is Node and is_instance_valid(warmed_node):
					_runtime_warmup_nodes.append(warmed_node)

	var windling_scene := load(
		"res://Model/Characters/Windling/Windling.fbx"
	) as PackedScene
	var windling_script := load("res://scripts/windling.gd") as Script
	if windling_scene != null and windling_script != null:
		var windling := windling_scene.instantiate() as Node3D
		windling.name = "WarmupWindling"
		windling.set_script(windling_script)
		windling.set("_spawn_scale", 0.105)
		windling.scale = Vector3.ONE * 0.105
		_force_shadow_casting(windling)
		add_child(windling)
		_queue_animation_samples(windling, [
			{"animation": "Spawn_A", "phase": 0.50},
			{"animation": "Running_A", "phase": 0.50},
			{"animation": "Windling_Attack", "phase": 0.22},
			{"animation": "Windling_Attack", "phase": 0.52},
			{"animation": "Windling_Attack", "phase": 0.82},
			{"animation": "Death_A", "phase": 0.55},
		])

	_prewarm_wind_mage_anim_libraries()


## Render all three burst phases and the same pooled low-poly pea mesh/material
## used in combat so the first live volley does not compile render pipelines.
func _warmup_pea_shooter() -> void:
	if AttackSystem._troop_res_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var entry: Dictionary = AttackSystem._troop_res_cache.get("PeaShooter", {})
	var model_res: Resource = entry.get("model", null)
	var script_res: Script = entry.get("script", null)
	if model_res == null or script_res == null:
		print("[WARMUP] PeaShooter resources missing - skipped")
		return

	var shooter := (model_res as PackedScene).instantiate() as Node3D
	shooter.name = "WarmupPeaShooter"
	shooter.set_script(script_res)
	var shooter_scale := AttackSystem._scale_for_troop("PeaShooter", 0.1)
	shooter.scale = Vector3.ONE * shooter_scale
	_force_shadow_casting(shooter)
	add_child(shooter)

	var player := shooter.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player != null and player.has_animation("Pea_Combo"):
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		player.play("Pea_Combo")
		_pea_shooter_warmup_player = player
		_pea_shooter_phase_index = 0

	var projectile_mesh := shooter.call("_get_projectile_mesh") as Mesh
	var projectile_material := shooter.call("_get_projectile_material") as Material
	if projectile_mesh != null and projectile_material != null:
		for projectile_index in range(3):
			var projectile := MeshInstance3D.new()
			projectile.name = "WarmupPeaProjectile_%d" % projectile_index
			projectile.mesh = projectile_mesh
			projectile.material_override = projectile_material
			projectile.position = Vector3(
				-0.045 + float(projectile_index) * 0.045,
				0.08,
				0.04
			)
			add_child(projectile)

	_prewarm_pea_shooter_anim_libraries()


## Ship abilities are independent from the selected troop loadout. Their
## representatives run in the paced combat-idle warmup so first use does not
## compile projectile, impact, field, or status-overlay pipelines mid-battle.
func _warmup_ship_cannon() -> void:
	var cannon := BSCannon.new().init(self)

	var cannonball := MeshInstance3D.new()
	cannonball.name = "WarmupShipCannonball"
	var cannonball_mesh := SphereMesh.new()
	cannonball_mesh.radius = 0.03
	cannonball_mesh.height = 0.06
	cannonball.mesh = cannonball_mesh
	var cannonball_mat := StandardMaterial3D.new()
	cannonball_mat.albedo_color = Color(0.05, 0.05, 0.05)
	cannonball_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cannonball.material_override = cannonball_mat
	cannonball.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(cannonball)

	_warmup_cannon_billboard_frames(
		"WarmupShipMuzzleFlash",
		cannon._ship_flash_textures,
		Vector2(BSCannon.SHIP_FLASH_SCALE, BSCannon.SHIP_FLASH_SCALE),
		Color(1.5, 1.2, 0.8, 1.0)
	)
	_warmup_cannon_billboard_frames(
		"WarmupShipExplosion",
		cannon._ship_explosion_textures,
		Vector2(BSCannon.SHIP_EXPLOSION_SCALE, BSCannon.SHIP_EXPLOSION_SCALE),
		Color(1.4, 1.1, 0.7, 1.0)
	)


func _warmup_cannon_billboard_frames(
	node_prefix: String,
	textures: Array,
	quad_size: Vector2,
	color: Color
) -> void:
	for texture_index in range(textures.size()):
		var texture := textures[texture_index] as Texture2D
		if texture == null:
			continue
		var billboard := MeshInstance3D.new()
		billboard.name = "%s_%02d" % [node_prefix, texture_index]
		var quad := QuadMesh.new()
		quad.size = quad_size
		billboard.mesh = quad
		billboard.material_override = BSCannon._make_additive_billboard_mat(
			texture,
			color
		)
		billboard.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		billboard.position = Vector3(
			(float(texture_index % 8) - 3.5) * 0.025,
			0.08 + float(texture_index / 8) * 0.025,
			0.01
		)
		billboard.scale = Vector3.ONE * 0.035
		add_child(billboard)


func _warmup_ship_freeze() -> void:
	var freeze := BSFreezeSpell.new().init(self)
	var orb := freeze._create_orb()
	orb.name = "WarmupShipFreezeOrb"
	add_child(orb)

	var frozen_target := Node3D.new()
	frozen_target.name = "WarmupShipFreezeTarget"
	var target_mesh := MeshInstance3D.new()
	var target_box := BoxMesh.new()
	target_box.size = Vector3(0.20, 0.24, 0.20)
	target_mesh.mesh = target_box
	frozen_target.add_child(target_mesh)
	add_child(frozen_target)

	var freeze_vfx := IceFreezeVFX.new()
	freeze_vfx.name = "WarmupShipFreezeVFX"
	add_child(freeze_vfx)
	freeze_vfx.show_freeze(
		Vector3.ZERO,
		BSFreezeSpell.RADIUS,
		BSFreezeSpell.DURATION_SEC,
		[{
			"node": frozen_target,
			"show_overlay": true,
			"server_id": -1,
		}]
	)


func _warmup_ship_medkit() -> void:
	var medkit := BSMedkit.new().init(self)
	medkit._activate_zone(Vector3.ZERO, self)
	medkit._pulse_zone(0.85)
	_warmup_troop_status_overlay(
		TroopStatusBatch.EFFECT_HEAL,
		"WarmupHealingStatusBody"
	)


func _warmup_ship_rage() -> void:
	var rage := BSRageSpell.new().init(self)
	rage._activate_zone(Vector3.ZERO, self)
	rage._pulse_zone(0.65)
	_warmup_troop_status_overlay(
		TroopStatusBatch.EFFECT_RAGE,
		"WarmupRageStatusBody"
	)


func _warmup_troop_status_overlay(
	effect: StringName,
	body_name: String
) -> void:
	var root := Node3D.new()
	root.name = "%sRoot" % body_name
	add_child(root)

	var body := MeshInstance3D.new()
	body.name = body_name
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.055
	body_mesh.height = 0.18
	body.mesh = body_mesh
	var body_material := StandardMaterial3D.new()
	body_material.albedo_color = Color(0.82, 0.82, 0.82, 1.0)
	body.material_override = body_material
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(body)

	var status_batch := TroopStatusBatch.new()
	status_batch.name = "%sBatch" % body_name
	root.add_child(status_batch)
	status_batch._ensure_materials()
	var overlay: Material = (
		status_batch._heal_material
		if effect == TroopStatusBatch.EFFECT_HEAL
		else status_batch._rage_material
	)
	body.material_overlay = overlay


## The level-6 ship ability uses the island barrel mesh, an animated skeleton
## rig, weapon attachment, and summon VFX. It is independent of the troop
## loadout, so it runs in the paced combat-idle warmup instead of blocking the
## island reveal.
func _warmup_skeleton_barrel() -> void:
	BSSkeletonBarrel._cache_island_barrel_mesh()
	if BSSkeletonBarrel._barrel_mesh != null:
		var barrel := MeshInstance3D.new()
		barrel.name = "WarmupSkeletonBarrelProjectile"
		barrel.mesh = BSSkeletonBarrel._barrel_mesh
		barrel.scale = Vector3.ONE
		barrel.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(barrel)

	var skeleton := BSSkeletonBarrel.SKELETON_MODEL.instantiate() as Node3D
	if skeleton != null:
		skeleton.name = "WarmupSkeletonBarrelSkeleton"
		skeleton.set_script(BSSkeletonBarrel.SKELETON_SCRIPT)
		skeleton.set("_spawn_scale", 1.0)
		skeleton.scale = Vector3.ONE
		_force_shadow_casting(skeleton)
		add_child(skeleton)
		_queue_animation_samples(skeleton, [
			{"animation": "Spawn_A", "phase": 0.50},
			{"animation": "Running_A", "phase": 0.50},
			{"animation": "Melee_1H_Attack_Chop", "phase": 0.18},
			{"animation": "Melee_1H_Attack_Chop", "phase": 0.52},
			{"animation": "Melee_1H_Attack_Chop", "phase": 0.82},
			{"animation": "Death_A", "phase": 0.55},
		])

	var summon_vfx := Node3D.new()
	summon_vfx.name = "WarmupSkeletonBarrelSummonVFX"
	summon_vfx.set_script(BSSkeletonBarrel.SUMMON_VFX_SCRIPT)
	add_child(summon_vfx)


func _queue_animation_samples(root: Node, samples: Array) -> void:
	var player := root.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or samples.is_empty():
		return
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	_animation_sample_jobs.append({
		"player": player,
		"samples": samples,
		"index": 0,
	})


func _process_animation_sample_jobs() -> void:
	for job_index in range(_animation_sample_jobs.size()):
		var job: Dictionary = _animation_sample_jobs[job_index]
		var player_value: Variant = job.get("player", null)
		var samples: Array = job.get("samples", [])
		var sample_index := int(job.get("index", 0))
		if (
			not is_instance_valid(player_value)
			or sample_index >= samples.size()
		):
			continue
		var player := player_value as AnimationPlayer
		if player == null:
			continue
		var sample: Dictionary = samples[sample_index]
		var animation_name := StringName(str(sample.get("animation", "")))
		if bool(sample.get("crowd_static", false)):
			player.stop()
			player.advance(0.0)
			var static_root := sample.get("crowd_root", null) as Node3D
			if (
				static_root != null
				and is_instance_valid(static_root)
				and _crowd_pose_baker != null
			):
				var static_baked_count := _crowd_pose_baker.prewarm_current_pose(
					static_root,
					"static",
					int(sample.get("crowd_frame", 0)),
					str(static_root.name).ends_with(
						_protected_crowd_pose_troop
					)
				)
				if static_baked_count > 0:
					print(
						"[WARMUP_PROFILE] crowd_pose_baked troop=",
						static_root.name,
						" animation=static frame=",
						int(sample.get("crowd_frame", 0)),
						" meshes=", static_baked_count
					)
		elif player.has_animation(animation_name):
			var animation := player.get_animation(animation_name)
			if animation != null and animation.length > 0.0:
				player.play(animation_name)
				player.seek(
					animation.length * clampf(float(sample.get("phase", 0.5)), 0.0, 1.0),
					true
				)
				player.advance(0.0)
				var crowd_root := sample.get("crowd_root", null) as Node3D
				if (
					crowd_root != null
					and is_instance_valid(crowd_root)
					and _crowd_pose_baker != null
				):
					var baked_count := _crowd_pose_baker.prewarm_current_pose(
						crowd_root,
						str(sample.get("crowd_animation", animation_name)),
						int(sample.get("crowd_frame", 0)),
						str(crowd_root.name).ends_with(
							_protected_crowd_pose_troop
						)
					)
					if baked_count > 0:
						print(
							"[WARMUP_PROFILE] crowd_pose_baked troop=",
							crowd_root.name,
							" animation=", animation_name,
							" frame=", int(sample.get("crowd_frame", 0)),
							" meshes=", baked_count
						)
		job["index"] = sample_index + 1
		_animation_sample_jobs[job_index] = job


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


func _process_mechanical_dragon_prewarm_frames() -> void:
	if (
		_mechanical_dragon_warmup_player == null
		or not is_instance_valid(_mechanical_dragon_warmup_player)
		or _mechanical_dragon_phase_index >= MECHANICAL_DRAGON_PREWARM_PHASES.size()
	):
		return
	var animation := _mechanical_dragon_warmup_player.get_animation("Lightning_Attack")
	if animation == null or animation.length <= 0.0:
		return
	var phase: float = MECHANICAL_DRAGON_PREWARM_PHASES[_mechanical_dragon_phase_index]
	_mechanical_dragon_warmup_player.seek(animation.length * phase, true)
	_mechanical_dragon_warmup_player.advance(0.0)
	_mechanical_dragon_phase_index += 1


func _process_necromancer_prewarm_frames() -> void:
	if (
		_necromancer_warmup_inst == null
		or not is_instance_valid(_necromancer_warmup_inst)
		or _necromancer_phase_index >= NECROMANCER_SUMMON_PREWARM_PHASES.size()
	):
		return
	var phase: float = NECROMANCER_SUMMON_PREWARM_PHASES[_necromancer_phase_index]
	if _necromancer_warmup_inst.has_method("advance_necromancer_prewarm"):
		_necromancer_warmup_inst.call("advance_necromancer_prewarm", phase)
	_necromancer_phase_index += 1


func _process_wind_mage_prewarm_frames() -> void:
	if (
		_wind_mage_warmup_player == null
		or not is_instance_valid(_wind_mage_warmup_player)
		or _wind_mage_phase_index >= WIND_MAGE_PREWARM_PHASES.size()
	):
		return
	var animation := _wind_mage_warmup_player.get_animation("Wind_Slash")
	if animation == null or animation.length <= 0.0:
		return
	var phase: float = WIND_MAGE_PREWARM_PHASES[_wind_mage_phase_index]
	_wind_mage_warmup_player.seek(animation.length * phase, true)
	_wind_mage_warmup_player.advance(0.0)
	_wind_mage_phase_index += 1


func _process_pea_shooter_prewarm_frames() -> void:
	if (
		_pea_shooter_warmup_player == null
		or not is_instance_valid(_pea_shooter_warmup_player)
		or _pea_shooter_phase_index >= PEA_SHOOTER_PREWARM_PHASES.size()
	):
		return
	var animation := _pea_shooter_warmup_player.get_animation("Pea_Combo")
	if animation == null or animation.length <= 0.0:
		return
	var phase: float = PEA_SHOOTER_PREWARM_PHASES[_pea_shooter_phase_index]
	_pea_shooter_warmup_player.seek(animation.length * phase, true)
	_pea_shooter_warmup_player.advance(0.0)
	_pea_shooter_phase_index += 1


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
	_animation_sample_jobs.clear()


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


## On native builds, walks `node`'s descendants and sets `cast_shadow = ON`
## on every MeshInstance3D so the shadow-pass pipeline variant is warmed.
## Web runtime disables directional shadows, so Web warmup preserves each
## imported mesh's shadow-casting mode.
func _force_shadow_casting(node: Node) -> void:
	if OS.has_feature("web"):
		return
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
