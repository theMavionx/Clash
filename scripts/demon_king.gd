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
	1: {"hp": 570,  "damage": 42, "atk_speed": 1.538},
	2: {"hp": 750,  "damage": 55, "atk_speed": 1.429},
	3: {"hp": 990,  "damage": 72, "atk_speed": 1.333},
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

const DEMON_ALBEDO: Texture2D = preload("res://Model/Characters/Model/DemonKing_albedo.png")
const DEMON_EMISSION: Texture2D = preload("res://Model/Characters/Model/DemonKing_emission.png")


## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from LEVEL_STATS for the current level. Called by BaseTroop._ready().
func _init_stats() -> void:
	var s = LEVEL_STATS[level]
	move_speed = 0.42        # 16% slower than Knight — heavy unit feel
	attack_range = 0.30      # 25% greater reach — physically larger
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
		push_warning("DemonKing: no embedded AnimationPlayer in body FBX")
		return
	anim_player = embedded

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

	print("[DemonKing] lib anims: ", anim_player.get_animation_list())


## Decide loop mode by clip name. Cyclic motion loops linearly; everything
## else (single-trigger combat anims) is one-shot so it doesn't replay
## continuously while waiting for the next attack_timer cycle.
static func _loop_mode_for(clip_name: String) -> int:
	var lower: String = clip_name.to_lower()
	if lower.findn("run") != -1 \
		or lower.findn("walk") != -1 \
		or lower.findn("idle") != -1 \
		or lower.findn("sense") != -1:
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


## DemonKing FBX has no embedded textures (Unity stripped to .mat); apply the
## Polyart Albedo + Emission as a StandardMaterial3D override on every
## MeshInstance3D. Emission glows where the source PNG has non-black pixels
## (eyes, fire details).
func _apply_demon_albedo(root: Node) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = DEMON_ALBEDO
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST  # polyart look
	mat.emission_enabled = true
	mat.emission_texture = DEMON_EMISSION
	mat.emission_energy_multiplier = 1.5
	_assign_material_recursive(root, mat)


static func _assign_material_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var count: int = mi.mesh.get_surface_count() if mi.mesh else 0
		for i in count:
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_assign_material_recursive(child, mat)


## Same swing/hit-frame contract as Knight: damage lands when attack_timer
## crosses hit_anim_threshold * atk_speed. Fists, not weapons — no sword sync.
func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_hit_this_swing = false
		return

	_face_current_target()
	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		if anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)

	if not _hit_this_swing and attack_timer >= atk_speed * 0.4:
		_hit_this_swing = true
		_deal_target_damage()


var _hit_this_swing: bool = false
