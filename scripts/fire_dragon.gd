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
