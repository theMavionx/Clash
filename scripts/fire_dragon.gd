extends BaseTroop
## FireDragon - temporary flying heavy unit.
## Uses DemonKing-like test stats while keeping the normal troop pipeline.


enum DragonSkin { RED, BLACK, PURPLE }

const LEVEL_STATS: Dictionary = {
	1: {"hp": 1080, "damage": 140, "atk_speed": 1.25},
	2: {"hp": 1170, "damage": 139, "atk_speed": 1.15},
	3: {"hp": 1260, "damage": 137, "atk_speed": 1.05},
}

const ANIMATION_PATHS: Dictionary = {
	"bite_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_bite_attack.fbx",
	"die": "res://Model/Characters/FireDragon/Animations/fire_dragon_die.fbx",
	"fire_breath_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_fire_breath_attack.fbx",
	"fly_bite_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_bite_attack_low.fbx",
	"fly_die": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_die.fbx",
	"fly_fire_breath_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_fire_breath_attack_low.fbx",
	"fly_forward": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_forward.fbx",
	"fly_idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_idle.fbx",
	"fly_take_damage": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_take_damage.fbx",
	"idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_idle.fbx",
}

const RED_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_red.tga")
const BLACK_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_black.tga")
const PURPLE_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_purple.tga")
const FIRE_BREATH_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_fire_breath.tga")
const FIRE_SPARKS_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_sparks.tga")
const FIRE_BREATH_DURATION: float = 0.42
const FIRE_BREATH_WIDTH: float = 0.28
const FIRE_BREATH_MOUTH_FORWARD_OFFSET: float = 0.08
const FIRE_BREATH_TARGET_Y_OFFSET: float = 0.13
const FIRE_BREATH_MIN_LENGTH: float = 0.12
const FIRE_BREATH_RIBBON_LAYERS: int = 4
const FIRE_BREATH_GLOW_LAYERS: int = 2
const FIRE_BREATH_PUFF_COUNT: int = 8
const FIRE_BREATH_EMBER_COUNT: int = 14

@export var skin: DragonSkin = DragonSkin.RED
@export var flight_height: float = 0.34
@export var flight_bob_height: float = 0.035
@export var flight_bob_speed: float = 2.2
@export var hit_anim_threshold: float = 0.4

var _current_dragon_animation: String = ""
var _current_animation_length: float = 0.0
var _ground_y: float = 0.0
var _flight_time: float = 0.0
var _hit_this_swing: bool = false


func _init_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS[level]
	unit_target_type = BaseTroop.UNIT_TARGET_AIR
	move_speed = 0.38
	attack_range = 0.32
	separation_radius = 0.18
	separation_force = 0.6
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "fly_fire_breath_attack_low"
	attack_sfx_path = "res://Musik/sound_effects/DemonKingAttack.mp3"
	anim_files = []


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "FireDragonAnimProxy"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)


func _setup_weapons() -> void:
	pass


func _ready() -> void:
	_ground_y = global_position.y
	super._ready()
	_apply_skin()
	_play_dragon_animation("fly_idle")
	_apply_flight_height()


func activate() -> void:
	_ground_y = global_position.y
	super.activate()
	_sync_visual_state()
	_apply_flight_height()


func play_boarding_animation() -> void:
	_ground_y = global_position.y
	_play_dragon_animation("fly_forward")
	_apply_flight_height()


func apply_boarding_flight(delta: float) -> void:
	_flight_time += minf(delta, 0.1)
	_apply_flight_height()


func _physics_process(delta: float) -> void:
	if _is_dead or state == State.INACTIVE:
		return
	_flight_time += BaseTroop.combat_delta(delta)
	super._physics_process(delta)
	_apply_flight_height()
	_sync_visual_state()


func _initial_attack_timer() -> float:
	return atk_speed * hit_anim_threshold


func _on_enter_attack_state() -> void:
	_hit_this_swing = false
	_play_dragon_animation("fly_fire_breath_attack_low", true)


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_hit_this_swing = false
		_play_dragon_animation("fly_forward")
		return

	_face_current_target()
	_apply_attack_separation(delta)
	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		_play_dragon_animation("fly_fire_breath_attack_low", true)

	if not _hit_this_swing and attack_timer >= atk_speed * hit_anim_threshold:
		_hit_this_swing = true
		_spawn_fire_breath_vfx()
		_play_attack_sfx()
		_deal_target_damage()


func _play_victory() -> void:
	super._play_victory()
	_play_dragon_animation("fly_idle")
	_apply_flight_height()


func take_damage(dmg: int) -> void:
	if _is_dead:
		return
	hp -= dmg
	if hp > 0:
		return
	_is_dead = true
	_record_replay_telemetry("troop_death", {"damage": dmg})
	if is_in_group("troops"):
		remove_from_group("troops")
	invalidate_combat_lists()
	_report_death()
	if _hp_bar and is_instance_valid(_hp_bar):
		_hp_bar.visible = false
	var duration: float = _play_dragon_animation("fly_die", true)
	if duration <= 0.0:
		duration = 0.8
	await get_tree().create_timer(duration).timeout
	queue_free()


func _apply_attack_separation(delta: float) -> void:
	if separation_force <= 0.0:
		return
	var sep: Vector3 = _get_separation()
	if sep.length() <= 0.001:
		return
	var target_pos: Vector3 = _get_target_position()
	var new_pos: Vector3 = global_position + sep * separation_force * delta * 0.3
	var flat_target := Vector3(target_pos.x, 0.0, target_pos.z)
	var flat_new := Vector3(new_pos.x, 0.0, new_pos.z)
	if flat_target.distance_to(flat_new) < attack_range * 1.2:
		global_position = _clamp_to_island(new_pos)


func _spawn_fire_breath_vfx() -> void:
	if not is_inside_tree():
		return
	var root_parent: Node = get_tree().current_scene
	if root_parent == null:
		root_parent = get_tree().root
	var target_pos: Vector3 = _get_fire_breath_target_position()
	var target_dir: Vector3 = target_pos - global_position
	target_dir.y = 0.0
	if target_dir.length_squared() < 0.0001:
		target_dir = -global_transform.basis.z
	target_dir = target_dir.normalized()
	var mouth_pos: Vector3 = _get_mouth_position(target_dir)
	var to_target: Vector3 = target_pos - mouth_pos
	if to_target.length_squared() < FIRE_BREATH_MIN_LENGTH * FIRE_BREATH_MIN_LENGTH:
		to_target = target_dir * FIRE_BREATH_MIN_LENGTH
		target_pos = mouth_pos + to_target
	var dir: Vector3 = to_target.normalized()
	var length: float = to_target.length()
	var side: Vector3 = Vector3.UP.cross(dir)
	if side.length_squared() < 0.0001:
		side = global_transform.basis.x
	side = side.normalized()
	var normal: Vector3 = side.cross(dir).normalized()

	var holder := Node3D.new()
	holder.name = "FireDragonBreathVFX"
	holder.top_level = true
	root_parent.add_child(holder)

	var beam_width: float = clampf(length * 0.42, FIRE_BREATH_WIDTH * 0.72, FIRE_BREATH_WIDTH * 1.55)
	_spawn_fire_ribbon_layers(holder, mouth_pos, dir, side, normal, length, beam_width)

	var mouth_flare := _make_fire_billboard(FIRE_BREATH_TEXTURE, Color(1.9, 1.05, 0.45, 0.9))
	var mouth_mesh := QuadMesh.new()
	mouth_mesh.size = Vector2(0.22, 0.22)
	mouth_flare.mesh = mouth_mesh
	holder.add_child(mouth_flare)
	mouth_flare.global_position = mouth_pos
	var mouth_mat := mouth_flare.material_override as StandardMaterial3D
	var mouth_tw := mouth_flare.create_tween()
	mouth_tw.set_parallel(true)
	mouth_tw.tween_property(mouth_flare, "scale", Vector3.ONE * 1.65, FIRE_BREATH_DURATION * 0.5)
	mouth_tw.tween_property(mouth_mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * 0.7)

	_spawn_fire_puffs(holder, mouth_pos, dir, side, normal, length, beam_width)
	_spawn_fire_embers(holder, mouth_pos, dir, side, normal, length)

	var spark := _make_fire_billboard(FIRE_SPARKS_TEXTURE, Color(1.4, 1.05, 0.55, 0.85))
	var spark_mesh := QuadMesh.new()
	spark_mesh.size = Vector2(0.42, 0.3)
	spark.mesh = spark_mesh
	holder.add_child(spark)
	spark.global_position = target_pos
	var spark_mat := spark.material_override as StandardMaterial3D
	var spark_tw := spark.create_tween()
	spark_tw.set_parallel(true)
	spark_tw.tween_property(spark, "scale", Vector3.ONE * 1.3, FIRE_BREATH_DURATION)
	spark_tw.tween_property(spark_mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION)

	var cleanup := holder.create_tween()
	cleanup.tween_interval(FIRE_BREATH_DURATION + 0.04)
	cleanup.tween_callback(func():
		if is_instance_valid(holder):
			holder.queue_free()
	)


func _spawn_fire_ribbon_layers(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	for i in FIRE_BREATH_GLOW_LAYERS:
		var angle: float = (TAU / float(FIRE_BREATH_GLOW_LAYERS)) * float(i) + PI * 0.25
		var layer_side: Vector3 = side.rotated(dir, angle).normalized()
		var layer_normal: Vector3 = normal.rotated(dir, angle).normalized()
		var layer_basis := Basis(layer_side, dir, layer_normal).orthonormalized()
		var glow := _make_fire_ribbon(FIRE_BREATH_TEXTURE, length, width * 1.8, Color(1.35, 0.42, 0.08, 0.36), angle)
		holder.add_child(glow)
		glow.global_transform = Transform3D(layer_basis, mouth_pos)
		_animate_fire_node(glow, FIRE_BREATH_DURATION, 1.32)

	for i in FIRE_BREATH_RIBBON_LAYERS:
		var angle: float = (TAU / float(FIRE_BREATH_RIBBON_LAYERS)) * float(i)
		var layer_side: Vector3 = side.rotated(dir, angle).normalized()
		var layer_normal: Vector3 = normal.rotated(dir, angle).normalized()
		var layer_basis := Basis(layer_side, dir, layer_normal).orthonormalized()
		var alpha: float = 0.84 if i % 2 == 0 else 0.66
		var ribbon := _make_fire_ribbon(FIRE_BREATH_TEXTURE, length, width * randf_range(0.82, 1.08), Color(1.95, 0.9, 0.24, alpha), angle + randf_range(-0.4, 0.4))
		holder.add_child(ribbon)
		ribbon.global_transform = Transform3D(layer_basis, mouth_pos)
		_animate_fire_node(ribbon, FIRE_BREATH_DURATION * randf_range(0.86, 1.08), randf_range(1.12, 1.38))


func _animate_fire_node(node: MeshInstance3D, duration: float, x_scale: float) -> void:
	var mat := node.material_override as StandardMaterial3D
	var tw := node.create_tween()
	tw.set_parallel(true)
	tw.tween_property(node, "scale:x", x_scale, duration * 0.55).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(node, "scale:z", randf_range(0.92, 1.2), duration * 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(mat, "albedo_color:a", 0.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)


func _make_fire_ribbon(texture: Texture2D, length: float, width: float, color: Color, wave_phase: float) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mesh := ArrayMesh.new()
	var vertices := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var segment_count: int = 8
	for i in range(segment_count + 1):
		var t: float = float(i) / float(segment_count)
		var half_width: float = lerpf(width * 0.12, width * 0.58, minf(1.0, t * 1.4))
		half_width *= 1.0 + sin(t * PI) * 0.22
		var wave_z: float = sin(t * TAU * 1.45 + wave_phase) * width * 0.14 * sin(t * PI)
		var y: float = length * t
		vertices.append(Vector3(-half_width, y, wave_z))
		vertices.append(Vector3(half_width, y, -wave_z * 0.7))
		uvs.append(Vector2(0.0, t))
		uvs.append(Vector2(1.0, t))
	for i in range(segment_count):
		var base: int = i * 2
		indices.append_array(PackedInt32Array([base, base + 1, base + 2, base + 1, base + 3, base + 2]))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	node.mesh = mesh
	node.material_override = _make_fire_material(texture, color, false)
	return node


func _make_fire_billboard(texture: Texture2D, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.material_override = _make_fire_material(texture, color, true)
	return node


func _make_fire_material(texture: Texture2D, color: Color, billboard: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED if billboard else BaseMaterial3D.BILLBOARD_DISABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.albedo_texture = texture
	mat.albedo_color = color
	return mat


func _spawn_fire_puffs(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	for i in range(FIRE_BREATH_PUFF_COUNT):
		var puff := _make_fire_billboard(FIRE_BREATH_TEXTURE, Color(1.7, 0.72, 0.18, randf_range(0.34, 0.56)))
		var mesh := QuadMesh.new()
		var t: float = (float(i) + randf_range(-0.18, 0.18)) / maxf(1.0, float(FIRE_BREATH_PUFF_COUNT - 1))
		t = clampf(t, 0.04, 0.96)
		var size: float = lerpf(width * 0.42, width * 0.86, t) * randf_range(0.75, 1.2)
		mesh.size = Vector2(size, size * randf_range(0.72, 1.05))
		puff.mesh = mesh
		holder.add_child(puff)
		var radius: float = lerpf(width * 0.08, width * 0.28, t)
		var angle: float = randf_range(0.0, TAU)
		var offset: Vector3 = side * cos(angle) * radius + normal * sin(angle) * radius
		var start_pos: Vector3 = mouth_pos + dir * (length * t) + offset
		puff.global_position = start_pos
		var mat := puff.material_override as StandardMaterial3D
		var tw := puff.create_tween()
		tw.set_parallel(true)
		tw.tween_property(puff, "global_position", start_pos + dir * randf_range(0.035, 0.09) + offset * 0.45, FIRE_BREATH_DURATION)
		tw.tween_property(puff, "scale", Vector3.ONE * randf_range(1.15, 1.75), FIRE_BREATH_DURATION * 0.65)
		tw.tween_property(mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * randf_range(0.72, 1.0))


func _spawn_fire_embers(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float) -> void:
	for i in range(FIRE_BREATH_EMBER_COUNT):
		var ember := _make_fire_billboard(FIRE_SPARKS_TEXTURE, Color(1.6, 0.9, 0.35, 0.58))
		var mesh := QuadMesh.new()
		mesh.size = Vector2(randf_range(0.035, 0.085), randf_range(0.035, 0.085))
		ember.mesh = mesh
		holder.add_child(ember)
		var t: float = randf_range(0.12, 0.88)
		var offset: Vector3 = side * randf_range(-0.075, 0.075) + normal * randf_range(-0.055, 0.055)
		var start_pos: Vector3 = mouth_pos + dir * (length * t) + offset
		ember.global_position = start_pos
		var ember_mat := ember.material_override as StandardMaterial3D
		var tw := ember.create_tween()
		tw.set_parallel(true)
		tw.tween_property(ember, "global_position", start_pos + dir * randf_range(0.035, 0.08) + offset * 0.4, FIRE_BREATH_DURATION)
		tw.tween_property(ember, "scale", Vector3.ONE * randf_range(0.55, 0.9), FIRE_BREATH_DURATION)
		tw.tween_property(ember_mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * randf_range(0.7, 1.0))


func _get_fire_breath_target_position() -> Vector3:
	if target_guard != null and is_instance_valid(target_guard):
		return target_guard.global_position + Vector3(0.0, 0.08, 0.0)
	if target_building.size() > 0:
		var node: Node3D = target_building.get("node", null)
		if is_instance_valid(node):
			return node.global_position + Vector3(0.0, FIRE_BREATH_TARGET_Y_OFFSET, 0.0)
	return _get_target_position() + Vector3(0.0, FIRE_BREATH_TARGET_Y_OFFSET, 0.0)


func _get_mouth_position(fallback_dir: Vector3) -> Vector3:
	var skeleton: Skeleton3D = _find_skeleton(self)
	if skeleton != null:
		var head_idx: int = _find_head_bone_index(skeleton)
		if head_idx >= 0:
			var head_pose: Transform3D = skeleton.get_bone_global_pose(head_idx)
			return skeleton.global_transform * head_pose.origin + fallback_dir.normalized() * FIRE_BREATH_MOUTH_FORWARD_OFFSET
	return global_position + Vector3(0.0, 0.08, 0.0) + fallback_dir.normalized() * 0.18


func _find_head_bone_index(skeleton: Skeleton3D) -> int:
	var direct_idx: int = skeleton.find_bone("RigHead")
	if direct_idx >= 0:
		return direct_idx
	for i in skeleton.get_bone_count():
		if skeleton.get_bone_name(i).to_lower().find("head") != -1:
			return i
	return -1


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null


func _sync_visual_state() -> void:
	if _is_dead:
		return
	match state:
		State.RUNNING:
			_play_dragon_animation("fly_forward")
		State.IDLE:
			_play_dragon_animation("fly_idle")
		State.VICTORY:
			_play_dragon_animation("fly_idle")


func _apply_flight_height() -> void:
	var bob: float = sin(_flight_time * flight_bob_speed) * flight_bob_height
	global_position.y = _ground_y + flight_height + bob
	if _hp_bar and is_instance_valid(_hp_bar):
		_hp_bar.global_position = global_position + Vector3(0.0, 0.25, 0.0)


func _play_dragon_animation(animation_name: String, force_restart: bool = false) -> float:
	var scene_path: String = str(ANIMATION_PATHS.get(animation_name, ""))
	if scene_path == "":
		push_warning("FireDragon: unknown animation '%s'" % animation_name)
		return 0.0

	if _current_dragon_animation == animation_name and is_instance_valid(anim_player):
		return _play_first_imported_clip(anim_player, animation_name, force_restart)

	var res: Resource = ResourceLoader.load(scene_path, "PackedScene")
	if res == null:
		push_warning("FireDragon: missing animation scene '%s'" % scene_path)
		return 0.0

	var old_model: Node = get_node_or_null("Model")
	if old_model:
		old_model.name = "ModelOld"
		if old_model is Node3D:
			(old_model as Node3D).visible = false
		old_model.queue_free()

	var animated_model: Node = (res as PackedScene).instantiate()
	animated_model.name = "Model"
	add_child(animated_model)
	move_child(animated_model, 0)

	_current_dragon_animation = animation_name
	_apply_skin()
	_stabilize_render_meshes()
	anim_player = _find_animation_player(animated_model)
	if anim_player:
		_current_animation_length = _play_first_imported_clip(anim_player, animation_name, true)
		return _current_animation_length
	return 0.0


func _play_first_imported_clip(player: AnimationPlayer, animation_name: String, force_restart: bool) -> float:
	for clip_name in player.get_animation_list():
		var clip_text: String = str(clip_name)
		if clip_text == "RESET" or clip_text == "T-Pose":
			continue
		var animation: Animation = player.get_animation(clip_name)
		if animation:
			animation.loop_mode = _loop_mode_for(animation_name)
			_current_animation_length = animation.length
		if force_restart or str(player.current_animation) != clip_text or not player.is_playing():
			player.stop()
			player.play(clip_name)
		return _current_animation_length
	return 0.0


func _apply_skin() -> void:
	var body_material := StandardMaterial3D.new()
	body_material.albedo_texture = _texture_for_skin(skin)
	body_material.roughness = 0.8
	body_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_assign_material_recursive(self, body_material)


func _texture_for_skin(skin_value: DragonSkin) -> Texture2D:
	match skin_value:
		DragonSkin.BLACK:
			return BLACK_TEXTURE
		DragonSkin.PURPLE:
			return PURPLE_TEXTURE
		_:
			return RED_TEXTURE


func _assign_material_recursive(node: Node, material: Material) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var surface_count: int = mesh_instance.mesh.get_surface_count() if mesh_instance.mesh else 0
		for surface_index in surface_count:
			mesh_instance.set_surface_override_material(surface_index, material)
	for child in node.get_children():
		_assign_material_recursive(child, material)


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found:
			return found
	return null


func _loop_mode_for(animation_name: String) -> int:
	var lower_name: String = animation_name.to_lower()
	if lower_name.findn("idle") != -1 \
			or lower_name.findn("run") != -1 \
			or lower_name.findn("walk") != -1 \
			or lower_name.findn("fly_forward") != -1:
		return Animation.LOOP_LINEAR
	return Animation.LOOP_NONE
