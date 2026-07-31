class_name TroopStatusBatch
extends Node3D
## Shared tactical status coating for deployed troops.
##
## The coating reuses the building-upgrade hologram shader. Materials are
## shared per effect and assigned only when a status changes, avoiding per-frame
## material churn while preserving every troop's original overlay.

const EFFECT_RAGE: StringName = &"rage"
const EFFECT_HEAL: StringName = &"heal"
const STATUS_SHADER: Shader = preload("res://shaders/upgrade_outline.gdshader")
const RAGE_COLOR := Color(1.0, 0.34, 0.04, 0.90)
const HEAL_COLOR := Color(0.10, 0.88, 0.28, 0.82)
const RAGE_OUTLINE_WIDTH: float = 0.030
const HEAL_OUTLINE_WIDTH: float = 0.024

static var _scene_managers: Dictionary = {}

var _rage_entries: Dictionary = {}
var _heal_entries: Dictionary = {}
var _applied_effects: Dictionary = {}
var _overlay_restore: Dictionary = {}
var _rage_material: ShaderMaterial = null
var _heal_material: ShaderMaterial = null


static func get_for_scene(context_node: Node) -> TroopStatusBatch:
	if context_node == null or context_node.get_tree() == null:
		return null
	var scene_root: Node = context_node.get_tree().current_scene
	if scene_root == null:
		scene_root = context_node.get_tree().root
	var scene_id := int(scene_root.get_instance_id())
	var cached: Variant = _scene_managers.get(scene_id)
	if cached is TroopStatusBatch and is_instance_valid(cached):
		return cached as TroopStatusBatch
	var manager := TroopStatusBatch.new()
	manager.name = "TroopStatusBatch"
	manager.process_priority = 101
	scene_root.add_child(manager)
	_scene_managers[scene_id] = manager
	return manager


func _ready() -> void:
	_ensure_materials()


func _exit_tree() -> void:
	for raw_id in _applied_effects.keys():
		_restore_overlay(int(raw_id))
	_applied_effects.clear()
	_overlay_restore.clear()
	for scene_id in _scene_managers.keys():
		if _scene_managers[scene_id] == self:
			_scene_managers.erase(scene_id)


func show_status(
	troop: Node3D,
	effect: StringName,
	duration: float
) -> void:
	if troop == null or not is_instance_valid(troop):
		return
	var entries := _entries_for(effect)
	if entries == null:
		return
	var troop_id := int(troop.get_instance_id())
	var entry: Dictionary = entries.get(troop_id, {})
	entry["troop"] = weakref(troop)
	entry["remaining"] = maxf(
		float(entry.get("remaining", 0.0)),
		maxf(0.05, duration)
	)
	entry["phase"] = float(entry.get(
		"phase",
		fmod(float(troop_id) * 0.61803398875, TAU)
	))
	entries[troop_id] = entry


func unregister_troop(troop: Node3D) -> void:
	if troop == null:
		return
	var troop_id := int(troop.get_instance_id())
	_restore_overlay(troop_id)
	_applied_effects.erase(troop_id)
	_rage_entries.erase(troop_id)
	_heal_entries.erase(troop_id)


func active_count(effect: StringName) -> int:
	var entries := _entries_for(effect)
	return entries.size() if entries != null else 0


func visual_mesh_count(effect: StringName) -> int:
	var count := 0
	for raw_id in _applied_effects.keys():
		if _applied_effects[raw_id] != effect:
			continue
		var restore_entry: Dictionary = _overlay_restore.get(raw_id, {})
		count += (restore_entry.get("meshes", []) as Array).size()
	return count


func _process(delta: float) -> void:
	var rage_troops := _collect_live_entries(_rage_entries, delta)
	var heal_troops := _collect_live_entries(_heal_entries, delta)
	_sync_overlays(rage_troops, heal_troops)


func _entries_for(effect: StringName) -> Dictionary:
	match effect:
		EFFECT_RAGE:
			return _rage_entries
		EFFECT_HEAL:
			return _heal_entries
		_:
			return {}


func _collect_live_entries(entries: Dictionary, delta: float) -> Dictionary:
	var live_entries: Dictionary = {}
	var stale_ids: Array[int] = []
	for raw_id in entries.keys():
		var troop_id := int(raw_id)
		var entry: Dictionary = entries[troop_id]
		var troop_ref := entry.get("troop") as WeakRef
		var troop := troop_ref.get_ref() as Node3D if troop_ref != null else null
		var remaining := float(entry.get("remaining", 0.0)) - delta
		if (
			not is_instance_valid(troop)
			or troop.is_queued_for_deletion()
			or not troop.is_inside_tree()
			or remaining <= 0.0
			or int(troop.get("hp")) <= 0
		):
			stale_ids.append(troop_id)
			continue
		entry["remaining"] = remaining
		entries[troop_id] = entry
		live_entries[troop_id] = troop
	for troop_id in stale_ids:
		entries.erase(troop_id)
	return live_entries


func _sync_overlays(
	rage_troops: Dictionary,
	heal_troops: Dictionary
) -> void:
	var troop_ids: Dictionary = {}
	for raw_id in _applied_effects.keys():
		troop_ids[raw_id] = true
	for raw_id in rage_troops.keys():
		troop_ids[raw_id] = true
	for raw_id in heal_troops.keys():
		troop_ids[raw_id] = true

	for raw_id in troop_ids.keys():
		var troop_id := int(raw_id)
		var desired_effect: StringName = &""
		var troop: Node3D = null
		if heal_troops.has(troop_id):
			desired_effect = EFFECT_HEAL
			troop = heal_troops[troop_id] as Node3D
		elif rage_troops.has(troop_id):
			desired_effect = EFFECT_RAGE
			troop = rage_troops[troop_id] as Node3D

		var current_effect: StringName = _applied_effects.get(
			troop_id,
			&""
		) as StringName
		if current_effect == desired_effect:
			continue
		_restore_overlay(troop_id)
		_applied_effects.erase(troop_id)
		if desired_effect != &"" and is_instance_valid(troop):
			_apply_overlay(troop_id, troop, desired_effect)


func _apply_overlay(
	troop_id: int,
	troop: Node3D,
	effect: StringName
) -> void:
	_ensure_materials()
	var material := (
		_heal_material
		if effect == EFFECT_HEAL
		else _rage_material
	)
	if material == null:
		return

	var mesh_states: Array = []
	var meshes: Array = troop.find_children(
		"*",
		"MeshInstance3D",
		true,
		false
	)
	if troop is MeshInstance3D:
		meshes.push_front(troop)
	for raw_mesh in meshes:
		var mesh := raw_mesh as MeshInstance3D
		if not _is_status_visual_mesh(mesh):
			continue
		mesh_states.append({
			"mesh": weakref(mesh),
			"previous_overlay": mesh.material_overlay,
		})
		mesh.material_overlay = material

	if mesh_states.is_empty():
		return
	_overlay_restore[troop_id] = {
		"troop": weakref(troop),
		"meshes": mesh_states,
	}
	_applied_effects[troop_id] = effect


func _restore_overlay(troop_id: int) -> void:
	var restore_entry: Dictionary = _overlay_restore.get(troop_id, {})
	var mesh_states: Array = restore_entry.get("meshes", [])
	for state_value in mesh_states:
		var state: Dictionary = state_value
		var mesh_ref := state.get("mesh") as WeakRef
		var mesh := (
			mesh_ref.get_ref() as MeshInstance3D
			if mesh_ref != null
			else null
		)
		if is_instance_valid(mesh):
			mesh.material_overlay = state.get(
				"previous_overlay",
				null
			) as Material
	_overlay_restore.erase(troop_id)


func _is_status_visual_mesh(mesh: MeshInstance3D) -> bool:
	if (
		not is_instance_valid(mesh)
		or mesh.mesh == null
		or not mesh.visible
	):
		return false
	var mesh_name := String(mesh.name).to_lower()
	return (
		not mesh_name.contains("hpbar")
		and not mesh_name.contains("healthbar")
		and not mesh_name.contains("shadow")
		and not mesh_name.contains("selection")
		and not mesh_name.contains("indicator")
	)


func _ensure_materials() -> void:
	if _rage_material == null:
		_rage_material = _create_status_material(
			"TroopRageUpgradeCoating",
			RAGE_COLOR,
			RAGE_OUTLINE_WIDTH
		)
	if _heal_material == null:
		_heal_material = _create_status_material(
			"TroopHealingUpgradeCoating",
			HEAL_COLOR,
			HEAL_OUTLINE_WIDTH
		)


func _create_status_material(
	material_name: String,
	color: Color,
	outline_width: float
) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.resource_name = material_name
	material.shader = STATUS_SHADER
	material.set_shader_parameter("outline_color", color)
	material.set_shader_parameter("outline_width", outline_width)
	material.set_shader_parameter("flickering_speed", 7.0)
	material.set_shader_parameter("minimal_flickering_alpha", 0.52)
	material.render_priority = 3
	return material
