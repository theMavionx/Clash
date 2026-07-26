class_name WindWaveVFX
extends Node3D
## Low-cost unshaded wind ribbons. Geometry is generated once per cast and
## uses the same material pipeline for the main wave and warmup probe.

const DEFAULT_DURATION: float = 0.46
const RIBBON_COUNT: int = 3
const RIBBON_SEGMENTS: int = 8

static var _material: StandardMaterial3D = null


func setup(
	origin: Vector3,
	direction: Vector3,
	length: float,
	half_width: float,
	duration: float = DEFAULT_DURATION
) -> void:
	top_level = true
	add_to_group("wind_wave_vfx")
	global_position = origin + Vector3(0.0, 0.018, 0.0)
	var flat_direction := direction
	flat_direction.y = 0.0
	if flat_direction.length_squared() <= 0.0001:
		flat_direction = Vector3.FORWARD
	look_at(global_position + flat_direction.normalized(), Vector3.UP)

	for ribbon_index in RIBBON_COUNT:
		var ribbon := MeshInstance3D.new()
		ribbon.name = "WindRibbon%d" % ribbon_index
		ribbon.mesh = _build_ribbon(
			maxf(0.1, length) * lerpf(0.70, 1.0, float(ribbon_index) / 2.0),
			maxf(0.05, half_width),
			ribbon_index
		)
		ribbon.material_override = _get_material()
		ribbon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ribbon.transparency = 0.10 + float(ribbon_index) * 0.08
		ribbon.scale = Vector3(0.42, 1.0, 0.72)
		add_child(ribbon)

		var tween := ribbon.create_tween().set_parallel(true)
		tween.tween_property(
			ribbon,
			"scale",
			Vector3(1.0, 1.0, 1.0),
			duration
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.tween_property(
			ribbon,
			"transparency",
			0.92,
			duration
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

	var cleanup := create_tween()
	cleanup.tween_interval(duration + 0.03)
	cleanup.tween_callback(queue_free)


static func _get_material() -> StandardMaterial3D:
	if _material == null:
		_material = StandardMaterial3D.new()
		_material.resource_name = "WindWaveRibbonMaterial"
		_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_material.vertex_color_use_as_albedo = true
		_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_material.no_depth_test = false
		_material.albedo_color = Color.WHITE
		_material.roughness = 1.0
	return _material


static func _build_ribbon(length: float, half_width: float, ribbon_index: int) -> ArrayMesh:
	var vertices := PackedVector3Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()
	var phase := float(ribbon_index) * 1.7
	var thickness := lerpf(0.032, 0.050, float(ribbon_index) / 2.0)
	var tint := Color(0.72, 1.0, 0.92, 0.74 - float(ribbon_index) * 0.10)

	for segment_index in range(RIBBON_SEGMENTS + 1):
		var progress := float(segment_index) / float(RIBBON_SEGMENTS)
		var envelope := sin(progress * PI)
		var width_at_progress := lerpf(half_width * 0.42, half_width, progress)
		var center_x := sin(progress * TAU * 1.4 + phase) * width_at_progress * 0.48 * envelope
		var tangent_x := cos(progress * TAU * 1.4 + phase) * thickness
		var z := -progress * length
		vertices.append(Vector3(center_x - thickness - tangent_x, 0.0, z))
		vertices.append(Vector3(center_x + thickness - tangent_x, 0.0, z))
		colors.append(tint)
		colors.append(tint)
		if segment_index < RIBBON_SEGMENTS:
			var base := segment_index * 2
			indices.append_array(PackedInt32Array([
				base,
				base + 2,
				base + 1,
				base + 1,
				base + 2,
				base + 3,
			]))

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
