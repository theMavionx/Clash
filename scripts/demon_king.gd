extends BaseTroop
## DemonKing - premium heavy melee, occupies 5 ship slots.
## NFT-backed 5-slot troop. The player upgrades one shared Demon King troop
## level; each owned NFT then applies its rarity multiplier.
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


const COMMON_LEVEL_STATS: Dictionary = {
	1: {"hp": 2700, "damage": 228, "atk_speed": 1.40},
	2: {"hp": 3600, "damage": 300, "atk_speed": 1.30},
	3: {"hp": 4680, "damage": 396, "atk_speed": 1.20},
	4: {"hp": 6000, "damage": 516, "atk_speed": 1.10},
	5: {"hp": 6800, "damage": 610, "atk_speed": 1.02},
	6: {"hp": 9000, "damage": 850, "atk_speed": 0.96},
	7: {"hp": 10700, "damage": 1040, "atk_speed": 0.90},
}

const NFT_RARITY_MULTIPLIERS: Dictionary = {
	"common": 1.2,
	"epic": 1.23,
	"legendary": 1.25,
	"unrevealed": 1.2,
}
const MAX_TROOP_LEVEL: int = 7

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

static var _merged_anim_cache_by_skeleton: Dictionary = {}

const DEBUG_DEMON_KING_ANIMS: bool = false

var player_troop_levels: Dictionary = {}
var nft_rarity: String = "common"
var _manual_tint_variant: bool = false

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

const ACTIVE_PALETTE: Array[Color] = TINT_PURPLE  # default skin — change to TINT_ORANGE/BLUE/PURPLE to swap


const TINT_GOLD: Array[Color] = [
	Color(1.00, 0.96, 0.06),
	Color(1.00, 0.88, 0.02),
	Color(1.00, 0.76, 0.00),
	Color(1.00, 1.00, 0.20),
	Color(1.00, 0.82, 0.04),
	Color(1.00, 0.92, 0.10),
	Color(1.00, 1.00, 0.32),
	Color(0.98, 0.78, 0.08),
	Color(1.00, 0.96, 0.42),
]

const TINT_PALETTES: Dictionary = {
	"pink": TINT_PINK,
	"orange": TINT_ORANGE,
	"blue": TINT_BLUE,
	"purple": TINT_PURPLE,
	"gold": TINT_GOLD,
}

const RARITY_TINT_VARIANTS: Dictionary = {
	"common": "blue",
	"unrevealed": "blue",
	"epic": "purple",
	"legendary": "gold",
}

@export_enum("purple", "blue", "gold", "orange", "pink") var tint_variant: String = "blue"

## Sets hp, damage, atk_speed, move_speed, attack_range, attack_anim, and anim_files
## from the player's current troop levels. Called by BaseTroop._ready().
func _init_stats() -> void:
	# Clamp to a valid tier — upgrade_to(lvl) could be handed an out-of-range
	# level (server desync, bad payload) and dynamic stat calculation stays safe.
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var s: Dictionary = _compute_dynamic_stats(level, player_troop_levels, nft_rarity)
	move_speed = 0.38        # 24% slower than Knight (0.50) — heavy boss feel
	attack_range = 0.32      # 33% greater reach than Knight (0.24) — large hit zone
	can_pass_through_friendly_units = true
	hp = s.hp
	damage = s.damage
	atk_speed = s.atk_speed
	attack_anim = "Melee_1H_Attack_Chop"
	attack_sfx_path = "res://Musik/sound_effects/DemonKingAttack.mp3"
	anim_files = DEMON_ANIM_FILES


func set_player_troop_levels(levels: Dictionary) -> void:
	player_troop_levels = levels.duplicate(true) if levels != null else {}


func set_nft_rarity(value: String) -> void:
	nft_rarity = _normalize_rarity(value)
	if not _manual_tint_variant:
		tint_variant = _tint_variant_for_rarity(nft_rarity)
		if is_inside_tree():
			_apply_demon_albedo(self)


func set_tint_variant(value: String) -> void:
	_manual_tint_variant = true
	tint_variant = _normalize_tint_variant(value)
	if is_inside_tree():
		_apply_demon_albedo(self)


static func _normalize_rarity(value: String) -> String:
	var key: String = str(value).strip_edges().to_lower()
	return key if NFT_RARITY_MULTIPLIERS.has(key) else "common"


static func _normalize_tint_variant(value: String) -> String:
	var key: String = str(value).strip_edges().to_lower()
	return key if TINT_PALETTES.has(key) else "purple"


static func _tint_variant_for_rarity(value: String) -> String:
	return RARITY_TINT_VARIANTS.get(_normalize_rarity(value), "blue")


static func _palette_for_tint_variant(value: String) -> Array:
	return TINT_PALETTES.get(_normalize_tint_variant(value), TINT_PURPLE)


static func _color_power_for_tint_variant(value: String) -> float:
	return 2.35 if _normalize_tint_variant(value) == "gold" else 1.0


static func _troop_level_from_map(levels: Dictionary, troop_type: String) -> int:
	var aliases: Array[String] = [
		troop_type,
		troop_type.capitalize(),
		troop_type.replace("_", ""),
	]
	if troop_type == "demon_king":
		aliases.append("DemonKing")
	for key in aliases:
		if levels.has(key):
			return clampi(int(levels[key]), 1, MAX_TROOP_LEVEL)
	return 1


static func _compute_dynamic_stats(demon_level: int, levels: Dictionary, rarity: String = "common") -> Dictionary:
	var clamped_level: int = clampi(demon_level, 1, MAX_TROOP_LEVEL)
	var troop_level: int = _troop_level_from_map(levels, "demon_king")
	if not levels.has("demon_king") and not levels.has("DemonKing"):
		troop_level = clamped_level
	var stat: Dictionary = COMMON_LEVEL_STATS.get(troop_level, COMMON_LEVEL_STATS[1])
	var rarity_mult: float = float(NFT_RARITY_MULTIPLIERS.get(_normalize_rarity(rarity), 1.2))
	var rarity_scale: float = rarity_mult / float(NFT_RARITY_MULTIPLIERS.common)
	return {
		"hp": int(ceil(float(stat.hp) * rarity_scale)),
		"damage": int(ceil(float(stat.damage) * rarity_scale)),
		"atk_speed": float(stat.atk_speed),
	}


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
	if DEBUG_DEMON_KING_ANIMS:
		print("[DemonKing] anim_player root: ", ap_root_node.name, " skel_rel: ", target_skel_rel)

	# Merge sibling FBX animations with bone-track retargeting + per-clip
	# loop mode. Warmup builds this cache once so the first real deployment
	# reuses the merged library instead of instantiating/retargeting 16 FBXs.
	_merge_cached_sibling_anims(lib, target_skel_rel)

	# Body FBX's own clip (RunFWD) — apply loop mode the same way.
	for clip_name in lib.get_animation_list():
		var anim: Animation = lib.get_animation(clip_name)
		if anim:
			anim.loop_mode = _loop_mode_for(str(clip_name))

	_add_canonical_aliases(lib)

	if not anim_player.has_animation(attack_anim):
		push_warning("DemonKing: '%s' alias missing — attack animation will not play" % attack_anim)

	if DEBUG_DEMON_KING_ANIMS:
		print("[DemonKing] lib anims: ", anim_player.get_animation_list())


func _merge_cached_sibling_anims(lib: AnimationLibrary, target_skel_rel: NodePath) -> void:
	var cache_key := str(target_skel_rel)
	var cached_lib: AnimationLibrary = _merged_anim_cache_by_skeleton.get(cache_key, null)
	if cached_lib == null:
		cached_lib = AnimationLibrary.new()
		for file_path in DEMON_ANIM_FILES:
			var res: Resource = ResourceLoader.load(file_path, "PackedScene")
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
					if not cached_lib.has_animation(unique):
						cached_lib.add_animation(unique, dup)
			temp_root.free()
		_add_canonical_aliases(cached_lib)
		_merged_anim_cache_by_skeleton[cache_key] = cached_lib

	for cached_name in cached_lib.get_animation_list():
		if not lib.has_animation(cached_name):
			lib.add_animation(cached_name, cached_lib.get_animation(cached_name))


static func _add_canonical_aliases(lib: AnimationLibrary) -> void:
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
	var palette: Array = _palette_for_tint_variant(tint_variant)
	mat.set_shader_parameter("color_power", _color_power_for_tint_variant(tint_variant))
	for i in 9:
		mat.set_shader_parameter("color%02d" % (i + 1), palette[i])
	_assign_material_recursive(root, mat)


static func _assign_material_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var count: int = mi.mesh.get_surface_count() if mi.mesh else 0
		for i in count:
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_assign_material_recursive(child, mat)


## Match Knight/server melee timing: damage lands 40% through the attack
## cycle, independent of the visual FBX clip length. Replays are verified by
## the server's fixed 60 Hz simulator, so combat timing must be based on
## atk_speed rather than animation metadata.
@export var hit_anim_threshold: float = 0.4
var _hit_this_swing: bool = false


func _initial_attack_timer() -> float:
	return atk_speed * hit_anim_threshold


func _on_enter_attack_state() -> void:
	_hit_this_swing = false


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

	if not _hit_this_swing and attack_timer >= atk_speed * hit_anim_threshold:
		_hit_this_swing = true
		_play_attack_sfx()
		_deal_target_damage()
		_shake_camera()


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
