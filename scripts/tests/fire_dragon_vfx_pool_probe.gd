extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var scene := load("res://Model/Characters/FireDragon/FireDragon.tscn") as PackedScene
	if scene == null:
		_fail("Fire Dragon scene failed to load")
		return
	var fixture := Node3D.new()
	fixture.name = "FireDragonVfxPoolProbe"
	root.add_child(fixture)
	current_scene = fixture
	var preview := scene.instantiate()
	fixture.add_child(preview)
	await process_frame
	if not _all_mesh_surfaces_have_material(preview):
		_fail("Raw Fire Dragon preview exposed a null surface material")
		return
	preview.queue_free()
	await process_frame

	var dragon := scene.instantiate()
	var combat_script := load("res://scripts/fire_dragon.gd") as Script
	if combat_script == null:
		_fail("Fire Dragon combat script failed to load")
		return
	dragon.set_script(combat_script)
	fixture.add_child(dragon)
	await process_frame

	for _index in range(12):
		dragon.call("prewarm_fire_breath_vfx")

	var pool: Array = dragon.get("_breath_vfx_pool")
	if pool.size() != 4:
		_fail("VFX pool grew from 4 to %d under replay-speed pressure" % pool.size())
		return
	var active_count := 0
	for slot in pool:
		if slot is Dictionary and bool(slot.get("active", false)):
			active_count += 1
	if active_count != 4:
		_fail("Expected four recycled active slots, got %d" % active_count)
		return

	await create_timer(0.8).timeout
	for slot in pool:
		if slot is Dictionary and bool(slot.get("active", false)):
			_fail("VFX slot did not return to the pool after its lifetime")
			return

	fixture.queue_free()
	for _cleanup_frame in range(4):
		await process_frame
	print("[FIRE_DRAGON_VFX_POOL_TEST] PASS size=4 recycled=12")
	quit()


func _all_mesh_surfaces_have_material(node: Node) -> bool:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var mesh := mesh_instance.mesh
		if mesh != null:
			for surface_index in range(mesh.get_surface_count()):
				if (
					mesh_instance.get_surface_override_material(surface_index) == null
					and mesh.surface_get_material(surface_index) == null
				):
					return false
	for child in node.get_children():
		if not _all_mesh_surfaces_have_material(child):
			return false
	return true


func _fail(message: String) -> void:
	push_error("[FIRE_DRAGON_VFX_POOL_TEST] %s" % message)
	quit(1)
