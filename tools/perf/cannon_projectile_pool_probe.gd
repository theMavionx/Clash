extends SceneTree

const CANNON_SCRIPT := preload("res://scripts/cannon.gd")
const CANNON_SCENE := preload("res://Model/cannons/level_07/cannon_level_07.tscn")
const FIXED_DELTA: float = 1.0 / 60.0
const IDLE_FRAMES: int = 3600
const COMBAT_FRAMES: int = 3600


class ProfileTarget:
	extends Node3D

	var hp: int = 100000000
	var level: int = 7
	var unit_target_type: String = "ground"

	func take_damage(amount: int) -> void:
		hp -= amount

	func is_targetable_by_defenses() -> bool:
		return hp > 0

	func _get_troop_name() -> String:
		return "cannon_pool_probe_target"


class TelemetryRecorder:
	extends Node

	var fire_count: int = 0
	var hit_count: int = 0

	func record_replay_telemetry(kind: String, _payload: Dictionary) -> void:
		if kind == "defense_fire":
			fire_count += 1
		elif kind == "defense_projectile_hit":
			hit_count += 1


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := Node3D.new()
	world.name = "CannonProjectilePoolProbe"
	root.add_child(world)
	current_scene = world

	var telemetry := TelemetryRecorder.new()
	telemetry.add_to_group("building_systems")
	world.add_child(telemetry)

	var cannons: Array[Node3D] = []
	for cannon_index in 2:
		var cannon := Node3D.new()
		cannon.name = "ProfileCannon%d" % cannon_index
		cannon.set_script(CANNON_SCRIPT)
		cannon.attack_sfx_enabled = false
		cannon.position = Vector3(-0.22 if cannon_index == 0 else 0.22, 0.0, 0.0)
		var visual := CANNON_SCENE.instantiate() as Node3D
		visual.scale = Vector3.ONE * 0.10
		cannon.add_child(visual)
		world.add_child(cannon)
		cannons.append(cannon)

	await process_frame
	await process_frame
	await process_frame
	for cannon in cannons:
		cannon.set_level(7)
	await process_frame
	await process_frame
	for cannon in cannons:
		cannon.set_physics_process(false)

	var failures: Array[String] = []
	var pool_entries: int = 0
	var pooled_render_nodes: int = 0
	var unique_meshes: Dictionary = {}
	var unique_materials: Dictionary = {}
	for cannon in cannons:
		if not bool(cannon._pool_ready):
			failures.append("%s pool was not ready before combat" % cannon.name)
		if cannon._projectile_pool.size() != cannon.POOL_SIZE:
			failures.append(
				"%s pool size %d did not match %d"
				% [cannon.name, cannon._projectile_pool.size(), cannon.POOL_SIZE]
			)
		pool_entries += cannon._projectile_pool.size()
		for projectile in cannon._projectile_pool:
			for node_key in [
				"ball",
				"highlight",
				"trail",
				"flash",
			]:
				var mesh_instance := projectile.get(node_key) as MeshInstance3D
				if mesh_instance == null:
					failures.append("%s pool slot lost %s" % [cannon.name, node_key])
					continue
				pooled_render_nodes += 1
				if mesh_instance.mesh != null:
					unique_meshes[mesh_instance.mesh.get_instance_id()] = true
				if mesh_instance.material_override != null:
					unique_materials[
						mesh_instance.material_override.get_instance_id()
					] = true

	BaseTroop.invalidate_troops_cache()
	var node_count_before_combat := _count_nodes(world)
	var idle_start_usec := Time.get_ticks_usec()
	for _frame_index in IDLE_FRAMES:
		for cannon in cannons:
			cannon._physics_process(FIXED_DELTA)
	var idle_elapsed_usec := Time.get_ticks_usec() - idle_start_usec

	var target := ProfileTarget.new()
	target.name = "PersistentGroundTarget"
	target.position = Vector3(0.0, 0.0, 1.85)
	target.add_to_group("troops")
	world.add_child(target)
	BaseTroop.invalidate_troops_cache()

	var max_active_projectiles: int = 0
	var max_occupied_slots: int = 0
	var max_visible_render_nodes: int = 0
	var combat_start_usec := Time.get_ticks_usec()
	for _frame_index in COMBAT_FRAMES:
		for cannon in cannons:
			cannon._physics_process(FIXED_DELTA)
			max_active_projectiles = maxi(
				max_active_projectiles,
				cannon._active_projectiles.size(),
			)
			var occupied_slots: int = 0
			for projectile in cannon._projectile_pool:
				if bool(projectile.active):
					occupied_slots += 1
			max_occupied_slots = maxi(max_occupied_slots, occupied_slots)
		max_visible_render_nodes = maxi(
			max_visible_render_nodes,
			_count_visible_pool_nodes(cannons),
		)
	var combat_elapsed_usec := Time.get_ticks_usec() - combat_start_usec
	var node_count_after_combat := _count_nodes(world)

	target.hp = 0
	BaseTroop.invalidate_troops_cache()
	for _cleanup_frame in 3:
		for cannon in cannons:
			cannon._physics_process(FIXED_DELTA)
	var visible_pool_nodes_after_cleanup := _count_visible_pool_nodes(cannons)

	if max_occupied_slots >= CANNON_SCRIPT.POOL_SIZE:
		failures.append(
			"worst-case combat occupied all %d pool slots" % CANNON_SCRIPT.POOL_SIZE
		)
	if telemetry.fire_count <= 0 or telemetry.hit_count <= 0:
		failures.append(
			"combat probe recorded fires=%d hits=%d"
			% [telemetry.fire_count, telemetry.hit_count]
		)
	if node_count_after_combat != node_count_before_combat + 1:
		failures.append(
			"combat allocated persistent nodes: before=%d after=%d"
			% [node_count_before_combat, node_count_after_combat]
		)
	if visible_pool_nodes_after_cleanup != 0:
		failures.append(
			"%d projectile visuals remained visible after combat cleanup"
			% visible_pool_nodes_after_cleanup
		)

	var result := {
		"cannons": cannons.size(),
		"pool_entries": pool_entries,
		"pooled_render_nodes": pooled_render_nodes,
		"unique_mesh_resources": unique_meshes.size(),
		"unique_material_resources": unique_materials.size(),
		"max_active_projectiles_per_cannon": max_active_projectiles,
		"max_occupied_slots_per_cannon": max_occupied_slots,
		"pool_headroom_slots": CANNON_SCRIPT.POOL_SIZE - max_occupied_slots,
		"max_visible_pool_nodes_total": max_visible_render_nodes,
		"fires": telemetry.fire_count,
		"hits": telemetry.hit_count,
		"idle_usec_per_frame_two_cannons": (
			float(idle_elapsed_usec) / float(IDLE_FRAMES)
		),
		"combat_usec_per_frame_two_cannons": (
			float(combat_elapsed_usec) / float(COMBAT_FRAMES)
		),
		"persistent_nodes_added_during_combat": (
			node_count_after_combat - node_count_before_combat - 1
		),
		"visible_pool_nodes_after_cleanup": visible_pool_nodes_after_cleanup,
	}
	print("CANNON_POOL_PROBE ", JSON.stringify(result))

	BaseTroop.invalidate_troops_cache()
	world.queue_free()
	await process_frame
	await process_frame

	if failures.is_empty():
		print("CANNON_POOL_PROBE_OK")
		quit(0)
		return
	for failure in failures:
		push_error("Cannon pool probe: " + failure)
	quit(1)


func _count_nodes(node: Node) -> int:
	var total := 1
	for child in node.get_children():
		total += _count_nodes(child)
	return total


func _count_visible_pool_nodes(cannons: Array[Node3D]) -> int:
	var total := 0
	for cannon in cannons:
		for projectile in cannon._projectile_pool:
			for node_key in [
				"ball",
				"highlight",
				"trail",
				"flash",
			]:
				var visual := projectile.get(node_key) as GeometryInstance3D
				if visual != null and visual.is_visible_in_tree():
					total += 1
	return total
