extends SceneTree

const FIXTURES: Array[Dictionary] = [
	{"source": "res://Model/Mine/1.glb", "count": 4, "level": 5},
	{"source": "res://Model/Sawmill/1.glb", "count": 4, "level": 5},
	{"source": "res://Model/Storage/Business Building_3.glb", "count": 3, "level": 5},
	{"source": "res://Model/Archer_towers/3,4,5.glb", "count": 3, "level": 5},
	{"source": "res://Model/Town_Hall/Town Hall Level 5.glb", "count": 1, "level": 5},
]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	if not WebRenderProfile.is_enabled():
		push_error("[STATIC_MULTIMESH_SMOKE] set CLASH_FORCE_WEB_RENDER_PROFILE=1")
		quit(1)
		return
	var scene_root := Node3D.new()
	scene_root.name = "StaticMultiMeshSmoke"
	root.add_child(scene_root)
	current_scene = scene_root
	var profile := WebRenderProfile.new()
	profile.name = "WebRenderProfile"
	scene_root.add_child(profile)

	var fixture_roots: Array[Node3D] = []
	var offset := 0.0
	for fixture in FIXTURES:
		var source_path := str(fixture.source)
		var packed_scene := load(source_path) as PackedScene
		if packed_scene == null:
			push_error("[STATIC_MULTIMESH_SMOKE] failed to load %s" % source_path)
			quit(1)
			return
		for index in range(int(fixture.count)):
			var model := packed_scene.instantiate() as Node3D
			model.position = Vector3(offset + index * 3.0, 0.0, 0.0)
			scene_root.add_child(model)
			if not WebRenderProfile.apply_static_batch_for_web(model, source_path, int(fixture.level)):
				push_error("[STATIC_MULTIMESH_SMOKE] batch missing for %s" % source_path)
				quit(1)
				return
			fixture_roots.append(model)
		offset += float(fixture.count) * 3.0 + 5.0

	for frame in range(10):
		await process_frame
	profile._refresh_static_multimeshes()
	await process_frame
	var first_group_count := profile._static_multimesh_groups.size()
	if first_group_count != 4:
		push_error("[STATIC_MULTIMESH_SMOKE] expected 4 groups, got %d" % first_group_count)
		quit(1)
		return

	fixture_roots[0].position.x += 1.5
	fixture_roots[1].visible = false
	fixture_roots[2].queue_free()
	await process_frame
	profile._refresh_static_multimeshes()
	for frame in range(10):
		await process_frame
	print(
		"[STATIC_MULTIMESH_SMOKE] PASS roots=%d groups_before=%d groups_after=%d"
		% [fixture_roots.size(), first_group_count, profile._static_multimesh_groups.size()]
	)
	quit()
