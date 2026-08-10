extends SceneTree
## Verifies the authored primary TH10 cannon meshes used by the runtime.

const MODEL_PATH := "res://Model/Town_Hall/Town Hall Level 10.glb"
const REQUIRED_MESHES: Array[String] = [
	"Cannon1_001",
	"Cannon1Base_001",
]


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var packed := load(MODEL_PATH) as PackedScene
	if packed == null:
		push_error("TOWN_HALL_CANNON_ASSET_PROBE_FAIL: TH10 model does not load")
		quit(1)
		return
	var model := packed.instantiate() as Node3D
	root.add_child(model)
	var failed := false
	_dump_meshes(model)
	for mesh_name in REQUIRED_MESHES:
		var mesh := model.find_child(mesh_name, true, false) as MeshInstance3D
		if mesh == null or mesh.mesh == null:
			failed = true
			push_error("TOWN_HALL_CANNON_ASSET_PROBE_FAIL: missing %s" % mesh_name)
			continue
		var bounds := mesh.get_aabb()
		print(
			"TOWN_HALL_CANNON_ASSET " + mesh_name
			+ " origin=" + str(mesh.transform.origin)
			+ " basis=" + str(mesh.transform.basis)
			+ " aabb=" + str(bounds)
		)
	model.free()
	if failed:
		quit(1)
	else:
		print("TOWN_HALL_CANNON_ASSET_PROBE_PASS")
		quit(0)


func _dump_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		print("TOWN_HALL_CANNON_NODE " + str(node.name))
	for child in node.get_children():
		_dump_meshes(child)
