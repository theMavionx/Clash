extends SceneTree
## Loads every Town Hall model so stale imported texture UIDs are visible in CI/local logs.


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var loaded_count: int = 0
	var scene: PackedScene = null
	for level in range(1, 7):
		var path := "res://Model/Town_Hall/Town Hall Level %d.glb" % level
		scene = ResourceLoader.load(path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene
		if scene == null:
			push_error("[TOWN_HALL_PROBE] load_failed path=" + path)
			quit(1)
			return
		loaded_count += 1
		print("[TOWN_HALL_PROBE] loaded level=", level, " path=", path)
	print("[TOWN_HALL_PROBE] success loaded=", loaded_count)
	scene = null
	await process_frame
	await process_frame
	quit(0)
