extends SceneTree


class CountingIceFreezeVFX:
	extends IceFreezeVFX

	var layout_rebuild_count := 0
	var color_refresh_count := 0

	func _rebuild_frost_instances(now_msec: int) -> void:
		layout_rebuild_count += 1
		super(now_msec)

	func _refresh_frost_colors(now_msec: int) -> void:
		color_refresh_count += 1
		super(now_msec)


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var scene_root := Node3D.new()
	scene_root.name = "IceFreezeDirtySmoke"
	root.add_child(scene_root)
	current_scene = scene_root

	var service := CountingIceFreezeVFX.new()
	scene_root.add_child(service)
	var target := Node3D.new()
	target.name = "FrozenTarget"
	scene_root.add_child(target)
	var visual := MeshInstance3D.new()
	visual.mesh = BoxMesh.new()
	target.add_child(visual)
	var affected: Array[Dictionary] = [{
		"node": target,
		"show_overlay": true,
	}]

	service.show_freeze(Vector3.ZERO, 1.0, 1.0, affected)
	if service.layout_rebuild_count != 1:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] initial layout was not built exactly once")
		quit(1)
		return
	for frame in range(10):
		await process_frame
	if service.layout_rebuild_count != 1:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] unchanged layout rebuilt during idle frames")
		quit(1)
		return

	target.position.x = 2.0
	await process_frame
	await process_frame
	if service.layout_rebuild_count != 2:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] target transform did not trigger one rebuild")
		quit(1)
		return
	var active_entry := service._active_frost.values()[0] as Dictionary
	var cached_transform: Transform3D = active_entry.get(
		"target_global_transform",
		Transform3D.IDENTITY
	)
	if not is_equal_approx(cached_transform.origin.x, target.global_position.x):
		push_error("[ICE_FREEZE_DIRTY_SMOKE] transformed target bounds were not refreshed")
		quit(1)
		return
	for frame in range(10):
		await process_frame
	if service.layout_rebuild_count != 2:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] transform rebuild repeated without another change")
		quit(1)
		return

	service.clear_all()
	service.show_freeze(Vector3.ZERO, 1.0, 0.24, affected)
	var thaw_layout_count := service.layout_rebuild_count
	var thaw_color_count := service.color_refresh_count
	await create_timer(0.12).timeout
	if service.layout_rebuild_count != thaw_layout_count:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] thaw animation rebuilt layout")
		quit(1)
		return
	if service.color_refresh_count <= thaw_color_count:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] thaw colors did not update at bounded cadence")
		quit(1)
		return
	await create_timer(0.18).timeout
	await process_frame
	if not service._active_frost.is_empty():
		push_error("[ICE_FREEZE_DIRTY_SMOKE] visual freeze timer did not expire")
		quit(1)
		return
	if service.layout_rebuild_count != thaw_layout_count + 1:
		push_error("[ICE_FREEZE_DIRTY_SMOKE] expiry did not clear layout exactly once")
		quit(1)
		return

	print(
		"[ICE_FREEZE_DIRTY_SMOKE] PASS rebuilds=%d color_updates=%d"
		% [service.layout_rebuild_count, service.color_refresh_count]
	)
	service.clear_all()
	current_scene = null
	scene_root.queue_free()
	for frame in range(3):
		await process_frame
	quit()
