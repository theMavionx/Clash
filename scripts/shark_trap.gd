extends Node3D
## Hidden, single-use ground trap. The server independently derives the same
## target and damage from replay movement; this script mirrors that result and
## owns presentation only.

const DAMAGE_LEVELS: Array[int] = [500, 750, 1050, 1450, 2000, 2400, 2900, 3400, 3900]
const TRIGGER_PADDING: float = 0.018
const HEAD_TIP_HEIGHT: float = 0.105
const HEAD_VISIBLE_DEPTH: float = 0.10
const HEAD_TOP_SLICE_RATIO: float = 0.18
const BITE_EXTRA_HEIGHT: float = 0.075
const RISE_DURATION: float = 0.20
const BITE_HOLD_DURATION: float = 0.22
const SINK_DURATION: float = 0.24
const COMBINED_WEB_SHARK_MESH: ArrayMesh = preload(
	"res://generated/performance/shark_combined_web.res"
)

var _bs: Node = null
var _visual_model: Node3D = null
var _water_marker: MeshInstance3D = null
var _preview_player: AnimationPlayer = null
var _spent: bool = false
var _level: int = 1
var _damage: int = DAMAGE_LEVELS[0]
var _head_rest_position := Vector3.ZERO
var _head_hidden_position := Vector3.ZERO
var _bite_tracking: bool = false
var _bite_target_local := Vector3.ZERO
var _bite_target: Node3D = null
var _combat_concealed: bool = false
var _freeze_remaining: float = 0.0
var _battle_ended: bool = false


func _ready() -> void:
	_bs = get_parent()
	_visual_model = _find_visual_model()
	_optimize_web_shark_mesh()
	set_meta("trap_spent", false)
	set_meta("trap_level", _level)
	set_meta("trap_damage", _damage)
	_configure_vertical_head()
	_create_water_marker()
	if _is_combat_active():
		_enter_attacker_view()
	else:
		_setup_owner_preview()
	process_priority = 100
	set_process(false)
	# Keep this lightweight watcher active on the owner island too. The TestMain
	# self-attack flow enables AttackSystem directly instead of switching bases,
	# so combat state can change after this node has already entered the tree.
	set_physics_process(true)


func _process(_delta: float) -> void:
	if _battle_ended:
		return
	if _bite_tracking and is_instance_valid(_visual_model):
		if is_instance_valid(_bite_target):
			_bite_target_local = to_local(_bite_target.global_position)
		_align_visual_head_to_local_target(_bite_target_local)


func set_level(level: int) -> void:
	_level = clampi(level, 1, DAMAGE_LEVELS.size())
	_damage = DAMAGE_LEVELS[_level - 1]
	set_meta("trap_level", _level)
	set_meta("trap_damage", _damage)


func set_ward_bonus_pct(_pct: int) -> void:
	pass


func _physics_process(delta: float) -> void:
	if _battle_ended or _spent or not is_instance_valid(_bs):
		return
	delta = BaseTroop.combat_delta(delta)
	if _freeze_remaining > 0.0:
		_freeze_remaining = maxf(0.0, _freeze_remaining - delta)
		return
	if not _is_combat_active():
		if _combat_concealed:
			_exit_attacker_view()
		return
	if not _combat_concealed:
		_enter_attacker_view()
	var target := _find_trigger_target()
	if target != null:
		_trigger(target)


func freeze_for(duration: float) -> void:
	_freeze_remaining = maxf(_freeze_remaining, maxf(0.0, duration))


## Ends trap combat without consuming or detonating it. Town Hall victory uses
## this before the generic building-destruction cascade, so an armed trap can
## neither find a late target nor continue a bite presentation after the battle
## has already been won.
func deactivate_after_battle_end() -> void:
	if _battle_ended:
		return
	_battle_ended = true
	_bite_tracking = false
	_bite_target = null
	set_process(false)
	set_physics_process(false)
	if is_instance_valid(_preview_player):
		_preview_player.stop()
	if is_instance_valid(_visual_model):
		_visual_model.visible = false
	if is_instance_valid(_water_marker):
		_water_marker.visible = false
	set_meta("trap_neutralized_after_battle_end", true)


func _is_enemy_battle() -> bool:
	return is_instance_valid(_bs) and bool(_bs.get("is_viewing_enemy"))


func _is_combat_active() -> bool:
	if _is_enemy_battle():
		return true
	if not is_instance_valid(_bs):
		return false
	var attack_system := _bs.get_node_or_null("../AttackSystem")
	return attack_system != null and bool(attack_system.get("is_attack_mode"))


func _enter_attacker_view() -> void:
	_combat_concealed = true
	if is_instance_valid(_preview_player):
		_preview_player.stop()
	if is_instance_valid(_visual_model):
		_visual_model.position = _head_hidden_position
		_visual_model.visible = false
	if is_instance_valid(_water_marker):
		_water_marker.visible = false
	print("[SHARK_TRAP] armed and concealed server_id=", int(get_meta("server_id", -1)))


func _exit_attacker_view() -> void:
	_combat_concealed = false
	_setup_owner_preview()


func _find_visual_model() -> Node3D:
	for child in get_children():
		if child is Node3D and child.has_meta("building_visual_model"):
			return child as Node3D
	return null


func _optimize_web_shark_mesh() -> void:
	set_meta("web_shark_opt_reason", "start")
	if not OS.has_feature("web"):
		set_meta("web_shark_opt_reason", "not_web")
		return
	if not is_instance_valid(_visual_model):
		set_meta("web_shark_opt_reason", "visual_missing")
		return
	var parts: Array[MeshInstance3D] = []
	for raw_mesh in _visual_model.find_children(
		"*",
		"MeshInstance3D",
		true,
		false
	):
		var mesh_instance := raw_mesh as MeshInstance3D
		if (
			mesh_instance != null
			and mesh_instance.mesh != null
			and mesh_instance.skin != null
		):
			parts.append(mesh_instance)
	if parts.size() != 2:
		set_meta("web_shark_opt_reason", "parts_%d" % parts.size())
		return
	var skeleton := parts[0].get_node_or_null(
		parts[0].skeleton
	) as Skeleton3D
	if skeleton == null:
		set_meta("web_shark_opt_reason", "skeleton_missing")
		return
	var material := parts[0].get_active_material(0)
	if material == null or parts[1].get_active_material(0) != material:
		set_meta("web_shark_opt_reason", "material_mismatch")
		return
	var combined := MeshInstance3D.new()
	combined.name = "CombinedWebShark"
	combined.mesh = COMBINED_WEB_SHARK_MESH
	combined.skin = parts[0].skin
	combined.skeleton = NodePath("..")
	combined.cast_shadow = parts[0].cast_shadow
	combined.visibility_range_end = parts[0].visibility_range_end
	skeleton.add_child(combined)
	SkinnedMeshCombiner.prune_mesh_sources(parts)
	set_meta("web_shark_mesh_combined", true)
	set_meta("web_shark_opt_reason", "combined")


func _configure_vertical_head() -> void:
	if not is_instance_valid(_visual_model):
		return
	# The imported shark faces local +Z. Rotating -90 degrees around X leaves
	# the head above the terrain while the body remains hidden below it.
	_visual_model.rotation_degrees.x = -90.0
	var bounds := _visual_bounds_in_trap_space(_visual_model)
	if bounds.size != Vector3.ZERO:
		_visual_model.position.y += HEAD_TIP_HEIGHT - bounds.end.y
	var head_anchor := _visual_top_anchor_in_trap_space(_visual_model)
	if is_finite(head_anchor.x) and is_finite(head_anchor.z):
		_visual_model.position.x -= head_anchor.x
		_visual_model.position.z -= head_anchor.z
	else:
		_visual_model.position.z += 0.065
	_head_rest_position = _visual_model.position
	_head_hidden_position = _head_rest_position - Vector3(0.0, HEAD_VISIBLE_DEPTH + 0.08, 0.0)
	var centered_anchor := _visual_top_anchor_in_trap_space(_visual_model)
	set_meta("shark_head_center_error", Vector2(centered_anchor.x, centered_anchor.z).length())
	set_meta("shark_head_visual_ready", true)


func _visual_bounds_in_trap_space(root: Node3D) -> AABB:
	var has_bounds := false
	var minimum := Vector3(INF, INF, INF)
	var maximum := Vector3(-INF, -INF, -INF)
	for child in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var local_aabb := mesh_instance.get_aabb()
		var mesh_to_trap := _transform_to_ancestor(mesh_instance, self)
		for corner_index in range(8):
			var corner := Vector3(
				local_aabb.position.x + local_aabb.size.x * float(corner_index & 1),
				local_aabb.position.y + local_aabb.size.y * float((corner_index >> 1) & 1),
				local_aabb.position.z + local_aabb.size.z * float((corner_index >> 2) & 1)
			)
			var point := mesh_to_trap * corner
			minimum = minimum.min(point)
			maximum = maximum.max(point)
			has_bounds = true
	return AABB(minimum, maximum - minimum) if has_bounds else AABB()


static func _transform_to_ancestor(node: Node3D, ancestor: Node3D) -> Transform3D:
	var result := node.transform
	var parent := node.get_parent()
	while parent != null and parent != ancestor:
		if parent is Node3D:
			result = (parent as Node3D).transform * result
		parent = parent.get_parent()
	return result


func _visual_top_anchor_in_trap_space(root: Node3D) -> Vector3:
	var points: Array[Vector3] = []
	var min_y := INF
	var max_y := -INF
	for child in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var mesh_to_trap := _transform_to_ancestor(mesh_instance, self)
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var arrays := mesh_instance.mesh.surface_get_arrays(surface_index)
			if arrays.size() <= Mesh.ARRAY_VERTEX or arrays[Mesh.ARRAY_VERTEX] == null:
				continue
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			for vertex in vertices:
				var point: Vector3 = mesh_to_trap * vertex
				points.append(point)
				min_y = minf(min_y, point.y)
				max_y = maxf(max_y, point.y)
	if points.is_empty() or not is_finite(min_y) or not is_finite(max_y):
		return Vector3(INF, INF, INF)
	var threshold := max_y - maxf(0.001, max_y - min_y) * HEAD_TOP_SLICE_RATIO
	var anchor := Vector3.ZERO
	var count := 0
	for point in points:
		if point.y >= threshold:
			anchor += point
			count += 1
	return anchor / float(count) if count > 0 else Vector3(INF, INF, INF)


func visual_head_alignment_error_to(global_target: Vector3) -> float:
	if not is_instance_valid(_visual_model):
		return INF
	var anchor := _visual_top_anchor_in_trap_space(_visual_model)
	var local_target := to_local(global_target)
	return Vector2(anchor.x - local_target.x, anchor.z - local_target.z).length()


func is_concealed_from_attacker() -> bool:
	if not _is_combat_active() or _spent:
		return false
	var model_hidden := not is_instance_valid(_visual_model) or not _visual_model.visible
	var marker_hidden := not is_instance_valid(_water_marker) or not _water_marker.visible
	return model_hidden and marker_hidden


func _align_visual_head_to_local_target(local_target: Vector3) -> Vector3:
	var anchor := _visual_top_anchor_in_trap_space(_visual_model)
	if not is_finite(anchor.x) or not is_finite(anchor.z):
		return Vector3.ZERO
	var correction := Vector3(local_target.x - anchor.x, 0.0, local_target.z - anchor.z)
	_visual_model.position += correction
	return correction


func _setup_owner_preview() -> void:
	if not is_instance_valid(_visual_model):
		return
	_visual_model.position = _head_rest_position
	_visual_model.visible = true
	if is_instance_valid(_water_marker):
		_water_marker.visible = true
	_preview_player = _find_animation_player(_visual_model)
	_play_matching_animation(_preview_player, "swim", 0.62)
	if _preview_player != null and not _preview_player.animation_finished.is_connected(_on_preview_animation_finished):
		_preview_player.animation_finished.connect(_on_preview_animation_finished)


func _on_preview_animation_finished(_animation_name: StringName) -> void:
	if not _spent and not _is_enemy_battle():
		_play_matching_animation(_preview_player, "swim", 0.62)


func _create_water_marker() -> void:
	if is_instance_valid(_water_marker):
		return
	_water_marker = MeshInstance3D.new()
	_water_marker.name = "SharkTrapWaterMarker"
	var puddle := CylinderMesh.new()
	puddle.top_radius = 0.15
	puddle.bottom_radius = 0.15
	puddle.height = 0.008
	puddle.radial_segments = 40
	_water_marker.mesh = puddle
	_water_marker.position.y = 0.003
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.035, 0.48, 0.78, 0.68)
	material.metallic = 0.08
	material.roughness = 0.18
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.render_priority = 1
	_water_marker.material_override = material
	add_child(_water_marker)


func _find_trigger_target() -> Node3D:
	var half_extent := Vector2(0.16, 0.16)
	if "building_defs" in _bs and "cell_size" in _bs:
		var def: Dictionary = _bs.building_defs.get("shark_trap", {})
		var cells: Vector2i = def.get("cells", Vector2i(2, 2))
		half_extent = Vector2(cells.x, cells.y) * float(_bs.cell_size) * 0.5
	var selected: Node3D = null
	var selected_distance := INF
	var selected_order := 0x7FFFFFFF
	for candidate in BaseTroop._get_troops_cached():
		if not BaseTroop.is_live_troop(candidate) or BaseTroop.is_air_troop(candidate):
			continue
		var local_target: Vector3 = _bs.to_local(candidate.global_position)
		var offset := Vector2(local_target.x - position.x, local_target.z - position.z)
		if absf(offset.x) <= half_extent.x + TRIGGER_PADDING and absf(offset.y) <= half_extent.y + TRIGGER_PADDING:
			var distance := offset.length_squared()
			var replay_order := int(candidate.get_meta("replay_order", candidate.get_instance_id()))
			if distance < selected_distance - 0.000001 or (is_equal_approx(distance, selected_distance) and replay_order < selected_order):
				selected = candidate as Node3D
				selected_distance = distance
				selected_order = replay_order
	return selected


func _trigger(target: Node3D) -> void:
	if _battle_ended or _spent or not is_instance_valid(target):
		return
	_spent = true
	set_meta("trap_spent", true)
	set_physics_process(false)
	var target_position := target.global_position
	var target_local := to_local(target_position)
	var replay_order := int(target.get_meta("replay_order", -1))
	var hp_before := int(target.get("hp"))
	var trap_immune := target.has_method("is_trap_immune") and bool(target.call("is_trap_immune"))
	var instant_kill := not trap_immune and not _is_demon_king(target)
	var applied_damage := 0 if trap_immune else (maxi(1, hp_before) if instant_kill else _damage)
	if is_instance_valid(_bs) and _bs.has_method("record_replay_telemetry"):
		_bs.record_replay_telemetry("shark_trap_trigger", {
			"building_id": int(get_meta("server_id", -1)),
			"level": _level,
			"damage": applied_damage,
			"level_damage": _damage,
			"instant_kill": instant_kill,
			"trap_immune": trap_immune,
			"replay_order": replay_order,
			"hp_before": hp_before,
			"hp_after": hp_before if trap_immune else maxi(0, hp_before - applied_damage),
			"x": snappedf(target_position.x, 0.001),
			"z": snappedf(target_position.z, 0.001),
		})
	var visual_duration := RISE_DURATION + BITE_HOLD_DURATION
	if applied_damage <= 0:
		if target.has_method("_record_replay_telemetry"):
			target.call("_record_replay_telemetry", "shark_trap_immune", {
				"damage": 0,
				"hp_before": hp_before,
				"hp_after": hp_before,
			})
	elif target.has_method("damage_by_shark_trap"):
		target.call("damage_by_shark_trap", applied_damage, visual_duration)
	elif target.has_method("take_damage"):
		target.call("take_damage", applied_damage)
	_play_bite_effect(target, target_local)


static func _is_demon_king(target: Node) -> bool:
	if target != null and target.has_method("_get_troop_name"):
		return str(target.call("_get_troop_name")).to_lower().replace("_", "") == "demonking"
	return false


func _play_bite_effect(target: Node3D, target_local: Vector3) -> void:
	if _battle_ended or not is_instance_valid(_visual_model):
		return
	_visual_model.visible = true
	_visual_model.position = _head_hidden_position
	_bite_target = target
	_bite_target_local = target_local
	_bite_tracking = true
	set_process(true)
	_align_visual_head_to_local_target(target_local)
	var bite_hidden_position := _visual_model.position
	var bite_rest_position := bite_hidden_position + Vector3(0.0, HEAD_VISIBLE_DEPTH + 0.08, 0.0)
	if is_instance_valid(_water_marker):
		_water_marker.visible = true
		_water_marker.position.x = target_local.x
		_water_marker.position.z = target_local.z
		_water_marker.scale = Vector3(0.35, 1.0, 0.35)
		var marker_tween := create_tween()
		marker_tween.tween_property(_water_marker, "scale", Vector3(1.22, 1.0, 1.22), RISE_DURATION).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_preview_player = _find_animation_player(_visual_model)
	_play_matching_animation(_preview_player, "swim_bite", 1.15)
	var rise := create_tween()
	rise.tween_property(_visual_model, "position:y", bite_rest_position.y + BITE_EXTRA_HEIGHT, RISE_DURATION).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await rise.finished
	if _battle_ended or not is_instance_valid(_visual_model):
		return
	var post_rise_correction := _align_visual_head_to_local_target(target_local)
	bite_hidden_position += post_rise_correction
	await get_tree().create_timer(BITE_HOLD_DURATION).timeout
	if _battle_ended or not is_instance_valid(_visual_model):
		return
	var sink := create_tween()
	sink.tween_property(_visual_model, "position:y", bite_hidden_position.y, SINK_DURATION).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	if is_instance_valid(_water_marker):
		sink.parallel().tween_property(_water_marker, "scale", Vector3.ZERO, SINK_DURATION)
	await sink.finished
	if _battle_ended:
		return
	_bite_tracking = false
	_bite_target = null
	set_process(false)
	if is_instance_valid(_visual_model):
		_visual_model.visible = false
	if is_instance_valid(_water_marker):
		_water_marker.visible = false


static func _find_animation_player(root: Node) -> AnimationPlayer:
	if root is AnimationPlayer:
		return root as AnimationPlayer
	for child in root.get_children():
		var found := _find_animation_player(child)
		if found != null:
			return found
	return null


static func _play_matching_animation(player: AnimationPlayer, token: String, speed: float = 1.0) -> void:
	if player == null:
		return
	var normalized := token.to_lower().replace("_", "")
	for animation_name in player.get_animation_list():
		var candidate := String(animation_name).to_lower().replace("_", "")
		if candidate.contains(normalized):
			player.play(animation_name, 0.08, speed)
			return
