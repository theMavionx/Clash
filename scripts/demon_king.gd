extends BaseTroop
## DemonKing — premium heavy melee, occupies 2 ship slots.
## Designed at ~1.55x Knight on HP/DPS so 2 Knights still out-stat 1 DemonKing
## but 1 DemonKing comfortably beats 1 Knight.
##
## Mesh: Model/Characters/Model/DemonKing_Body.fbx — actually a copy of
## DemonKing_RunFWD.fbx. We use an anim-FBX as the body because every anim
## FBX in the Polyart pack carries the full character + 1 anim, and the
## embedded AnimationPlayer's tracks reference paths INSIDE THIS scene tree
## — so the run-forward clip plays correctly. We picked RunFWD specifically
## because it's the movement animation needed when troops chase a target;
## idle/attack clips from sibling FBX files do not bind (their tracks were
## authored against a different scene root) and are deliberately omitted.
##
## Animations: 16 dedicated DemonKing_*.fbx files in Model/Characters/Animations/DemonKing/.
## After base_troop builds the AnimationLibrary with raw clip names, we alias
## them to the canonical names BaseTroop plays ("Idle_A", "Running_A",
## "Melee_1H_Attack_Chop") so the rest of the combat code works unchanged.


const LEVEL_STATS = {
	1: {"hp": 660,  "damage": 70,  "atk_speed": 1.80},
	2: {"hp": 880,  "damage": 92,  "atk_speed": 1.65},
	3: {"hp": 1150, "damage": 120, "atk_speed": 1.50},
}

const DEMON_ANIM_FILES: Array = [
	"res://Model/Characters/Animations/DemonKing/DemonKing_Attack01.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_Attack02.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_Die.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_Dizzy.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_GetHit.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_IdleBattle.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_IdleNormal.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_RunFWD.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_SenseSomethingMaint.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_SenseSomethingStart.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_Taunting.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_Victory.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_WalkBWD.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_WalkFWD.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_WalkLFT.fbx",
	"res://Model/Characters/Animations/DemonKing/DemonKing_WalkRGT.fbx",
]

## Substring (from the imported anim name) → alias BaseTroop expects.
## After base_troop._setup_animations() builds the library with raw FBX names
## (e.g. "DemonKing|Attack01" or "Attack01"), we add canonical aliases so
## anim_player.play("Idle_A") / play(attack_anim) / play("Running_A") work.
const ANIM_NAME_MAP: Dictionary = {
	"Attack01":    "Melee_1H_Attack_Chop",
	"IdleNormal":  "Idle_A",
	"IdleBattle":  "Idle_Battle",
	"RunFWD":      "Running_A",
	"WalkFWD":     "Walking_A",
	"Die":         "Die",
	"Victory":     "Cheering",
	"GetHit":      "GetHit",
	"Taunting":    "Taunting",
}

# Note: DemonKing_albedo.png is the un-masked base; the MaskTint shader uses
# DemonKing_mask_albedo.png instead, so the plain albedo isn't preloaded here.
const DEMON_EMISSION: Texture2D = preload("res://Model/Characters/Model/DemonKing_emission.png")
const DEMON_MASK_ALBEDO: Texture2D = preload("res://Model/Characters/Model/DemonKing_mask_albedo.png")
const DEMON_MASK_01: Texture2D = preload("res://Model/Characters/Model/DemonKing_mask01.png")
const DEMON_MASK_02: Texture2D = preload("res://Model/Characters/Model/DemonKing_mask02.png")
const DEMON_MASK_03: Texture2D = preload("res://Model/Characters/Model/DemonKing_mask03.png")
const DEMON_MASK_TINT_SHADER: Shader = preload("res://shaders/demon_mask_tint.gdshader")

# ── Tint palettes (9 colors per variant, ordered to match shader uniforms
#    color01 .. color09). Pink is the project default; Orange/Blue/Purple are
#    the three stock variants from the RPGMonsterBundlePolyart pack (mat files
#    PAMaskTint01.mat / 02.mat / 03.mat respectively). Switch variants by
#    pointing ACTIVE_PALETTE at a different constant.
const TINT_PINK: Array[Color] = [
	Color(0.91, 0.16, 0.55),  # 01 hot pink primary
	Color(0.97, 0.13, 0.45),  # 02 bright magenta
	Color(0.71, 0.06, 0.40),  # 03 deep magenta
	Color(0.85, 0.28, 0.62),  # 04 light pink
	Color(0.88, 0.21, 0.50),  # 05 medium
	Color(0.78, 0.28, 0.55),  # 06 muted rose
	Color(1.00, 0.17, 0.60),  # 07 vibrant magenta
	Color(0.36, 0.36, 0.36),  # 08 neutral gray (skin/teeth)
	Color(0.95, 0.70, 0.85),  # 09 pale pink accent
]

const TINT_ORANGE: Array[Color] = [
	Color(0.99, 0.31, 0.00),
	Color(0.86, 0.08, 0.00),
	Color(0.85, 0.27, 0.00),
	Color(1.00, 0.49, 0.00),
	Color(0.57, 0.07, 0.00),
	Color(1.00, 0.30, 0.00),
	Color(1.00, 0.43, 0.00),
	Color(0.36, 0.36, 0.36),
	Color(0.89, 0.65, 0.42),
]

const TINT_BLUE: Array[Color] = [
	Color(0.00, 0.34, 0.90),
	Color(0.10, 0.32, 0.94),
	Color(0.21, 0.32, 0.88),
	Color(0.31, 0.45, 0.83),
	Color(0.14, 0.32, 0.62),
	Color(0.35, 0.33, 0.88),
	Color(0.00, 0.21, 1.00),
	Color(0.36, 0.36, 0.36),
	Color(0.38, 0.58, 0.78),
]

const TINT_PURPLE: Array[Color] = [
	Color(0.37, 0.16, 0.91),
	Color(0.54, 0.13, 0.97),
	Color(0.25, 0.06, 0.71),
	Color(0.62, 0.28, 0.85),
	Color(0.40, 0.21, 0.88),
	Color(0.44, 0.28, 0.78),
	Color(0.60, 0.17, 1.00),
	Color(0.36, 0.36, 0.36),
	Color(0.52, 0.47, 0.75),
]

const ACTIVE_PALETTE: Array[Color] = TINT_PINK  # default skin — change to TINT_ORANGE/BLUE/PURPLE to swap


## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	# Clamp to a valid tier — upgrade_to(lvl) could be handed an out-of-range
	# level (server desync, bad payload) and LEVEL_STATS[level] would crash.
	if not LEVEL_STATS.has(level):
		level = clampi(level, 1, LEVEL_STATS.size())
	var s = LEVEL_STATS[level]
	move_speed = 0.38        # 24% slower than Knight (0.50) — heavy boss feel
	attack_range = 0.32      # 33% greater reach than Knight (0.24) — large hit zone
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Melee_1H_Attack_Chop"
	anim_files = DEMON_ANIM_FILES


## DemonKing fights bare-handed (no skeleton slot for a weapon).
func _setup_weapons() -> void:
	pass


func _ready() -> void:
	# Slightly larger than regular troops (0.1) to convey boss presence.
	# Must be set before super._ready() so _physics_process locks to it.
	_spawn_scale = 0.12
	super._ready()
	# Replace the empty TroopAnimPlayer base_troop made with the FBX's own
	# embedded AnimationPlayer — its tracks reference paths inside THIS scene
	# tree so they resolve, unlike anims copied from disjoint FBX scenes.
	_use_embedded_anim_player_and_merge()
	_apply_demon_albedo(self)


func _use_embedded_anim_player_and_merge() -> void:
	# Locate the AnimationPlayer shipped inside DemonKing_Body.fbx (= RunFWD).
	# base_troop already created an empty "TroopAnimPlayer" — we reassign
	# anim_player to the embedded one so its track paths resolve against the
	# real scene tree.
	var embedded: AnimationPlayer = _find_first_anim_player(self, anim_player)
	if embedded == null:
		# No embedded player → keep base_troop's TroopAnimPlayer (already set up
		# from anim_files). Better a degraded fallback than no animation at all.
		push_warning("DemonKing: no embedded AnimationPlayer in body FBX — using base anim player")
		return
	# Free base_troop's now-unused empty TroopAnimPlayer so it doesn't linger in
	# the tree (memory + future _find_first_anim_player collisions).
	var old_player: AnimationPlayer = anim_player
	anim_player = embedded
	if is_instance_valid(old_player) and old_player != embedded:
		old_player.queue_free()

	var lib: AnimationLibrary = null
	for lib_name in anim_player.get_animation_library_list():
		lib = anim_player.get_animation_library(lib_name)
		break
	if lib == null:
		lib = AnimationLibrary.new()
		anim_player.add_animation_library("", lib)

	# Where this player resolves NodePaths from. Sibling-FBX anims authored
	# their bone tracks as "Skeleton3D:bone_name", so we need to rewrite them
	# to whatever path Skeleton3D has UNDER this player's root_node.
	var ap_root_node: Node = anim_player.get_node(anim_player.root_node) if anim_player.root_node != ^"" else anim_player.get_parent()
	if ap_root_node == null:
		ap_root_node = anim_player.get_parent()
	var target_skel: Node = ap_root_node.find_child("Skeleton3D", true, false)
	if target_skel == null:
		push_warning("DemonKing: no Skeleton3D under anim_player root")
	var target_skel_rel: NodePath = ap_root_node.get_path_to(target_skel) if target_skel else ^"Skeleton3D"
	print("[DemonKing] anim_player root: ", ap_root_node.name, " skel_rel: ", target_skel_rel)

	# Merge sibling FBX animations with bone-track retargeting + per-clip
	# loop mode (one-shot for attack/die/hit, cyclic for run/walk/idle).
	for file_path in DEMON_ANIM_FILES:
		var res: Resource = load(file_path)
		if res == null:
			continue
		var temp_root: Node = res.instantiate()
		var temp_player: AnimationPlayer = _find_first_anim_player(temp_root, null)
		if temp_player:
			for clip_name in temp_player.get_animation_list():
				if clip_name == "RESET" or clip_name == "T-Pose":
					continue
				var src_anim: Animation = temp_player.get_animation(clip_name)
				if src_anim == null:
					continue
				var dup: Animation = _retarget_to_skeleton(src_anim, target_skel_rel)
				# Use file basename to avoid name collisions across the 16 files
				# (each Unity export tends to name its single clip "Attack01" etc.,
				# which would shadow earlier identically-named clips).
				var unique: String = file_path.get_file().get_basename().replace("DemonKing_", "")
				dup.loop_mode = _loop_mode_for(unique)
				if not lib.has_animation(unique):
					lib.add_animation(unique, dup)
		temp_root.free()

	# Body FBX's own clip (RunFWD) — apply loop mode the same way.
	for clip_name in lib.get_animation_list():
		var anim: Animation = lib.get_animation(clip_name)
		if anim:
			anim.loop_mode = _loop_mode_for(str(clip_name))

	# Alias clips to the canonical names this script's combat code calls.
	# Movement: longest non-one-shot clip = run cycle.
	var movement_clip: StringName = &""
	var longest_len: float = -1.0
	for raw_name in lib.get_animation_list():
		if _loop_mode_for(str(raw_name)) != Animation.LOOP_LINEAR:
			continue
		var a: Animation = lib.get_animation(raw_name)
		if a and a.length > longest_len:
			longest_len = a.length
			movement_clip = raw_name
	for source_substr in ANIM_NAME_MAP:
		var target_name: String = ANIM_NAME_MAP[source_substr]
		if lib.has_animation(target_name):
			continue
		for raw_name in lib.get_animation_list():
			if str(raw_name).findn(source_substr) != -1:
				var src: Animation = lib.get_animation(raw_name)
				if src:
					var alias_dup: Animation = src.duplicate()
					alias_dup.loop_mode = _loop_mode_for(target_name)
					lib.add_animation(target_name, alias_dup)
				break
	# Fallback Running_A from longest non-one-shot clip.
	if not lib.has_animation("Running_A") and movement_clip != &"":
		var run: Animation = lib.get_animation(movement_clip)
		if run:
			var run_dup: Animation = run.duplicate()
			run_dup.loop_mode = Animation.LOOP_LINEAR
			lib.add_animation("Running_A", run_dup)

	# Pre-cache the attack anim length NOW (lib is finalised). Without this,
	# the FIRST swing falls through to the atk_speed*0.35 fallback in
	# _do_attack and lands at a different time than every subsequent swing.
	# Cache once → consistent damage timing from swing #1 onward.
	if anim_player.has_animation(attack_anim):
		var attack_anim_res: Animation = anim_player.get_animation(attack_anim)
		if attack_anim_res:
			_attack_anim_length = attack_anim_res.length
	else:
		# Alias never resolved (no clip matched "Attack01"). _do_attack still
		# deals damage via the atk_speed*0.35 fallback, but warn so it's visible.
		push_warning("DemonKing: '%s' alias missing — attack will use atk_speed fallback timing" % attack_anim)

	print("[DemonKing] lib anims: ", anim_player.get_animation_list(), " | attack_anim_length=", _attack_anim_length)


## Decide loop mode by clip name. Cyclic motion AND post-battle cheering loop
## linearly; single-trigger combat anims are one-shot so they don't replay
## while we wait for the next attack_timer cycle.
static func _loop_mode_for(clip_name: String) -> int:
	var lower: String = clip_name.to_lower()
	if lower.findn("run") != -1 \
		or lower.findn("walk") != -1 \
		or lower.findn("idle") != -1 \
		or lower.findn("sense") != -1 \
		or lower.findn("victory") != -1 \
		or lower.findn("cheer") != -1 \
		or lower.findn("taunt") != -1:
		return Animation.LOOP_LINEAR
	return Animation.LOOP_NONE


## Duplicates [param src_anim] and rewrites every transform/blendshape track
## so the node-path prefix points to [param target_skel_rel] (relative to the
## AnimationPlayer's root_node). Bone name (subname) is preserved.
func _retarget_to_skeleton(src_anim: Animation, target_skel_rel: NodePath) -> Animation:
	var dup: Animation = src_anim.duplicate()
	if target_skel_rel == ^"":
		return dup
	for i in dup.get_track_count():
		var ttype: int = dup.track_get_type(i)
		# Only retarget skeletal/blendshape tracks. VALUE tracks may point
		# elsewhere (visibility on a MeshInstance), leave alone.
		if ttype != Animation.TYPE_POSITION_3D \
			and ttype != Animation.TYPE_ROTATION_3D \
			and ttype != Animation.TYPE_SCALE_3D \
			and ttype != Animation.TYPE_BLEND_SHAPE:
			continue
		var raw: NodePath = dup.track_get_path(i)
		var subnames: String = raw.get_concatenated_subnames()
		if subnames == "":
			continue
		var new_path: NodePath = NodePath(str(target_skel_rel) + ":" + subnames)
		dup.track_set_path(i, new_path)
	return dup


## Recursive search for the first AnimationPlayer in [param node]'s subtree,
## skipping [param skip] (used to ignore base_troop's empty TroopAnimPlayer).
func _find_first_anim_player(node: Node, skip: AnimationPlayer) -> AnimationPlayer:
	if node is AnimationPlayer and node != skip:
		return node as AnimationPlayer
	for child in node.get_children():
		var found: AnimationPlayer = _find_first_anim_player(child, skip)
		if found != null:
			return found
	return null


## DemonKing FBX has no embedded textures (Unity stripped to .mat). Apply
## the Polyart MaskTint shader: 1 base mask-tint albedo + 3 region masks
## + 9 colors from ACTIVE_PALETTE. Same shader, swappable palette — choose
## variant by re-pointing ACTIVE_PALETTE at the top of this file.
func _apply_demon_albedo(root: Node) -> void:
	var mat := ShaderMaterial.new()
	mat.shader = DEMON_MASK_TINT_SHADER
	mat.set_shader_parameter("albedo", DEMON_MASK_ALBEDO)
	mat.set_shader_parameter("emission_tex", DEMON_EMISSION)
	mat.set_shader_parameter("mask01", DEMON_MASK_01)
	mat.set_shader_parameter("mask02", DEMON_MASK_02)
	mat.set_shader_parameter("mask03", DEMON_MASK_03)
	for i in 9:
		mat.set_shader_parameter("color%02d" % (i + 1), ACTIVE_PALETTE[i])
	_assign_material_recursive(root, mat)


static func _assign_material_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var count: int = mi.mesh.get_surface_count() if mi.mesh else 0
		for i in count:
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_assign_material_recursive(child, mat)


## Damage timed to HALF of the (trimmed) attack animation duration — the
## visual peak of the swing. The animation is pre-trimmed to 70% of source
## length in _use_embedded_anim_player_and_merge (Unity's FBX export leaves
## a jittery "return-to-rest" tail), and its length is pre-cached so
## (length / 2) lands cleanly on the impact frame from the FIRST swing
## onward — without the cache, swing #1 would fall through to a different
## fallback timing than swing #2+.
var _hit_this_swing: bool = false
var _attack_anim_length: float = -1.0
var _prev_swing_timer: float = 999.0


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_hit_this_swing = false
		_prev_swing_timer = 999.0
		return

	_face_current_target()

	# A backwards jump in attack_timer means a new swing began: either
	# base_troop zeroed it on a fresh RUNNING→ATTACKING entry, or our cycle
	# below subtracted atk_speed. Reset the hit flag so the first swing after
	# re-entry isn't silently skipped (stale _hit_this_swing from the last
	# attack session would otherwise block _deal_target_damage).
	if attack_timer < _prev_swing_timer - 0.0001:
		_hit_this_swing = false

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		if anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

	var hit_at: float = _attack_anim_length * 0.5 if _attack_anim_length > 0.0 else atk_speed * 0.35
	if not _hit_this_swing and attack_timer >= hit_at:
		_hit_this_swing = true
		_deal_target_damage()
		_shake_camera()

	_prev_swing_timer = attack_timer


## Small camera kick on each landed hit — the DemonKing is a heavy boss, so
## its swing connecting should feel weighty. CameraRig caps/accumulates trauma.
var _camera_rig: Node = null

func _shake_camera() -> void:
	if _camera_rig == null or not is_instance_valid(_camera_rig):
		_camera_rig = get_tree().current_scene.find_child("CameraRig", true, false)
	if _camera_rig and _camera_rig.has_method("add_trauma"):
		_camera_rig.add_trauma(0.5)


## Death with the Die animation. base_troop.take_damage frees the unit
## instantly (no death anim); we override to play "Die" first, then free.
## Setting _is_dead makes base_troop._physics_process bail out, so combat
## stops while the body falls.
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
	if anim_player and anim_player.has_animation("Die"):
		anim_player.stop()
		anim_player.play("Die")
		var die_anim: Animation = anim_player.get_animation("Die")
		var dur: float = die_anim.length if die_anim else 0.8
		await get_tree().create_timer(dur).timeout
	queue_free()
