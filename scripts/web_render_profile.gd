class_name WebRenderProfile
extends Node

const PERFORMANCE_WATER_MATERIAL: ShaderMaterial = preload("res://shaders/water_fast.tres")
const BUILDING_BASE_MULTIMESH_SHADER_CODE := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_opaque, cull_disabled;

uniform vec4 base_color : source_color = vec4(0.25, 0.45, 0.15, 0.35);
uniform vec4 line_color : source_color = vec4(0.5, 1.0, 0.5, 1.0);
uniform float radius : hint_range(0.0, 0.5) = 0.22;
uniform float blur : hint_range(0.0, 0.4) = 0.12;
uniform float dash_ratio : hint_range(0.0, 1.0) = 0.35;
varying flat vec2 building_params;

float sd_rounded_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void vertex() {
	building_params = INSTANCE_CUSTOM.rg;
}

void fragment() {
	float aspect_ratio = max(building_params.r, 0.001);
	float dash_count = max(building_params.g, 1.0);
	vec2 p = UV * 2.0 - 1.0;
	vec2 corrected = p;
	if (aspect_ratio > 1.0) {
		corrected.x *= aspect_ratio;
	} else {
		corrected.y /= aspect_ratio;
	}

	vec2 box_half = vec2(0.88);
	if (aspect_ratio > 1.0) {
		box_half.x = 0.88 * aspect_ratio;
	} else {
		box_half.y = 0.88 / aspect_ratio;
	}
	float sdf = sd_rounded_box(corrected, box_half, radius);
	float bleed = smoothstep(blur, -blur, sdf);
	float vignette = smoothstep(-0.65, 0.0, sdf);
	float footing = bleed * vignette;

	vec4 col = base_color;
	col.a *= footing;
	float border_width = 0.022;
	float border_line = smoothstep(border_width, 0.0, abs(sdf + border_width * 0.5));
	if (border_line > 0.0) {
		vec2 d = abs(corrected);
		float p_pos = d.x > d.y
			? corrected.y * sign(corrected.x)
			: -corrected.x * sign(corrected.y);
		if (fract(p_pos * dash_count) < dash_ratio) {
			col = mix(col, line_color, border_line);
		}
	}
	ALBEDO = col.rgb;
	ALPHA = col.a;
}
"""
const ISLAND_STATIC_BATCH: ArrayMesh = preload("res://generated/performance/pirate_island_static_batch.res")
const ARCHER_TOWER_STATIC_BATCHES: Array[ArrayMesh] = [
	preload("res://generated/performance/archer_tower_level_1_static_batch.res"),
	preload("res://generated/performance/archer_tower_level_2_static_batch.res"),
	preload("res://generated/performance/archer_tower_level_3_static_batch.res"),
	preload("res://generated/performance/archer_tower_level_4_static_batch.res"),
	preload("res://generated/performance/archer_tower_level_5_static_batch.res"),
]
const BUILDING_STATIC_BATCHES: Dictionary = {
	"res://Model/Mine/1.glb": preload("res://generated/performance/mine_static_batch.res"),
	"res://Model/Barn/1.glb": preload("res://generated/performance/barn_level_1_static_batch.res"),
	"res://Model/Barn/2.glb": preload("res://generated/performance/barn_level_2_static_batch.res"),
	"res://Model/Barn/3.glb": preload("res://generated/performance/barn_level_3_static_batch.res"),
	"res://Model/Sawmill/1.glb": preload("res://generated/performance/sawmill_static_batch.res"),
	"res://Model/Storage/Storage shed_1.glb": preload("res://generated/performance/storage_level_1_static_batch.res"),
	"res://Model/Storage/Storage House_2.glb": preload("res://generated/performance/storage_level_2_static_batch.res"),
	"res://Model/Storage/Business Building_3.glb": preload("res://generated/performance/storage_level_3_static_batch.res"),
	"res://Model/Town_Hall/Town Hall Level 1.glb": preload("res://generated/performance/town_hall_level_1_static_batch.res"),
	"res://Model/Town_Hall/Town Hall Level 2.glb": preload("res://generated/performance/town_hall_level_2_static_batch.res"),
	"res://Model/Town_Hall/Town Hall Level 3.glb": preload("res://generated/performance/town_hall_level_3_static_batch.res"),
	"res://Model/Town_Hall/Town Hall Level 4.glb": preload("res://generated/performance/town_hall_level_4_static_batch.res"),
	"res://Model/Town_Hall/Town Hall Level 5.glb": preload("res://generated/performance/town_hall_level_5_static_batch.res"),
	"res://Model/Town_Hall/Town Hall Level 6.glb": preload("res://generated/performance/town_hall_level_6_static_batch.res"),
	"res://Model/Turret/scene.gltf": preload("res://generated/performance/turret_static_batch.res"),
	"res://Model/Altar/Models/Stylized_Altar_web.tscn": preload("res://generated/performance/altar_static_batch.res"),
	"res://Model/MageTower/1.fbx": preload("res://generated/performance/mage_tower_level_1_static_batch.res"),
	"res://Model/MageTower/2.fbx": preload("res://generated/performance/mage_tower_level_2_static_batch.res"),
	"res://Model/MageTower/3.fbx": preload("res://generated/performance/mage_tower_level_3_static_batch.res"),
	"res://Model/Mortar/mortar_lvl1.fbx": preload("res://generated/performance/mortar_level_1_static_batch.res"),
	"res://Model/Mortar/mortar_lvl2.fbx": preload("res://generated/performance/mortar_level_2_static_batch.res"),
	"res://Model/Mortar/mortar_lvl3.fbx": preload("res://generated/performance/mortar_level_3_static_batch.res"),
	"res://Model/Mortar/mortar_lvl4.fbx": preload("res://generated/performance/mortar_level_4_static_batch.res"),
	"res://Model/Tombstone/GLB format/2.glb": preload("res://generated/performance/tombstone_level_2_static_batch.res"),
	"res://Model/Tombstone/GLB format/3.glb": preload("res://generated/performance/tombstone_level_3_static_batch.res"),
	"res://Model/Tombstone/GLB format/4.glb": preload("res://generated/performance/tombstone_level_4_static_batch.res"),
}
const DYNAMIC_NAME_PARTS: Array[String] = [
	"anim", "armature", "skeleton", "ship", "sail", "flag", "tentacle",
	"turret", "cannon", "barrel", "archer", "crystal", "projectile",
	"minecart",
]
const ISLAND_SOURCE_PATH := "res://Model/Island/pirate_island.glb"
const ARCHER_TOWER_SOURCE_PATHS: Array[String] = [
	"res://Model/Archer_towers/tower_1.glb",
	"res://Model/Archer_towers/towerplus_2.fbx",
	"res://Model/Archer_towers/3,4,5.glb",
]
const EXPLICIT_STATIC_INCLUDE_NAME_PARTS: Dictionary = {
	"res://Model/Island/pirate_island.glb": ["barrel", "chest"],
	"res://Model/Turret/scene.gltf": ["stand"],
}
const STATIC_BATCH_PRESERVED_DESCENDANTS: Dictionary = {
	"res://Model/MageTower/1.fbx": ["crystal"],
	"res://Model/MageTower/2.fbx": ["crystal"],
	"res://Model/MageTower/3.fbx": ["crystal"],
}
const RUNTIME_SINGLE_MATERIAL_SOURCES: Dictionary = {
	"res://Model/Altar/Models/Stylized_Altar_web.tscn": true,
	"res://Model/MageTower/1.fbx": true,
	"res://Model/MageTower/2.fbx": true,
	"res://Model/MageTower/3.fbx": true,
	"res://Model/Mortar/mortar_lvl1.fbx": true,
	"res://Model/Mortar/mortar_lvl2.fbx": true,
	"res://Model/Mortar/mortar_lvl3.fbx": true,
	"res://Model/Mortar/mortar_lvl4.fbx": true,
}
# Full TH9 villages with both Air Bomb defenses cross the browser frame budget
# at both 20 Hz and 15 Hz. Ten is the highest locally profiled cadence that keeps
# the complete 42-building guest scene at 56-60 FPS while the renderer remains
# at its normal 60 FPS. Combat crowds use this same validated ceiling below.
const DEFAULT_WEB_ANIMATION_HZ := 10.0
const DENSE_TROOP_ANIMATION_HZ := 10.0
const DENSE_TROOP_THRESHOLD := 24
const DENSITY_REFRESH_INTERVAL_SEC := 0.5
const STATIC_BATCH_REBUILD_DEBOUNCE_SEC := 0.2
const STATIC_SOURCE_POLL_INTERVAL_SEC := 0.1
static var _optimized_materials: Dictionary = {}
static var _optimized_batch_meshes: Dictionary = {}
static var _runtime_material_batch_meshes: Dictionary = {}
static var _active_profile: WebRenderProfile

var _static_batch_signature := ""
var _static_batch_refresh_pending := false
var _static_batch_refresh_delay_remaining := 0.0
var _static_source_poll_remaining := 0.0
var _static_multimesh_container: Node3D
var _static_multimesh_groups: Dictionary = {}
var _static_multimesh_sync_dirty := false
var _building_base_signature := ""
var _building_base_multimesh: MultiMesh
var _building_base_instance: MultiMeshInstance3D
var _building_base_entries: Array[Dictionary] = []
var _building_base_sync_dirty := false
var _managed_animation_players: Dictionary = {}
var _pending_animation_players: Array[WeakRef] = []
var _animation_target_hz := DEFAULT_WEB_ANIMATION_HZ
var _density_refresh_remaining := 0.0

@export var force_enabled: bool = false
@export var water_path: NodePath = NodePath("../Water")
@export var island_visual_path: NodePath = NodePath("../Island/Visual")


func _ready() -> void:
	if not is_enabled():
		set_process(false)
		return
	_active_profile = self
	_animation_target_hz = _resolve_web_animation_hz()
	get_tree().node_added.connect(_on_scene_node_added)
	call_deferred("_register_existing_animation_players")
	_schedule_static_multimesh_refresh()
	call_deferred("_apply_profile")


func _exit_tree() -> void:
	if get_tree() != null and get_tree().node_added.is_connected(_on_scene_node_added):
		get_tree().node_added.disconnect(_on_scene_node_added)
	if _active_profile == self:
		_active_profile = null


func _process(_delta: float) -> void:
	if not is_enabled():
		return
	_register_pending_animation_players()
	if _static_batch_refresh_pending:
		_static_batch_refresh_delay_remaining -= _delta
		if _static_batch_refresh_delay_remaining <= 0.0:
			_static_batch_refresh_pending = false
			_refresh_static_multimeshes()
	_static_source_poll_remaining -= _delta
	if _static_source_poll_remaining <= 0.0:
		_static_source_poll_remaining = STATIC_SOURCE_POLL_INTERVAL_SEC
		_poll_static_multimesh_source_changes()
		_poll_building_base_source_changes()
	if _static_multimesh_sync_dirty:
		_sync_static_multimesh_transforms()
	if _building_base_sync_dirty:
		_sync_building_base_multimesh()
	_density_refresh_remaining -= _delta
	if _density_refresh_remaining <= 0.0:
		_density_refresh_remaining = DENSITY_REFRESH_INTERVAL_SEC
		_refresh_dense_troop_animation_budget()
	_advance_budgeted_animations(_delta)


func _schedule_static_multimesh_refresh() -> void:
	_static_batch_refresh_pending = true
	_static_batch_refresh_delay_remaining = STATIC_BATCH_REBUILD_DEBOUNCE_SEC


func _mark_static_multimesh_dirty() -> void:
	_static_multimesh_sync_dirty = true


func _resolve_web_animation_hz() -> float:
	var local_value := _local_query_value("perf_animation_hz")
	if local_value.is_valid_float():
		return clampf(local_value.to_float(), 10.0, 60.0)
	return DEFAULT_WEB_ANIMATION_HZ


func _on_scene_node_added(node: Node) -> void:
	if node is AnimationPlayer:
		_pending_animation_players.append(weakref(node))
	if node is MeshInstance3D and bool(node.get_meta("building_base", false)):
		_schedule_static_multimesh_refresh()


func _register_pending_animation_players() -> void:
	if _pending_animation_players.is_empty():
		return
	var pending := _pending_animation_players
	_pending_animation_players = []
	for player_ref in pending:
		var player := player_ref.get_ref() as AnimationPlayer
		if is_instance_valid(player):
			_register_animation_player(player)


func _register_existing_animation_players() -> void:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	for raw_player in scene_root.find_children("*", "AnimationPlayer", true, false):
		_register_animation_player(raw_player as AnimationPlayer)
	print(
		"[WEB_ANIMATION_BUDGET] hz=%.1f players=%d"
		% [_animation_target_hz, _managed_animation_players.size()]
	)


func _register_animation_player(player: AnimationPlayer) -> void:
	if player == null or not is_instance_valid(player) or not player.is_inside_tree():
		return
	if bool(player.get_meta("clash_troop_animation_managed", false)):
		return
	var visual_root := _find_animation_visual_root(player)
	if visual_root == null:
		return
	var key := player.get_instance_id()
	if _managed_animation_players.has(key):
		return
	var interval := 1.0 / _animation_target_hz
	var phase_slots := maxi(1, int(round(_animation_target_hz / 10.0)))
	var phase := float(key % phase_slots) / float(phase_slots) * interval
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	_managed_animation_players[key] = {
		"player_ref": weakref(player),
		"visual_root_ref": weakref(visual_root),
		"elapsed": 0.0,
		"interval": interval,
		"base_interval": interval,
		"until_sample": phase,
		"animation": player.current_animation,
	}


func _refresh_dense_troop_animation_budget() -> void:
	var dense_troops: bool = get_tree().get_node_count_in_group("troops") > DENSE_TROOP_THRESHOLD
	var dense_interval: float = 1.0 / DENSE_TROOP_ANIMATION_HZ
	for key in _managed_animation_players.keys():
		var data := _managed_animation_players[key] as Dictionary
		var root_ref := data.get("visual_root_ref") as WeakRef
		var visual_root := root_ref.get_ref() as Node if root_ref != null else null
		var base_interval: float = float(data.get("base_interval", 1.0 / DEFAULT_WEB_ANIMATION_HZ))
		data["interval"] = (
			maxf(base_interval, dense_interval)
			if dense_troops and _has_troop_ancestor(visual_root)
			else base_interval
		)
		_managed_animation_players[key] = data


func _has_troop_ancestor(node: Node) -> bool:
	var current := node
	while current != null:
		if current.is_in_group("troops"):
			return true
		current = current.get_parent()
	return false


func _find_animation_visual_root(player: AnimationPlayer) -> Node3D:
	var current := player.get_parent()
	while current != null:
		if current is Node3D:
			return current as Node3D
		current = current.get_parent()
	return null


func _advance_budgeted_animations(delta: float) -> void:
	if _managed_animation_players.is_empty():
		return
	var stale_keys: Array = []
	for key in _managed_animation_players.keys():
		var data := _managed_animation_players[key] as Dictionary
		var player_ref := data.get("player_ref") as WeakRef
		var player := player_ref.get_ref() as AnimationPlayer if player_ref != null else null
		if (
			not is_instance_valid(player)
			or player.is_queued_for_deletion()
			or not player.is_inside_tree()
		):
			stale_keys.append(key)
			continue
		var current_animation := player.current_animation
		var elapsed := float(data.get("elapsed", 0.0))
		var interval := float(data.get("interval", 1.0 / DEFAULT_WEB_ANIMATION_HZ))
		var until_sample := float(data.get("until_sample", 0.0))
		if current_animation != StringName(data.get("animation", StringName())):
			data["animation"] = current_animation
			elapsed = 0.0
			until_sample = 0.0
		elapsed += delta
		until_sample -= delta
		if until_sample <= 0.0:
			player.advance(elapsed)
			elapsed = 0.0
			while until_sample <= 0.0:
				until_sample += interval
		data["elapsed"] = elapsed
		data["until_sample"] = until_sample
		_managed_animation_players[key] = data
	for key in stale_keys:
		_managed_animation_players.erase(key)


func _apply_profile() -> void:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	var render_scale_text := _local_query_value("perf_render_scale")
	if render_scale_text.is_valid_float():
		get_viewport().scaling_3d_scale = clampf(
			render_scale_text.to_float(),
			0.5,
			1.0
		)
	for environment_node in _find_nodes_of_type(scene_root, "WorldEnvironment"):
		var world_environment := environment_node as WorldEnvironment
		if world_environment == null or world_environment.environment == null:
			continue
		var environment := world_environment.environment.duplicate(true) as Environment
		environment.glow_enabled = false
		# Balance material readability against highlight clipping in the web build.
		environment.ambient_light_color = Color(0.72, 0.78, 0.92, 1.0)
		environment.ambient_light_energy = 1.44
		environment.tonemap_exposure = 0.9
		environment.tonemap_white = 7.0
		environment.ssao_enabled = false
		environment.ssil_enabled = false
		world_environment.environment = environment
	for light_node in _find_nodes_of_type(scene_root, "DirectionalLight3D"):
		var directional_light := light_node as DirectionalLight3D
		if directional_light != null:
			directional_light.shadow_enabled = false
			if directional_light.name == "DirectionalLight3D":
				directional_light.light_energy = 1.41
			elif directional_light.name == "FillLight":
				directional_light.light_energy = 0.61

	var water := get_node_or_null(water_path) as MeshInstance3D
	if water != null:
		_apply_web_water(water)
		var water_material := water.material_override as ShaderMaterial
		if (
			water_material != null
			and _local_query_value("perf_water_depth") == "off"
		):
			water_material.set_shader_parameter("use_depth_fade", false)
	var island_visual := get_node_or_null(island_visual_path)
	if island_visual != null:
		apply_static_batch_for_web(island_visual, ISLAND_SOURCE_PATH)
		optimize_visual_for_web(island_visual)
	_refresh_static_multimeshes()
	if _has_local_probe_options():
		await get_tree().create_timer(8.0).timeout
		_apply_local_probe_options(scene_root)
	print(
		(
			"[WEB_RENDER_PROFILE] applied lighting=directional glow=off "
			+ "shadows=off water=lightweight render_scale=%.2f"
		)
		% get_viewport().scaling_3d_scale
	)


static func is_enabled() -> bool:
	if OS.has_feature("web"):
		return true
	if not OS.is_debug_build():
		return false
	return OS.get_environment("CLASH_DISABLE_OPTIMIZED_RENDER_PROFILE") != "1"


static func optimize_visual_for_web(root: Node) -> void:
	if root == null or not is_enabled():
		return
	_apply_vertex_lighting_recursive(root)


static func apply_static_batch_for_web(root: Node, source_path: String, level: int = 0) -> bool:
	if root == null or not is_enabled() or bool(root.get_meta("web_static_batch_applied", false)):
		return false
	var batch_mesh := _resolve_static_batch(source_path, level)
	if batch_mesh == null:
		return false
	_preserve_named_descendants(root, source_path)
	var animated_roots := _collect_animated_roots(root)
	var explicit_include_name_parts: Array = EXPLICIT_STATIC_INCLUDE_NAME_PARTS.get(source_path, [])
	var hidden_meshes := 0
	var hidden_surfaces := 0
	var runtime_material: Material = null
	for raw_mesh in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if (
			not _matches_explicit_static_include(mesh_instance, explicit_include_name_parts, root)
			and not _is_static_candidate(mesh_instance, animated_roots, root)
		):
			continue
		if (
			runtime_material == null
			and RUNTIME_SINGLE_MATERIAL_SOURCES.has(source_path)
			and batch_mesh.get_surface_count() == 1
			and mesh_instance.mesh != null
			and mesh_instance.mesh.get_surface_count() > 0
		):
			runtime_material = mesh_instance.get_surface_override_material(0)
			if runtime_material == null:
				runtime_material = mesh_instance.mesh.surface_get_material(0)
		hidden_meshes += 1
		if mesh_instance.mesh != null:
			hidden_surfaces += mesh_instance.mesh.get_surface_count()
		mesh_instance.visible = false
	var batch_instance := MeshInstance3D.new()
	batch_instance.name = "WebStaticBatch"
	batch_instance.mesh = (
		_get_runtime_material_batch_mesh(batch_mesh, runtime_material)
		if runtime_material != null
		else batch_mesh
	)
	batch_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(batch_instance)
	root.set_meta("web_static_batch_applied", true)
	if is_instance_valid(_active_profile):
		_active_profile._schedule_static_multimesh_refresh()
		batch_instance.tree_exiting.connect(
			_active_profile._schedule_static_multimesh_refresh,
			CONNECT_ONE_SHOT
		)
	print(
		"[WEB_STATIC_BATCH] source=%s level=%d hidden_meshes=%d hidden_surfaces=%d batch_surfaces=%d"
		% [source_path, level, hidden_meshes, hidden_surfaces, batch_mesh.get_surface_count()]
	)
	return true


static func _preserve_named_descendants(root: Node, source_path: String) -> void:
	var name_parts: Array = STATIC_BATCH_PRESERVED_DESCENDANTS.get(source_path, [])
	if name_parts.is_empty():
		return
	var preserved_nodes: Array[Node3D] = []
	for raw_node in root.find_children("*", "Node3D", true, false):
		var node := raw_node as Node3D
		if node == null or node.get_parent() == root:
			continue
		var lower_name := String(node.name).to_lower()
		for raw_part in name_parts:
			if lower_name.contains(str(raw_part).to_lower()):
				preserved_nodes.append(node)
				break
	for node in preserved_nodes:
		if not is_instance_valid(node) or node.get_parent() == root:
			continue
		var root_relative_transform := _transform_relative_to_ancestor(node, root)
		node.owner = null
		node.get_parent().remove_child(node)
		root.add_child(node)
		node.transform = root_relative_transform


static func _transform_relative_to_ancestor(node: Node3D, ancestor: Node) -> Transform3D:
	var result := node.transform
	var current := node.get_parent()
	while current != null and current != ancestor:
		if current is Node3D:
			result = (current as Node3D).transform * result
		current = current.get_parent()
	return result


static func _resolve_static_batch(source_path: String, level: int) -> ArrayMesh:
	if source_path == ISLAND_SOURCE_PATH:
		return ISLAND_STATIC_BATCH
	if ARCHER_TOWER_SOURCE_PATHS.has(source_path):
		var level_index := clampi(level, 1, ARCHER_TOWER_STATIC_BATCHES.size()) - 1
		return ARCHER_TOWER_STATIC_BATCHES[level_index]
	if BUILDING_STATIC_BATCHES.has(source_path):
		return BUILDING_STATIC_BATCHES[source_path] as ArrayMesh
	return null


static func _matches_explicit_static_include(
	mesh_instance: MeshInstance3D,
	include_name_parts: Array,
	model_root: Node
) -> bool:
	if include_name_parts.is_empty():
		return false
	var current: Node = mesh_instance
	while current != null and current != model_root:
		var lower_name := String(current.name).to_lower()
		for raw_part in include_name_parts:
			if lower_name.contains(str(raw_part).to_lower()):
				return true
		current = current.get_parent()
	return false


static func _collect_animated_roots(root: Node) -> Array[Node]:
	var result: Array[Node] = []
	for raw_player in root.find_children("*", "AnimationPlayer", true, false):
		var player := raw_player as AnimationPlayer
		if player == null:
			continue
		var animation_root := player.get_node_or_null(player.root_node)
		if animation_root == null:
			animation_root = player
		for library_name in player.get_animation_library_list():
			var library := player.get_animation_library(library_name)
			if library == null:
				continue
			for animation_name in library.get_animation_list():
				var animation := library.get_animation(animation_name)
				if animation == null:
					continue
				for track_index in range(animation.get_track_count()):
					var path_text := String(animation.track_get_path(track_index)).get_slice(":", 0)
					if path_text.is_empty():
						continue
					var target := animation_root.get_node_or_null(NodePath(path_text))
					if target != null and not result.has(target):
						result.append(target)
	return result


static func _is_static_candidate(
	mesh_instance: MeshInstance3D,
	animated_roots: Array[Node],
	model_root: Node
) -> bool:
	if mesh_instance == null or mesh_instance.mesh == null:
		return false
	if not mesh_instance.skeleton.is_empty() or _has_skeleton_ancestor(mesh_instance):
		return false
	for animated_root in animated_roots:
		if animated_root == mesh_instance or animated_root.is_ancestor_of(mesh_instance):
			return false
	var current: Node = mesh_instance
	while current != null and current != model_root:
		var lower_name := String(current.name).to_lower()
		if lower_name.ends_with(".fbx") or lower_name.ends_with(".gltf") or lower_name.ends_with(".glb"):
			current = current.get_parent()
			continue
		for part in DYNAMIC_NAME_PARTS:
			if lower_name.contains(part):
				return false
		current = current.get_parent()
	return true


static func _has_skeleton_ancestor(node: Node) -> bool:
	var current := node.get_parent()
	while current != null:
		if current is Skeleton3D:
			return true
		current = current.get_parent()
	return false


static func _apply_vertex_lighting_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var mesh := mesh_instance.mesh
		if mesh != null:
			for surface_index in range(mesh.get_surface_count()):
				var source_material := mesh_instance.get_surface_override_material(surface_index)
				if source_material == null:
					source_material = mesh.surface_get_material(surface_index)
				if not source_material is BaseMaterial3D:
					continue
				var optimized := _get_vertex_lit_material(source_material as BaseMaterial3D)
				if optimized != null:
					mesh_instance.set_surface_override_material(surface_index, optimized)
	for child in node.get_children():
		_apply_vertex_lighting_recursive(child)


static func _get_vertex_lit_material(source: BaseMaterial3D) -> BaseMaterial3D:
	var key := source.get_instance_id()
	if _optimized_materials.has(key):
		return _optimized_materials[key] as BaseMaterial3D
	var optimized := source.duplicate(true) as BaseMaterial3D
	if optimized == null:
		return null
	optimized.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX
	_optimized_materials[key] = optimized
	return optimized


static func _get_vertex_lit_batch_mesh(source: ArrayMesh) -> ArrayMesh:
	if source == null:
		return null
	var key := source.get_instance_id()
	if _optimized_batch_meshes.has(key):
		return _optimized_batch_meshes[key] as ArrayMesh
	var optimized_mesh := source.duplicate(true) as ArrayMesh
	if optimized_mesh == null:
		return source
	for surface_index in range(optimized_mesh.get_surface_count()):
		var source_material := optimized_mesh.surface_get_material(surface_index)
		if source_material is BaseMaterial3D:
			optimized_mesh.surface_set_material(
				surface_index,
				_get_vertex_lit_material(source_material as BaseMaterial3D)
			)
	_optimized_batch_meshes[key] = optimized_mesh
	return optimized_mesh


static func _get_runtime_material_batch_mesh(
	source: ArrayMesh,
	runtime_material: Material
) -> ArrayMesh:
	if source == null or runtime_material == null:
		return source
	var material_signature := _material_signature(runtime_material)
	var key := "%d:%s" % [source.get_instance_id(), material_signature]
	if _runtime_material_batch_meshes.has(key):
		return _runtime_material_batch_meshes[key] as ArrayMesh
	var runtime_mesh := source.duplicate(true) as ArrayMesh
	if runtime_mesh == null:
		return source
	var material_to_use := runtime_material
	if runtime_material is BaseMaterial3D:
		material_to_use = _get_vertex_lit_material(runtime_material as BaseMaterial3D)
	for surface_index in range(runtime_mesh.get_surface_count()):
		runtime_mesh.surface_set_material(surface_index, material_to_use)
	_runtime_material_batch_meshes[key] = runtime_mesh
	return runtime_mesh


static func _material_signature(material: Material) -> String:
	if material is BaseMaterial3D:
		var base := material as BaseMaterial3D
		var albedo_path := (
			base.albedo_texture.resource_path
			if base.albedo_texture != null
			else ""
		)
		var emission_path := (
			base.emission_texture.resource_path
			if base.emission_texture != null
			else ""
		)
		return "%s|%s|%s|%.3f" % [
			albedo_path,
			emission_path,
			base.albedo_color.to_html(true),
			base.emission_energy_multiplier,
		]
	return "instance:%d" % material.get_instance_id()


func _refresh_static_multimeshes() -> void:
	var scene_root := get_tree().current_scene as Node3D
	if scene_root == null:
		return
	_refresh_building_base_multimesh(scene_root)
	var grouped: Dictionary = {}
	for raw_batch in scene_root.find_children("WebStaticBatch", "MeshInstance3D", true, false):
		var batch := raw_batch as MeshInstance3D
		if (
			batch == null
			or batch.is_queued_for_deletion()
			or batch.mesh == null
			or not batch.mesh is ArrayMesh
		):
			continue
		var owner_root := batch.get_parent() as Node3D
		if owner_root == null or owner_root.is_queued_for_deletion():
			continue
		var key := batch.mesh.resource_path
		if key.is_empty():
			key = "instance:%d" % batch.mesh.get_instance_id()
		var entries: Array = grouped.get(key, [])
		entries.append({"batch": batch, "owner": owner_root})
		grouped[key] = entries

	var signature_parts: Array[String] = []
	var sorted_keys := grouped.keys()
	sorted_keys.sort()
	for raw_key in sorted_keys:
		var key := str(raw_key)
		var ids: Array[String] = []
		for entry in grouped[key] as Array:
			var batch := entry.get("batch") as MeshInstance3D
			if is_instance_valid(batch) and not batch.is_queued_for_deletion():
				ids.append(str(batch.get_instance_id()))
		ids.sort()
		signature_parts.append("%s:%s" % [key, ",".join(ids)])
	var next_signature := "|".join(signature_parts)
	if next_signature == _static_batch_signature:
		return
	_static_batch_signature = next_signature
	_rebuild_static_multimeshes(scene_root, grouped, sorted_keys)


func _rebuild_static_multimeshes(scene_root: Node3D, grouped: Dictionary, sorted_keys: Array) -> void:
	for group_data in _static_multimesh_groups.values():
		var old_instance_ref := group_data.get("instance_ref") as WeakRef
		var old_instance := old_instance_ref.get_ref() as MultiMeshInstance3D if old_instance_ref != null else null
		if is_instance_valid(old_instance):
			old_instance.queue_free()
	_static_multimesh_groups.clear()

	for raw_batch in scene_root.find_children("WebStaticBatch", "MeshInstance3D", true, false):
		var batch := raw_batch as MeshInstance3D
		if batch != null and not batch.is_queued_for_deletion():
			batch.visible = true

	if _static_multimesh_container == null or not is_instance_valid(_static_multimesh_container):
		_static_multimesh_container = Node3D.new()
		_static_multimesh_container.name = "WebStaticMultiMeshes"
		scene_root.add_child(_static_multimesh_container)

	var grouped_instances := 0
	for raw_key in sorted_keys:
		var key := str(raw_key)
		var entries := grouped.get(key, []) as Array
		if entries.size() < 2:
			continue
		var first_batch := entries[0].get("batch") as MeshInstance3D
		if first_batch == null or not first_batch.mesh is ArrayMesh:
			continue
		var multimesh := MultiMesh.new()
		multimesh.transform_format = (
			MultiMesh.TRANSFORM_3D as MultiMesh.TransformFormat
		)
		multimesh.mesh = _get_vertex_lit_batch_mesh(first_batch.mesh as ArrayMesh)
		var multimesh_instance := MultiMeshInstance3D.new()
		multimesh_instance.name = "WebStaticMultiMesh_%d" % _static_multimesh_groups.size()
		multimesh_instance.multimesh = multimesh
		multimesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_static_multimesh_container.add_child(multimesh_instance)
		var runtime_entries: Array[Dictionary] = []
		for entry in entries:
			var batch := entry.get("batch") as MeshInstance3D
			var owner_root := entry.get("owner") as Node3D
			if is_instance_valid(batch) and not batch.is_queued_for_deletion():
				batch.visible = false
			if is_instance_valid(batch) and is_instance_valid(owner_root):
				runtime_entries.append({
					"batch_ref": weakref(batch),
					"owner_ref": weakref(owner_root),
					"last_transform": batch.global_transform,
					"last_visible": owner_root.is_visible_in_tree(),
					"source_missing": false,
				})
		multimesh.instance_count = runtime_entries.size()
		_static_multimesh_groups[key] = {
			"instance_ref": weakref(multimesh_instance),
			"multimesh": multimesh,
			"entries": runtime_entries,
		}
		grouped_instances += runtime_entries.size()
	_mark_static_multimesh_dirty()
	_sync_static_multimesh_transforms()
	print(
		"[WEB_STATIC_MULTIMESH] groups=%d instances=%d unique_batches=%d"
		% [_static_multimesh_groups.size(), grouped_instances, grouped.size()]
	)


func _refresh_building_base_multimesh(scene_root: Node3D) -> void:
	var candidates: Array[Dictionary] = []
	var signature_parts: Array[String] = []
	for raw_base in scene_root.find_children("BuildingBase", "MeshInstance3D", true, false):
		var base := raw_base as MeshInstance3D
		if base == null or base.is_queued_for_deletion() or not base.mesh is QuadMesh:
			continue
		var owner_root := base.get_parent() as Node3D
		if owner_root == null or not owner_root.has_meta("building_type"):
			continue
		var quad := base.mesh as QuadMesh
		var size := quad.size
		var aspect_ratio := size.x / maxf(size.y, 0.001)
		var dash_count := 2.0 * (size.x + size.y) * 6.0
		candidates.append({
			"base": base,
			"owner": owner_root,
			"size": size,
			"aspect_ratio": aspect_ratio,
			"dash_count": dash_count,
		})
		signature_parts.append(
			"%d:%.4f:%.4f" % [base.get_instance_id(), size.x, size.y]
		)
	signature_parts.sort()
	var next_signature := "|".join(signature_parts)
	if next_signature == _building_base_signature:
		return
	_building_base_signature = next_signature

	for entry in _building_base_entries:
		var old_ref := entry.get("base_ref") as WeakRef
		var old_base := old_ref.get_ref() as MeshInstance3D if old_ref != null else null
		if is_instance_valid(old_base) and not old_base.is_queued_for_deletion():
			old_base.visible = true
	_building_base_entries.clear()

	if candidates.size() < 2:
		if is_instance_valid(_building_base_instance):
			_building_base_instance.queue_free()
		_building_base_instance = null
		_building_base_multimesh = null
		return

	if _static_multimesh_container == null or not is_instance_valid(_static_multimesh_container):
		_static_multimesh_container = Node3D.new()
		_static_multimesh_container.name = "WebStaticMultiMeshes"
		scene_root.add_child(_static_multimesh_container)
	if is_instance_valid(_building_base_instance):
		_building_base_instance.queue_free()

	var material := ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = BUILDING_BASE_MULTIMESH_SHADER_CODE
	material.shader = shader
	var unit_quad := QuadMesh.new()
	unit_quad.size = Vector2.ONE
	unit_quad.material = material

	_building_base_multimesh = MultiMesh.new()
	_building_base_multimesh.transform_format = (
		MultiMesh.TRANSFORM_3D as MultiMesh.TransformFormat
	)
	_building_base_multimesh.use_custom_data = true
	_building_base_multimesh.mesh = unit_quad
	_building_base_multimesh.instance_count = candidates.size()

	_building_base_instance = MultiMeshInstance3D.new()
	_building_base_instance.name = "WebBuildingBases"
	_building_base_instance.multimesh = _building_base_multimesh
	_building_base_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_static_multimesh_container.add_child(_building_base_instance)

	for index in range(candidates.size()):
		var candidate := candidates[index]
		var base := candidate.get("base") as MeshInstance3D
		var owner_root := candidate.get("owner") as Node3D
		base.visible = false
		_building_base_entries.append({
			"base_ref": weakref(base),
			"owner_ref": weakref(owner_root),
			"size": candidate.get("size", Vector2.ONE),
			"last_transform": base.global_transform,
			"last_visible": owner_root.is_visible_in_tree(),
			"source_missing": false,
		})
		_building_base_multimesh.set_instance_custom_data(
			index,
			Color(
				float(candidate.get("aspect_ratio", 1.0)),
				float(candidate.get("dash_count", 28.0)),
				0.0,
				0.0
			)
		)
	_building_base_sync_dirty = true
	_sync_building_base_multimesh()
	print("[WEB_BUILDING_BASE_BATCH] instances=%d draw_calls=1" % candidates.size())


func _sync_building_base_multimesh() -> void:
	if (
		_building_base_multimesh == null
		or _static_multimesh_container == null
		or not is_instance_valid(_static_multimesh_container)
	):
		return
	_building_base_sync_dirty = false
	var container_inverse := _static_multimesh_container.global_transform.affine_inverse()
	var hidden_transform := Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO)
	for index in range(mini(
		_building_base_multimesh.instance_count,
		_building_base_entries.size()
	)):
		var entry := _building_base_entries[index]
		var base_ref := entry.get("base_ref") as WeakRef
		var owner_ref := entry.get("owner_ref") as WeakRef
		var base := base_ref.get_ref() as MeshInstance3D if base_ref != null else null
		var owner_root := owner_ref.get_ref() as Node3D if owner_ref != null else null
		if (
			is_instance_valid(base)
			and is_instance_valid(owner_root)
			and not base.is_queued_for_deletion()
			and not owner_root.is_queued_for_deletion()
			and owner_root.is_visible_in_tree()
		):
			var size: Vector2 = entry.get("size", Vector2.ONE)
			var size_transform := Transform3D(
				Basis.from_scale(Vector3(size.x, size.y, 1.0)),
				Vector3.ZERO
			)
			_building_base_multimesh.set_instance_transform(
				index,
				container_inverse * base.global_transform * size_transform
			)
		else:
			_building_base_multimesh.set_instance_transform(index, hidden_transform)


func _poll_building_base_source_changes() -> void:
	for entry in _building_base_entries:
		var base_ref := entry.get("base_ref") as WeakRef
		var owner_ref := entry.get("owner_ref") as WeakRef
		var base := base_ref.get_ref() as MeshInstance3D if base_ref != null else null
		var owner_root := owner_ref.get_ref() as Node3D if owner_ref != null else null
		if (
			not is_instance_valid(base)
			or not is_instance_valid(owner_root)
			or base.is_queued_for_deletion()
			or owner_root.is_queued_for_deletion()
		):
			if not bool(entry.get("source_missing", false)):
				entry["source_missing"] = true
				_building_base_sync_dirty = true
				_schedule_static_multimesh_refresh()
			continue
		var current_transform := base.global_transform
		var current_visible := owner_root.is_visible_in_tree()
		var previous_transform: Transform3D = entry.get("last_transform", current_transform)
		var previous_visible := bool(entry.get("last_visible", current_visible))
		if (
			not current_transform.is_equal_approx(previous_transform)
			or current_visible != previous_visible
			or bool(entry.get("source_missing", false))
		):
			entry["last_transform"] = current_transform
			entry["last_visible"] = current_visible
			entry["source_missing"] = false
			_building_base_sync_dirty = true


func _sync_static_multimesh_transforms() -> void:
	if _static_multimesh_container == null or not is_instance_valid(_static_multimesh_container):
		return
	_static_multimesh_sync_dirty = false
	var container_inverse := _static_multimesh_container.global_transform.affine_inverse()
	var hidden_transform := Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO)
	for group_data in _static_multimesh_groups.values():
		var multimesh := group_data.get("multimesh") as MultiMesh
		var entries := group_data.get("entries", []) as Array
		if multimesh == null:
			continue
		for index in range(mini(multimesh.instance_count, entries.size())):
			var entry := entries[index] as Dictionary
			var batch_ref := entry.get("batch_ref") as WeakRef
			var owner_ref := entry.get("owner_ref") as WeakRef
			var batch := batch_ref.get_ref() as MeshInstance3D if batch_ref != null else null
			var owner_root := owner_ref.get_ref() as Node3D if owner_ref != null else null
			if (
				is_instance_valid(batch)
				and is_instance_valid(owner_root)
				and not batch.is_queued_for_deletion()
				and not owner_root.is_queued_for_deletion()
				and owner_root.is_visible_in_tree()
			):
				multimesh.set_instance_transform(index, container_inverse * batch.global_transform)
			else:
				multimesh.set_instance_transform(index, hidden_transform)


func _poll_static_multimesh_source_changes() -> void:
	for group_data in _static_multimesh_groups.values():
		var entries := group_data.get("entries", []) as Array
		for raw_entry in entries:
			var entry := raw_entry as Dictionary
			var batch_ref := entry.get("batch_ref") as WeakRef
			var owner_ref := entry.get("owner_ref") as WeakRef
			var batch := (
				batch_ref.get_ref() as MeshInstance3D
				if batch_ref != null
				else null
			)
			var owner_root := (
				owner_ref.get_ref() as Node3D
				if owner_ref != null
				else null
			)
			if (
				not is_instance_valid(batch)
				or not is_instance_valid(owner_root)
				or batch.is_queued_for_deletion()
				or owner_root.is_queued_for_deletion()
			):
				if not bool(entry.get("source_missing", false)):
					entry["source_missing"] = true
					_mark_static_multimesh_dirty()
				continue
			var current_transform := batch.global_transform
			var current_visible := owner_root.is_visible_in_tree()
			var previous_transform: Transform3D = entry.get("last_transform", current_transform)
			var previous_visible := bool(entry.get("last_visible", current_visible))
			if (
				not current_transform.is_equal_approx(previous_transform)
				or current_visible != previous_visible
				or bool(entry.get("source_missing", false))
			):
				entry["last_transform"] = current_transform
				entry["last_visible"] = current_visible
				entry["source_missing"] = false
				_mark_static_multimesh_dirty()


func _apply_web_water(water: MeshInstance3D) -> void:
	var material := PERFORMANCE_WATER_MATERIAL.duplicate(true) as ShaderMaterial
	water.material_override = material
	if water.mesh is PlaneMesh:
		var source_plane := water.mesh as PlaneMesh
		var web_plane := source_plane.duplicate(true) as PlaneMesh
		web_plane.subdivide_width = mini(source_plane.subdivide_width, 24)
		web_plane.subdivide_depth = mini(source_plane.subdivide_depth, 24)
		water.mesh = web_plane


func _find_nodes_of_type(node: Node, type_name: String) -> Array[Node]:
	var result: Array[Node] = []
	if node.is_class(type_name):
		result.append(node)
	for child in node.get_children():
		result.append_array(_find_nodes_of_type(child, type_name))
	return result


func _has_local_probe_options() -> bool:
	return (
		_local_query_value("perf_water") == "off"
		or _local_query_value("perf_water_depth") == "off"
		or _local_query_value("perf_render_scale").is_valid_float()
		or _local_query_value("perf_animations") == "off"
		or _local_query_value("perf_home_troops") == "off"
		or _local_query_value("perf_building_process") == "off"
		or _local_query_value("perf_ship_process") == "off"
	)


func _apply_local_probe_options(scene_root: Node) -> void:
	var applied: Array[String] = []
	if _local_query_value("perf_water") == "off":
		var water := scene_root.get_node_or_null("Water") as MeshInstance3D
		if water != null:
			water.visible = false
			applied.append("water")
	if _local_query_value("perf_animations") == "off":
		for raw_player in scene_root.find_children("*", "AnimationPlayer", true, false):
			var player := raw_player as AnimationPlayer
			if player != null:
				player.active = false
		applied.append("animations")
	if _local_query_value("perf_home_troops") == "off":
		for troop in get_tree().get_nodes_in_group("home_troops"):
			if is_instance_valid(troop):
				troop.set_process(false)
		applied.append("home_troops")
	if _local_query_value("perf_building_process") == "off":
		for building_system in get_tree().get_nodes_in_group("building_systems"):
			if is_instance_valid(building_system):
				building_system.set_process(false)
		applied.append("building_process")
	if _local_query_value("perf_ship_process") == "off":
		var ship := scene_root.get_node_or_null("MainShipController")
		if ship != null:
			ship.set_process(false)
			applied.append("ship_process")
	print("[LOCAL_PERF_PROBE] disabled=", applied)


func _local_query_value(key: String) -> String:
	if not OS.has_feature("web"):
		return ""
	var host := String(JavaScriptBridge.eval("window.location.hostname", true)).to_lower()
	if host not in ["localhost", "127.0.0.1", "::1", "[::1]"]:
		return ""
	var script := "(new URL(window.location.href)).searchParams.get('%s') || ''" % key
	return String(JavaScriptBridge.eval(script, true)).strip_edges().to_lower()
