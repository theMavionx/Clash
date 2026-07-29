class_name NecromancerSummonVFX
extends Node3D
## Lightweight deterministic ground portal used while a summoned skeleton
## rises. It is geometry-only so the first cast does not compile a particle
## pipeline in the middle of combat.

const LIFETIME: float = 0.58
const PORTAL_RADIUS: float = 0.15
const DIRT_SHARD_COUNT: int = 7

static var _portal_mesh: CylinderMesh = null
static var _portal_material: StandardMaterial3D = null
static var _crater_material: StandardMaterial3D = null
static var _dirt_mesh: BoxMesh = null
static var _dirt_material: StandardMaterial3D = null

var auto_play_on_ready: bool = true
var recycle_on_finish: bool = false
var _effect_tween: Tween = null
var _crater: MeshInstance3D = null
var _portal: MeshInstance3D = null
var _inner: MeshInstance3D = null
var _shards: Array[MeshInstance3D] = []
var _crater_instance_material: StandardMaterial3D = null
var _portal_instance_material: StandardMaterial3D = null
var _inner_instance_material: StandardMaterial3D = null
var _shard_instance_material: StandardMaterial3D = null


func _ready() -> void:
	add_to_group("combat_ephemeral_vfx")
	add_to_group("necromancer_summon_vfx")
	_build_visuals()
	if auto_play_on_ready:
		play_effect()
	else:
		visible = false
		process_mode = Node.PROCESS_MODE_DISABLED


func _build_visuals() -> void:
	if _portal_mesh == null:
		_portal_mesh = CylinderMesh.new()
		_portal_mesh.top_radius = PORTAL_RADIUS
		_portal_mesh.bottom_radius = PORTAL_RADIUS
		_portal_mesh.height = 0.006
		_portal_mesh.radial_segments = 24
		_portal_mesh.rings = 1
	if _portal_material == null:
		_portal_material = StandardMaterial3D.new()
		_portal_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_portal_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_portal_material.albedo_color = Color(0.18, 1.0, 0.32, 0.72)
		_portal_material.emission_enabled = true
		_portal_material.emission = Color(0.08, 0.92, 0.24)
		_portal_material.emission_energy_multiplier = 1.8
		_portal_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	if _crater_material == null:
		_crater_material = StandardMaterial3D.new()
		_crater_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_crater_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_crater_material.albedo_color = Color(0.20, 0.09, 0.025, 0.72)
		_crater_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	if _dirt_mesh == null:
		_dirt_mesh = BoxMesh.new()
		_dirt_mesh.size = Vector3(0.036, 0.025, 0.028)
	if _dirt_material == null:
		_dirt_material = StandardMaterial3D.new()
		_dirt_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_dirt_material.albedo_color = Color(0.30, 0.15, 0.045, 0.94)
		_dirt_material.roughness = 1.0

	_crater_instance_material = _crater_material.duplicate()
	_portal_instance_material = _portal_material.duplicate()
	_inner_instance_material = _portal_material.duplicate()
	_shard_instance_material = _dirt_material.duplicate()

	_crater = MeshInstance3D.new()
	_crater.mesh = _portal_mesh
	_crater.material_override = _crater_instance_material
	add_child(_crater)

	_portal = MeshInstance3D.new()
	_portal.mesh = _portal_mesh
	_portal.material_override = _portal_instance_material
	add_child(_portal)

	_inner = MeshInstance3D.new()
	_inner.mesh = _portal_mesh
	_inner.material_override = _inner_instance_material
	_inner.position.y = 0.004
	add_child(_inner)

	_shards.clear()
	for shard_index in DIRT_SHARD_COUNT:
		var shard := MeshInstance3D.new()
		shard.name = "DirtShard_%d" % shard_index
		shard.mesh = _dirt_mesh
		shard.material_override = _shard_instance_material
		var angle := TAU * float(shard_index) / float(DIRT_SHARD_COUNT) + 0.21
		shard.rotation_degrees = Vector3(
			18.0 + float(shard_index % 3) * 11.0,
			rad_to_deg(angle),
			12.0 - float(shard_index % 2) * 24.0
		)
		add_child(shard)
		_shards.append(shard)


func play_effect() -> void:
	if _effect_tween != null and _effect_tween.is_valid():
		_effect_tween.kill()
	visible = true
	process_mode = Node.PROCESS_MODE_INHERIT
	_crater.scale = Vector3(0.18, 1.0, 0.18)
	_portal.scale = Vector3(0.25, 1.0, 0.25)
	_inner.scale = Vector3(0.08, 1.0, 0.08)
	_crater_instance_material.albedo_color = Color(0.20, 0.09, 0.025, 0.72)
	_portal_instance_material.albedo_color = Color(0.18, 1.0, 0.32, 0.72)
	_inner_instance_material.albedo_color = Color(0.18, 1.0, 0.32, 0.72)
	_shard_instance_material.albedo_color = Color(0.30, 0.15, 0.045, 0.94)

	_effect_tween = create_tween().set_parallel(true)
	_effect_tween.tween_property(
		_crater,
		"scale",
		Vector3(0.78, 1.0, 0.78),
		0.24
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_effect_tween.tween_property(
		_crater_instance_material,
		"albedo_color:a",
		0.0,
		0.30
	).set_delay(0.24)
	_effect_tween.tween_property(
		_portal,
		"scale",
		Vector3.ONE,
		LIFETIME
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_effect_tween.tween_property(
		_inner,
		"scale",
		Vector3(0.72, 1.0, 0.72),
		LIFETIME
	).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_effect_tween.tween_property(
		_portal_instance_material,
		"albedo_color:a",
		0.0,
		LIFETIME
	).set_delay(0.12)
	_effect_tween.tween_property(
		_inner_instance_material,
		"albedo_color:a",
		0.0,
		LIFETIME
	).set_delay(0.18)

	for shard_index in _shards.size():
		var shard := _shards[shard_index]
		var angle := TAU * float(shard_index) / float(DIRT_SHARD_COUNT) + 0.21
		var direction := Vector3(cos(angle), 0.0, sin(angle))
		shard.position = direction * 0.045 + Vector3(0.0, 0.012, 0.0)
		shard.scale = Vector3.ONE
		var travel := direction * (0.095 + float(shard_index % 3) * 0.012)
		travel.y = 0.045 + float(shard_index % 2) * 0.018
		_effect_tween.tween_property(
			shard,
			"position",
			shard.position + travel,
			0.32
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_effect_tween.tween_property(
			shard,
			"scale",
			Vector3.ONE * 0.28,
			0.34
		).set_delay(0.18)
	_effect_tween.tween_property(
		_shard_instance_material,
		"albedo_color:a",
		0.0,
		0.22
	).set_delay(0.28)
	_effect_tween.chain().tween_callback(_finish_effect)


func _finish_effect() -> void:
	_effect_tween = null
	if recycle_on_finish:
		visible = false
		process_mode = Node.PROCESS_MODE_DISABLED
	else:
		queue_free()
