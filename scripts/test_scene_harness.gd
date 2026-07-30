extends Node
## Test-only one-button village builder for scenes/TestMain.tscn.

class DelayedCollectionNetwork:
	extends Node
	var delay_seconds := 1.5

	func has_token() -> bool:
		return true

	func collect_resources(_building_id: int) -> Dictionary:
		await get_tree().create_timer(delay_seconds).timeout
		return {}

var _panel: PanelContainer
var _status: Label
var _spawn_list: VBoxContainer
var _build_generation: int = 0
var _attack_counts: Dictionary = {}
var _attack_levels: Dictionary = {}
var _attack_count_labels: Dictionary = {}
var _attack_level_labels: Dictionary = {}
var _attack_loadout_box: VBoxContainer
var _test_ship_level_label: Label
var _test_ship_capacity_label: Label
var _test_attack_ship_level: int = 1
var _test_ship_ability_hud: PanelContainer
var _test_ship_energy_label: Label
var _test_ship_ability_hint: Label
var _test_ship_ability_buttons: Dictionary = {}
var _test_ship_ability_refresh_elapsed: float = 0.0
var _fps_profile_active: bool = false
var _speed_label: Label
var _demon_color_preview_root: Node3D
var _model_scale_list: VBoxContainer
var _model_scale_labels: Dictionary = {}
var _model_scale_sliders: Dictionary = {}
var _model_scale_base_values: Dictionary = {}
var _model_scale_multipliers: Dictionary = {}
var _water_variant_label: Label
var _water_fps_label: Label
var _water_fps_elapsed: float = 0.0
var _water_fps_min: float = INF
var _water_fps_max: float = 0.0
var _water_variant_key: String = "quality"

const TEST_ATTACK_PREFERRED_ORDER: Array[String] = [
	"Knight",
	"Mage",
	"Archer",
	"PeaShooter",
	"Mimic",
	"Necromancer",
	"Horror",
	"MechanicalDragon",
	"IceGolem",
	"WindMage",
	"DemonKing",
	"FireDragon",
]
const FPS_PROFILE_IDLE_SECONDS: float = 6.0
const FPS_PROFILE_COMBAT_SECONDS: float = 12.0
const FPS_PROFILE_SETTLE_SECONDS: float = 2.0
const KNIGHT_SWARM_PROFILE_COUNT: int = 45
const TROOP_MATRIX_PROFILE_CAPACITY: int = 45
const MIXED_SWARM_PROFILE_COUNTS: Dictionary = {
	"Knight": 12,
	"Archer": 12,
	"Mage": 10,
	"PeaShooter": 10,
	"Mimic": 8,
	"Necromancer": 8,
	"Horror": 6,
	"MechanicalDragon": 6,
	"IceGolem": 6,
	"WindMage": 8,
	"DemonKing": 7,
	"FireDragon": 7,
}
const TH6_BROWSER_PROFILE_CAPACITY: int = 45
const TH6_BROWSER_PROFILE_SAMPLE_SEC: float = 4.0
const TH6_BROWSER_PROFILE_LAYOUT_SEED: int = 620260
const TH6_BOTTLENECK_PROFILE_SAMPLE_SEC: float = 3.0
const TH6_BOTTLENECK_PROFILE_MODES: Array[Dictionary] = [
	{"name": "default"},
	{"name": "no_separation", "no_separation": true},
	{"name": "no_slots", "no_slots": true},
	{"name": "no_animation", "no_animation": true},
	{"name": "no_physics", "no_physics": true},
	{"name": "no_visuals", "no_visuals": true},
	{"name": "no_defense_physics", "no_defense_physics": true},
	{"name": "no_guard_physics", "no_guard_physics": true},
	{
		"name": "no_tower_or_guard_physics",
		"no_defense_physics": true,
		"no_guard_physics": true,
	},
	{"name": "dense_separation_10hz", "separation_interval": 6},
	{"name": "dense_separation_7_5hz", "separation_interval": 8},
	{"name": "dense_slots_5hz", "slot_interval_sec": 0.2},
	{
		"name": "dense_cadence_7_5hz_slots_5hz",
		"separation_interval": 8,
		"slot_interval_sec": 0.2,
	},
	{
		"name": "no_troop_physics_or_visuals",
		"no_physics": true,
		"no_visuals": true,
	},
	{
		"name": "no_troop_or_defense_physics",
		"no_physics": true,
		"no_defense_physics": true,
	},
	{
		"name": "no_troop_or_guard_physics",
		"no_physics": true,
		"no_guard_physics": true,
	},
]
const TH6_BROWSER_PROFILE_SCENARIOS: Array[Dictionary] = [
	{"name": "knight_capacity", "single": "Knight"},
	{"name": "archer_capacity", "single": "Archer"},
	{"name": "mage_capacity", "single": "Mage"},
	{"name": "pea_capacity", "single": "PeaShooter"},
	{"name": "barrel_capacity", "single": "Mimic"},
	{"name": "mechanical_capacity", "single": "MechanicalDragon"},
	{"name": "ice_golem_capacity", "single": "IceGolem"},
	{"name": "necromancer_capacity", "single": "Necromancer"},
	{"name": "horror_capacity", "single": "Horror"},
	{"name": "wind_mage_capacity", "single": "WindMage"},
	{"name": "demon_king_capacity", "single": "DemonKing"},
	{"name": "fire_dragon_capacity", "single": "FireDragon"},
	{
		"name": "light_mixed",
		"troops": {"Knight": 15, "Archer": 15, "PeaShooter": 3},
	},
	{
		"name": "classic_mixed",
		"troops": {"Knight": 13, "Archer": 12, "Mage": 5},
	},
	{
		"name": "heavy_mixed",
		"troops": {
			"MechanicalDragon": 2,
			"IceGolem": 1,
			"FireDragon": 1,
			"DemonKing": 3,
		},
	},
	{
		"name": "summoner_mixed",
		"troops": {"Necromancer": 1, "WindMage": 1, "PeaShooter": 3},
	},
	{
		"name": "evolution_mixed",
		"troops": {"Horror": 2, "PeaShooter": 1},
	},
	{
		"name": "knight_rage",
		"single": "Knight",
		"abilities": ["rage"],
	},
	{
		"name": "classic_medkit",
		"troops": {"Knight": 15, "Archer": 15, "Mage": 3},
		"abilities": ["medkit"],
	},
	{
		"name": "heavy_freeze_barrel",
		"troops": {
			"MechanicalDragon": 2,
			"IceGolem": 1,
			"FireDragon": 1,
			"DemonKing": 3,
		},
		"abilities": ["freeze", "skeleton_barrel"],
	},
	{
		"name": "heavy_freeze_only",
		"troops": {
			"MechanicalDragon": 2,
			"IceGolem": 1,
			"FireDragon": 1,
			"DemonKing": 3,
		},
		"abilities": ["freeze"],
	},
	{
		"name": "heavy_barrel_only",
		"troops": {
			"MechanicalDragon": 2,
			"IceGolem": 1,
			"FireDragon": 1,
			"DemonKing": 3,
		},
		"abilities": ["skeleton_barrel"],
	},
]
const TEST_SPEED_PRESETS: Array[float] = [0.5, 1.0, 2.0, 4.0]
const TEST_SPEED_STEP: float = 0.25
const TEST_SPEED_MIN: float = 0.25
const TEST_SPEED_MAX: float = 8.0
const TEST_SHIP_ABILITY_REFRESH_SEC: float = 0.10
const TEST_SHIP_ABILITY_ORDER: Array[String] = [
	"cannon",
	"rally",
	"medkit",
	"freeze",
	"rage",
	"skeleton_barrel",
]
const TEST_SHIP_ABILITY_LABELS: Dictionary = {
	"cannon": "Cannon",
	"rally": "Rally",
	"medkit": "Heal",
	"freeze": "Freeze",
	"rage": "Rage",
	"skeleton_barrel": "Barrel",
}
const MODEL_SCALE_MIN: float = 0.10
const MODEL_SCALE_MAX: float = 1.50
const MODEL_SCALE_STEP: float = 0.01
const WATER_LAB_SAMPLE_SECONDS: float = 6.0
const WATER_LAB_SETTLE_SECONDS: float = 3.0
const WATER_VARIANTS: Array[Dictionary] = [
	{
		"key": "quality",
		"label": "Quality",
		"material_path": "res://shaders/water_stable.tres",
		"description": "Current production water: two wave maps and shore depth fade.",
	},
	{
		"key": "balanced",
		"label": "Balanced",
		"material_path": "res://shaders/water_balanced.tres",
		"description": "One wave map, analytic crossing waves and shore depth fade.",
	},
	{
		"key": "performance",
		"label": "Performance",
		"material_path": "res://shaders/water_fast.tres",
		"description": "Moving waves and foam without per-pixel scene-depth reconstruction.",
	},
]
const DEMON_COLOR_TEST_VARIANTS: Array[Dictionary] = [
	{"label": "Blue", "variant": "blue", "pos": Vector3(-1.6, 0.08, 2.25), "color": Color(0.18, 0.48, 1.0)},
	{"label": "Purple", "variant": "purple", "pos": Vector3(0.0, 0.08, 2.25), "color": Color(0.58, 0.30, 1.0)},
	{"label": "Gold", "variant": "gold", "pos": Vector3(1.6, 0.08, 2.25), "color": Color(1.0, 0.72, 0.12)},
]


func _core_layout() -> Array:
	var layout: Array = []
	for building_id in _active_building_ids():
		layout.append({"id": building_id, "pos": Vector2i.ZERO})
	return layout


func _ready() -> void:
	_create_panel()
	_create_test_ship_ability_hud()
	call_deferred("_populate_spawn_list")
	call_deferred("_set_status", "Scene ready. F1 panel, 1 build random village.")
	if OS.get_cmdline_args().has("--capture-demon-colors"):
		call_deferred("_capture_demon_king_color_test")
	if OS.get_cmdline_user_args().has("--capture-attack-grid"):
		call_deferred("_capture_attack_grid_test")
	if OS.get_cmdline_user_args().has("--capture-single-ship-combat"):
		call_deferred("_capture_single_ship_combat_test")
	if OS.get_cmdline_user_args().has("--capture-main-ship-approach-frames"):
		call_deferred("_capture_main_ship_approach_frames")
	if OS.get_cmdline_user_args().has("--capture-tentacle-idle"):
		call_deferred("_capture_tentacle_idle_test")
	if OS.get_cmdline_user_args().has("--capture-archer-towers"):
		call_deferred("_capture_archer_tower_test")
	if OS.get_cmdline_user_args().has("--verify-archer-tower-combat"):
		call_deferred("_verify_archer_tower_combat")
	if OS.get_cmdline_user_args().has("--verify-pirate-archer-combat"):
		call_deferred("_verify_pirate_archer_combat")
	if OS.get_cmdline_user_args().has("--capture-troop-scale-comparison"):
		call_deferred("_capture_troop_scale_comparison")
	if OS.get_cmdline_user_args().has("--verify-shark-trap"):
		call_deferred("_verify_shark_trap")
	if OS.get_cmdline_user_args().has("--verify-ambient-shark-route"):
		call_deferred("_verify_ambient_shark_route")
	if OS.get_cmdline_user_args().has("--verify-water-material-parity"):
		call_deferred("_verify_water_material_parity")
	if OS.get_cmdline_user_args().has("--capture-resource-collection-feedback"):
		call_deferred("_capture_resource_collection_feedback")
	if OS.get_cmdline_user_args().has("--capture-th6-village"):
		call_deferred("_capture_th6_village")
	if OS.get_cmdline_user_args().has("--verify-test-scene-parity"):
		call_deferred("_verify_test_scene_parity")
	if OS.get_cmdline_user_args().has("--verify-test-scene-mixed-combat"):
		call_deferred("_verify_test_scene_mixed_combat")
	if OS.get_cmdline_user_args().has("--verify-collect-icons-during-move"):
		call_deferred("_verify_collect_icons_during_move")
	if OS.get_cmdline_user_args().has("--verify-main-ship-motion"):
		call_deferred("_verify_main_ship_motion")
	if OS.get_cmdline_user_args().has("--verify-main-ship-panel"):
		call_deferred("_verify_main_ship_panel")
	if OS.get_cmdline_user_args().has("--verify-main-ship-flag-uv"):
		call_deferred("_verify_main_ship_flag_uv")
	if OS.get_cmdline_user_args().has("--capture-main-ship-flag-orientation"):
		call_deferred("_capture_main_ship_flag_orientation")
	if OS.get_cmdline_user_args().has("--verify-camera-safety"):
		call_deferred("_verify_camera_safety")
	if OS.get_cmdline_user_args().has("--verify-stale-warmup-await"):
		call_deferred("_verify_stale_warmup_await")
	if OS.get_cmdline_user_args().has("--verify-cloud-warmup-barrier"):
		call_deferred("_verify_cloud_warmup_barrier")
	if OS.get_cmdline_user_args().has("--verify-defeat-reserve"):
		call_deferred("_verify_defeat_reserve")
	if OS.get_cmdline_user_args().has("--verify-hold-deployment"):
		call_deferred("_verify_hold_deployment")
	if OS.get_cmdline_user_args().has("--verify-test-ship-abilities"):
		call_deferred("_verify_test_ship_abilities")
	if OS.get_cmdline_user_args().has("--auto-fps-profile"):
		call_deferred("run_mixed_fps_profile")
	if OS.get_cmdline_user_args().has("--auto-knight-swarm-profile"):
		call_deferred("run_knight_swarm_fps_profile")
	if OS.get_cmdline_user_args().has("--auto-mixed-swarm-profile"):
		call_deferred("run_mixed_swarm_fps_profile")
	if OS.get_cmdline_user_args().has("--auto-troop-matrix-profile"):
		call_deferred("run_troop_matrix_fps_profile")
	if OS.get_cmdline_user_args().has("--auto-th6-browser-matrix-profile"):
		call_deferred("run_th6_browser_matrix_profile")
	if OS.get_cmdline_user_args().has("--auto-th6-bottleneck-profile"):
		call_deferred("run_th6_bottleneck_profile")
	if OS.get_cmdline_user_args().has("--auto-th6-defense-breakdown-profile"):
		call_deferred("run_th6_defense_breakdown_profile")
	if OS.get_cmdline_user_args().has("--auto-th6-idle-render-profile"):
		call_deferred("run_th6_idle_render_profile")
	if OS.get_cmdline_user_args().has("--auto-th6-building-render-profile"):
		call_deferred("run_th6_building_render_profile")
	if OS.get_cmdline_user_args().has("--auto-th6-hotspot-ab-profile"):
		call_deferred("run_th6_hotspot_ab_profile")
	if OS.get_cmdline_user_args().has("--auto-water-variant-profile"):
		call_deferred("run_water_variant_profile")


func _exit_tree() -> void:
	Engine.time_scale = 1.0


func _process(delta: float) -> void:
	_update_water_lab_fps(delta)
	if not is_instance_valid(_test_ship_ability_hud) or not _test_ship_ability_hud.is_visible_in_tree():
		return
	_test_ship_ability_refresh_elapsed += delta
	if _test_ship_ability_refresh_elapsed < TEST_SHIP_ABILITY_REFRESH_SEC:
		return
	_test_ship_ability_refresh_elapsed = 0.0
	_refresh_test_ship_ability_hud()


func _verify_defeat_reserve() -> void:
	var bs: Node = get_node_or_null("../BuildingSystem")
	var attack: Node = get_node_or_null("../AttackSystem")
	var battle: Variant = bs.get("_battle") if bs else null
	if bs == null or attack == null or battle == null:
		push_error("Defeat reserve test failed: combat systems are missing.")
		get_tree().quit(1)
		return

	attack.cleanup_combat_nodes()
	battle.reset()
	await get_tree().process_frame
	battle.is_viewing_enemy = true
	battle._replay_active = false
	battle._victory_declared = false
	battle._battle_timer_active = true
	battle._battle_timer = 15.0
	battle._battle_start_time = Time.get_ticks_msec() / 1000.0 - 15.0
	battle._saved_fleet = [{"level": 1, "troops": ["Mage", "Mage"]}]
	battle.enemy_info = {}
	battle._had_troops = true
	battle._skeleton_respawn_timer = 0.0
	attack._manual_deployment_mode = true
	attack._main_ship_ready_for_deployment = true
	attack.is_attack_mode = true
	attack._fleet = battle._saved_fleet.duplicate(true)
	attack._army_entries.clear()
	attack._army_entries.append("Mage")
	attack._rebuild_army_groups()
	attack._total_ships_launched = 1

	var spawn_pos := Vector3(0.0, float(bs.grid_y), 0.0)
	if not attack._spawn_manual_troop("Mage", 1, spawn_pos, 0):
		push_error("Defeat reserve test failed: Mage could not be spawned.")
		get_tree().quit(1)
		return
	var deployed_mage: Node = await _wait_for_live_test_troop(2.0)
	if deployed_mage == null:
		push_error("Defeat reserve test failed: deployed Mage did not activate.")
		get_tree().quit(1)
		return
	deployed_mage.take_damage(int(deployed_mage.get("max_hp")) + 1)
	await get_tree().process_frame
	await get_tree().process_frame
	battle.check_defeat(4.0)
	var reserve_blocked_defeat: bool = (
		not battle._victory_declared
		and battle._battle_timer_active
		and attack.remaining_undeployed_troops() == 1
		and battle._skeleton_respawn_timer == 0.0
	)
	if not reserve_blocked_defeat:
		push_error(
			"Defeat reserve test failed: reserve did not block defeat "
			+ "(victory_declared=%s timer_active=%s reserve=%d grace=%.2f)." % [
				battle._victory_declared,
				battle._battle_timer_active,
				attack.remaining_undeployed_troops(),
				battle._skeleton_respawn_timer,
			]
		)
		get_tree().quit(1)
		return

	if not attack._spawn_manual_troop("Mage", 1, spawn_pos, 1):
		push_error("Defeat reserve test failed: cleanup Mage could not be spawned.")
		get_tree().quit(1)
		return
	var cleanup_mage: Node = await _wait_for_live_test_troop(2.0)
	if cleanup_mage == null:
		push_error("Defeat reserve test failed: cleanup Mage did not activate.")
		get_tree().quit(1)
		return
	battle._force_defeat("Regression test timeout")
	await get_tree().process_frame
	await get_tree().process_frame
	var combat_nodes_left: int = 0
	for group_name in ["troops", "ships", "deployed_ships"]:
		combat_nodes_left += get_tree().get_nodes_in_group(group_name).size()
	var cleanup_complete: bool = (
		battle._victory_declared
		and not battle._battle_timer_active
		and not attack.is_attack_mode
		and attack.remaining_undeployed_troops() == 0
		and combat_nodes_left == 0
		and not is_instance_valid(cleanup_mage)
	)
	if not cleanup_complete:
		push_error(
			"Defeat reserve test failed: combat cleanup incomplete "
			+ "(timer_active=%s attack_mode=%s reserve=%d nodes=%d mage_valid=%s)." % [
				battle._battle_timer_active,
				attack.is_attack_mode,
				attack.remaining_undeployed_troops(),
				combat_nodes_left,
				is_instance_valid(cleanup_mage),
			]
		)
		get_tree().quit(1)
		return
	print("[DEFEAT_RESERVE_TEST] PASS reserve_blocked=true cleanup=true")
	get_tree().quit()


func _wait_for_live_test_troop(timeout_seconds: float) -> Node:
	var elapsed := 0.0
	while elapsed < timeout_seconds:
		await get_tree().process_frame
		for candidate in get_tree().get_nodes_in_group("troops"):
			if BaseTroop.is_live_troop(candidate):
				return candidate
		elapsed += get_process_delta_time()
	return null


func _verify_hold_deployment() -> void:
	var bs: Node = get_node_or_null("../BuildingSystem")
	var attack: Node = get_node_or_null("../AttackSystem")
	if bs == null or attack == null:
		push_error("Hold deployment test failed: combat systems are missing.")
		get_tree().quit(1)
		return
	attack.cleanup_combat_nodes()
	await get_tree().process_frame
	attack._manual_deployment_mode = true
	attack._main_ship_ready_for_deployment = true
	attack.is_attack_mode = true
	attack._manual_deploy_index = 0
	attack._fleet = [{"level": 1, "troops": ["Mage", "Mage", "Mage", "Mage", "Mage", "Archer", "Archer"]}]
	attack._army_entries.clear()
	for _i in 5:
		attack._army_entries.append("Mage")
	for _i in 2:
		attack._army_entries.append("Archer")
	attack._rebuild_army_groups()
	attack._selected_group_idx = 0
	var deploy_at: Vector3 = attack.plane_center
	deploy_at.y = float(bs.grid_y)
	var selected_key: String = attack._selected_troop_group_key()
	if selected_key != "Mage" or not attack._try_deploy_selected_troop(deploy_at):
		push_error("Hold deployment test failed: initial Mage deployment was rejected.")
		get_tree().quit(1)
		return
	attack._start_hold_deployment(deploy_at, selected_key)
	for _i in 24:
		attack._advance_hold_deployment(0.05)
	attack._stop_hold_deployment()
	for _i in 4:
		await get_tree().process_frame

	var remaining_types: Array[String] = []
	for entry in attack._army_entries:
		remaining_types.append(attack._normalize_troop_entry(entry))
	var deployed_before_release: int = attack._manual_deploy_index
	attack._advance_hold_deployment(1.0)
	await get_tree().process_frame
	var live_troops: int = 0
	for candidate in get_tree().get_nodes_in_group("troops"):
		if BaseTroop.is_live_troop(candidate):
			live_troops += 1
	var passed: bool = (
		deployed_before_release == 5
		and attack._manual_deploy_index == deployed_before_release
		and remaining_types == ["Archer", "Archer"]
		and live_troops == 5
		and not attack._hold_deploy_active
	)
	attack.cleanup_combat_nodes()
	await get_tree().process_frame
	await get_tree().process_frame
	if not passed:
		push_error(
			"Hold deployment test failed "
			+ "(deployed=%d remaining=%s live=%d hold_active=%s)." % [
				deployed_before_release,
				remaining_types,
				live_troops,
				attack._hold_deploy_active,
			]
		)
		get_tree().quit(1)
		return
	print("[HOLD_DEPLOYMENT_TEST] PASS deployed=5 remaining_archers=2 release_stopped=true")
	get_tree().quit()


func _verify_stale_warmup_await() -> void:
	await get_tree().process_frame
	var scene := get_tree().current_scene
	var building_system := scene.get_node_or_null("BuildingSystem") if scene else null
	var battle: BSBattle = building_system.get("_battle") if building_system else null
	if battle == null:
		push_error("Stale warmup test failed: BSBattle is missing.")
		get_tree().quit(1)
		return
	var stale_warmup: Node = Node.new()
	building_system.add_child(stale_warmup)
	stale_warmup.queue_free()
	await get_tree().process_frame
	await battle._await_hidden_combat_warmup(stale_warmup, 0.01)
	print("[STALE_WARMUP_TEST] PASS freed_object_was_ignored=true")
	get_tree().quit()


func _verify_cloud_warmup_barrier() -> void:
	await get_tree().process_frame
	var scene := get_tree().current_scene
	var building_system := scene.get_node_or_null("BuildingSystem") if scene else null
	var battle: BSBattle = building_system.get("_battle") if building_system else null
	if battle == null:
		push_error("Cloud warmup barrier test failed: BSBattle is missing.")
		get_tree().quit(1)
		return
	var started_ticks := Time.get_ticks_msec()
	var warmup: Node = battle._start_hidden_combat_warmup()
	var completed: bool = await battle._finish_hidden_combat_warmup_under_cloud(
		warmup,
		"test_cloud_cover",
		started_ticks
	)
	if not completed or not battle._is_hidden_combat_warmup_ready():
		push_error("Cloud warmup barrier test failed: combat warmup remained incomplete.")
		get_tree().quit(1)
		return
	print(
		"[CLOUD_WARMUP_BARRIER_TEST] PASS completed=true elapsed_ms=",
		Time.get_ticks_msec() - started_ticks
	)
	get_tree().quit()


func _verify_camera_safety() -> void:
	await get_tree().process_frame
	await get_tree().physics_frame
	var scene := get_tree().current_scene
	var rig := scene.get_node_or_null("CameraRig") if scene else null
	if rig == null:
		push_error("Camera safety test failed: CameraRig is missing.")
		get_tree().quit(1)
		return
	var pivot := rig.get_node_or_null("PitchPivot") as Node3D
	var camera := pivot.get_node_or_null("Camera3D") as Camera3D if pivot else null
	if camera == null or camera.get_parent() != pivot:
		push_error("Camera safety test failed: Camera3D must be attached directly to PitchPivot.")
		get_tree().quit(1)
		return

	rig.set_process(false)
	var pan_min: Vector3 = rig.get("pan_limit_min")
	var pan_max: Vector3 = rig.get("pan_limit_max")
	var safe_min_zoom: float = float(rig.call("_effective_min_zoom"))
	var max_camera_zoom: float = float(rig.get("max_zoom"))
	var minimum_height: float = float(rig.get("minimum_camera_height"))
	var positions: Array[Vector3] = [
		Vector3(pan_min.x, 0.0, pan_min.z),
		Vector3(pan_min.x, 0.0, pan_max.z),
		Vector3(pan_max.x, 0.0, pan_min.z),
		Vector3(pan_max.x, 0.0, pan_max.z),
	]
	var checks := 0
	for zoom in [safe_min_zoom, max_camera_zoom]:
		for target_position in positions:
			rig.global_position = target_position
			rig.set("_target_position", target_position)
			rig.set("_target_zoom", zoom)
			rig.set("_current_zoom", zoom)
			rig.call("_apply_zoom_distance")
			await get_tree().process_frame
			var actual_distance := camera.global_position.distance_to(rig.global_position)
			if camera.global_position.y < minimum_height - 0.001:
				push_error("Camera safety test failed: height %.3f is below %.3f." % [camera.global_position.y, minimum_height])
				get_tree().quit(1)
				return
			if not is_equal_approx(actual_distance, zoom):
				push_error("Camera safety test failed: boom distance %.3f does not match zoom %.3f." % [actual_distance, zoom])
				get_tree().quit(1)
				return
			checks += 1

	# Cross the full allowed area while zooming in and assert that no frame jumps.
	rig.global_position = positions[0]
	rig.set("_target_position", positions[3])
	rig.set("_current_zoom", max_camera_zoom)
	rig.set("_target_zoom", safe_min_zoom)
	rig.call("_apply_zoom_distance")
	var previous_camera_position := camera.global_position
	var largest_frame_step := 0.0
	for frame in range(120):
		rig.call("_process", 1.0 / 60.0)
		var frame_step := camera.global_position.distance_to(previous_camera_position)
		largest_frame_step = maxf(largest_frame_step, frame_step)
		if frame_step > 1.0:
			push_error("Camera safety test failed: frame %d jumped %.3f world units." % [frame, frame_step])
			get_tree().quit(1)
			return
		if camera.global_position.y < minimum_height - 0.001:
			push_error("Camera safety test failed: transition frame %d dropped below minimum height." % frame)
			get_tree().quit(1)
			return
		previous_camera_position = camera.global_position

	# Capture the most zoomed-in corner, where the old SpringArm guard collapsed.
	rig.global_position = positions[3]
	rig.set("_target_position", positions[3])
	rig.set("_current_zoom", safe_min_zoom)
	rig.set("_target_zoom", safe_min_zoom)
	rig.call("_apply_zoom_distance")
	if _panel:
		_panel.visible = false
	await get_tree().process_frame
	await get_tree().process_frame
	var output_path := "user://camera-safety.png"
	for text in OS.get_cmdline_user_args():
		if text.begins_with("--camera-capture-out="):
			output_path = text.trim_prefix("--camera-capture-out=")
	var err := get_viewport().get_texture().get_image().save_png(output_path)
	if err != OK:
		push_error("Camera safety capture failed: %s" % error_string(err))
		get_tree().quit(1)
		return
	print("[CAMERA_SAFETY_TEST] PASS checks=%d min_zoom=%.3f min_height=%.3f max_frame_step=%.3f capture=%s" % [checks, safe_min_zoom, minimum_height, largest_frame_step, output_path])
	get_tree().quit()


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	match key.keycode:
		KEY_F1:
			_panel.visible = not _panel.visible
			get_viewport().set_input_as_handled()
		KEY_1:
			build_working_village()
			get_viewport().set_input_as_handled()
		KEY_2:
			reset_sandbox()
			get_viewport().set_input_as_handled()
		KEY_3:
			toggle_music()
			get_viewport().set_input_as_handled()
		KEY_RIGHT, KEY_UP:
			change_test_speed(TEST_SPEED_STEP)
			get_viewport().set_input_as_handled()
		KEY_LEFT, KEY_DOWN:
			change_test_speed(-TEST_SPEED_STEP)
			get_viewport().set_input_as_handled()
		KEY_D:
			if key.ctrl_pressed:
				duplicate_selected_building()
				get_viewport().set_input_as_handled()


func _create_panel() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "TestHarnessCanvas"
	canvas.layer = 50
	add_child(canvas)

	_panel = PanelContainer.new()
	_panel.name = "TestHarnessPanel"
	_panel.anchor_left = 0.0
	_panel.anchor_top = 0.0
	_panel.anchor_right = 0.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = 8
	_panel.offset_top = 8
	_panel.offset_right = 392
	_panel.offset_bottom = -8
	canvas.add_child(_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	_panel.add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)

	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 9)
	scroll.add_child(vbox)

	var title := Label.new()
	title.text = "Scene Tools"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 20)
	vbox.add_child(title)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.text = "Ready"
	_status.add_theme_font_size_override("font_size", 16)
	vbox.add_child(_status)

	_add_water_lab_controls(vbox)

	var max_label := Label.new()
	max_label.text = "Max Village by Town Hall"
	max_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(max_label)

	var max_row := HBoxContainer.new()
	max_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	max_row.add_theme_constant_override("separation", 6)
	vbox.add_child(max_row)
	for th_level in range(1, _max_supported_town_hall_level() + 1):
		var btn := Button.new()
		btn.text = str(th_level)
		btn.custom_minimum_size = Vector2(42, 38)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 16)
		btn.tooltip_text = "Build max TH%d village" % th_level
		btn.pressed.connect(Callable(self, "build_max_village_for_town_hall").bind(th_level))
		max_row.add_child(btn)

	_add_attack_loadout_controls(vbox)
	_add_speed_controls(vbox)
	_add_model_scale_controls(vbox)
	vbox.add_child(_button("Demon King Color Test", spawn_demon_king_color_test))

	var spawn_label := Label.new()
	spawn_label.text = "Spawn Any Building"
	spawn_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(spawn_label)

	_spawn_list = VBoxContainer.new()
	_spawn_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_spawn_list.add_theme_constant_override("separation", 8)
	vbox.add_child(_spawn_list)

	vbox.add_child(_button("Ctrl+D Duplicate Selected", duplicate_selected_building))

	vbox.add_child(_button("1. Build Random Village", build_working_village))
	vbox.add_child(_button("2. Clear All Buildings", reset_sandbox))
	vbox.add_child(_button("3. Toggle Music", toggle_music))

	var hint := Label.new()
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.text = "Hotkeys: F1 panel, 1 build random village, 2 clear all, 3 toggle music, arrows speed."
	hint.add_theme_font_size_override("font_size", 15)
	vbox.add_child(hint)


func _add_water_lab_controls(parent: VBoxContainer) -> void:
	var separator := HSeparator.new()
	parent.add_child(separator)

	var heading := Label.new()
	heading.text = "Water Lab"
	heading.add_theme_font_size_override("font_size", 17)
	parent.add_child(heading)

	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 6)
	parent.add_child(row)
	for variant in WATER_VARIANTS:
		var key := str(variant.get("key", "quality"))
		var button := Button.new()
		button.text = str(variant.get("label", key.capitalize()))
		button.custom_minimum_size = Vector2(0, 38)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.tooltip_text = str(variant.get("description", ""))
		button.pressed.connect(
			Callable(self, "_apply_water_variant").bind(key)
		)
		row.add_child(button)

	_water_variant_label = Label.new()
	_water_variant_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_water_variant_label.text = "Quality: current production water"
	_water_variant_label.add_theme_font_size_override("font_size", 14)
	parent.add_child(_water_variant_label)

	_water_fps_label = Label.new()
	_water_fps_label.text = "Live FPS: warming up"
	_water_fps_label.add_theme_font_size_override("font_size", 14)
	parent.add_child(_water_fps_label)

	var note := Label.new()
	note.text = "The production material is unchanged. These buttons affect TestMain only."
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.add_theme_font_size_override("font_size", 13)
	parent.add_child(note)


func _water_node() -> MeshInstance3D:
	var scene := get_tree().current_scene
	if scene == null:
		return null
	return scene.get_node_or_null("Water") as MeshInstance3D


func _water_variant_definition(key: String) -> Dictionary:
	for variant in WATER_VARIANTS:
		if str(variant.get("key", "")) == key:
			return variant
	return WATER_VARIANTS[0]


func _apply_water_variant(key: String) -> void:
	var water := _water_node()
	if not is_instance_valid(water):
		_set_status("Water Lab: Water node is missing.")
		return
	var variant := _water_variant_definition(key)
	var material_path := str(variant.get("material_path", ""))
	var source_material := (
		ResourceLoader.load(material_path, "Material") as Material
		if not material_path.is_empty()
		else null
	)
	if source_material == null:
		_set_status("Water Lab: %s material is missing." % key)
		return
	water.material_override = source_material.duplicate(true)
	_water_variant_key = str(variant.get("key", key))
	_water_fps_elapsed = 0.0
	_water_fps_min = INF
	_water_fps_max = 0.0
	if is_instance_valid(_water_variant_label):
		_water_variant_label.text = "%s: %s" % [
			str(variant.get("label", key.capitalize())),
			str(variant.get("description", "")),
		]
	_set_status("Water Lab: %s selected." % str(variant.get("label", key)))
	print(
		"[WATER_LAB] selected key=",
		_water_variant_key,
		" material=",
		source_material.resource_path
	)


func _update_water_lab_fps(delta: float) -> void:
	if not is_instance_valid(_water_fps_label):
		return
	_water_fps_elapsed += delta
	var fps := float(Engine.get_frames_per_second())
	if fps > 0.0:
		_water_fps_min = minf(_water_fps_min, fps)
		_water_fps_max = maxf(_water_fps_max, fps)
	if _water_fps_elapsed < 0.5:
		return
	_water_fps_elapsed = 0.0
	var min_text := "--" if is_inf(_water_fps_min) else str(roundi(_water_fps_min))
	_water_fps_label.text = "Live FPS: %d | observed %s-%d" % [
		roundi(fps),
		min_text,
		roundi(_water_fps_max),
	]


func _button(text: String, callback: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(0, 44)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.add_theme_font_size_override("font_size", 17)
	btn.add_theme_constant_override("content_margin_left", 12)
	btn.add_theme_constant_override("content_margin_right", 12)
	btn.add_theme_constant_override("content_margin_top", 8)
	btn.add_theme_constant_override("content_margin_bottom", 8)
	btn.pressed.connect(callback)
	return btn


func _small_button(text: String, callback: Callable) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(34, 34)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.add_theme_font_size_override("font_size", 15)
	btn.pressed.connect(callback)
	return btn


func _create_test_ship_ability_hud() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "TestShipAbilityCanvas"
	canvas.layer = 45
	add_child(canvas)

	_test_ship_ability_hud = PanelContainer.new()
	_test_ship_ability_hud.name = "TestShipAbilityHUD"
	_test_ship_ability_hud.anchor_left = 0.24
	_test_ship_ability_hud.anchor_top = 1.0
	_test_ship_ability_hud.anchor_right = 0.98
	_test_ship_ability_hud.anchor_bottom = 1.0
	_test_ship_ability_hud.offset_top = -106.0
	_test_ship_ability_hud.offset_bottom = -10.0
	_test_ship_ability_hud.grow_horizontal = Control.GROW_DIRECTION_BOTH
	canvas.add_child(_test_ship_ability_hud)

	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.07, 0.09, 0.13, 0.94)
	panel_style.border_color = Color(0.35, 0.43, 0.58, 0.95)
	panel_style.set_border_width_all(2)
	panel_style.corner_radius_top_left = 12
	panel_style.corner_radius_top_right = 12
	panel_style.corner_radius_bottom_left = 12
	panel_style.corner_radius_bottom_right = 12
	_test_ship_ability_hud.add_theme_stylebox_override("panel", panel_style)

	var outer_margin := MarginContainer.new()
	outer_margin.add_theme_constant_override("margin_left", 10)
	outer_margin.add_theme_constant_override("margin_top", 8)
	outer_margin.add_theme_constant_override("margin_right", 10)
	outer_margin.add_theme_constant_override("margin_bottom", 8)
	_test_ship_ability_hud.add_child(outer_margin)

	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	outer_margin.add_child(row)

	var energy_box := VBoxContainer.new()
	energy_box.custom_minimum_size = Vector2(116, 0)
	energy_box.alignment = BoxContainer.ALIGNMENT_CENTER
	energy_box.add_theme_constant_override("separation", 2)
	row.add_child(energy_box)

	var energy_title := Label.new()
	energy_title.text = "MAIN SHIP"
	energy_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	energy_title.add_theme_font_size_override("font_size", 12)
	energy_title.add_theme_color_override("font_color", Color(0.63, 0.73, 0.91))
	energy_box.add_child(energy_title)

	_test_ship_energy_label = Label.new()
	_test_ship_energy_label.text = "Energy: --"
	_test_ship_energy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_test_ship_energy_label.add_theme_font_size_override("font_size", 18)
	_test_ship_energy_label.add_theme_color_override("font_color", Color(1.0, 0.62, 0.18))
	energy_box.add_child(_test_ship_energy_label)

	_test_ship_ability_hint = Label.new()
	_test_ship_ability_hint.text = "Start Attack"
	_test_ship_ability_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_test_ship_ability_hint.add_theme_font_size_override("font_size", 11)
	_test_ship_ability_hint.add_theme_color_override("font_color", Color(0.74, 0.77, 0.84))
	energy_box.add_child(_test_ship_ability_hint)

	var ability_scroll := ScrollContainer.new()
	ability_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ability_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ability_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	ability_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	row.add_child(ability_scroll)

	var abilities := HBoxContainer.new()
	abilities.name = "AbilityButtons"
	abilities.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	abilities.size_flags_vertical = Control.SIZE_EXPAND_FILL
	abilities.add_theme_constant_override("separation", 6)
	ability_scroll.add_child(abilities)

	for ability_key in TEST_SHIP_ABILITY_ORDER:
		var button := Button.new()
		button.name = "%sButton" % ability_key.to_pascal_case()
		button.custom_minimum_size = Vector2(88, 68)
		button.toggle_mode = true
		button.add_theme_font_size_override("font_size", 14)
		button.text = TEST_SHIP_ABILITY_LABELS.get(ability_key, ability_key)
		button.pressed.connect(
			Callable(self, "_toggle_test_ship_ability").bind(ability_key)
		)
		abilities.add_child(button)
		_test_ship_ability_buttons[ability_key] = button

	var utility_box := VBoxContainer.new()
	utility_box.custom_minimum_size = Vector2(78, 0)
	utility_box.alignment = BoxContainer.ALIGNMENT_CENTER
	utility_box.add_theme_constant_override("separation", 4)
	row.add_child(utility_box)
	var refill_button := _small_button("Refill", refill_test_ship_energy)
	refill_button.tooltip_text = "Restore energy without resetting escalating ability costs."
	utility_box.add_child(refill_button)
	var reset_button := _small_button("Reset", reset_test_ship_abilities)
	reset_button.tooltip_text = "Restore energy and every escalating ability cost."
	utility_box.add_child(reset_button)

	_refresh_test_ship_ability_hud()


func _test_combat_building_system() -> Node:
	var main_bs: Node = _building_system_for_grid("main")
	if main_bs:
		return main_bs
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		var bs: Node = raw_bs
		if bs and bool(bs.get("create_ui")):
			return bs
	return null


func _test_attack_is_ready() -> bool:
	var attack: Node = get_node_or_null("../AttackSystem")
	var bs: Node = _test_combat_building_system()
	return (
		is_instance_valid(attack)
		and bool(attack.get("_main_ship_ready_for_deployment"))
		and bool(attack.get("is_attack_mode"))
		and is_instance_valid(bs)
		and bool(bs.get("is_viewing_enemy"))
	)


func _test_ship_ability_state(ability_key: String) -> Dictionary:
	var bs: Node = _test_combat_building_system()
	if not is_instance_valid(bs) or bs.get("_cannon") == null:
		return {
			"cost": 0,
			"active": false,
			"unlocked": false,
		}
	var cannon: BSCannon = bs.get("_cannon")
	match ability_key:
		"cannon":
			return {
				"cost": cannon._cannon_next_cost,
				"active": cannon._ship_cannon_mode,
				"unlocked": true,
			}
		"rally":
			var rally: BSRally = bs.get("_rally")
			return {
				"cost": rally._rally_next_cost if rally else 1,
				"active": rally._rally_mode if rally else false,
				"unlocked": rally != null,
			}
		"medkit":
			var medkit: BSMedkit = bs.get("_medkit")
			return {
				"cost": medkit.energy_cost() if medkit else 6,
				"active": medkit._medkit_mode if medkit else false,
				"unlocked": medkit.is_unlocked() if medkit else false,
			}
		"freeze":
			var freeze: BSFreezeSpell = bs.get("_freeze")
			return {
				"cost": freeze.energy_cost() if freeze else 5,
				"active": freeze._freeze_mode if freeze else false,
				"unlocked": freeze.is_unlocked() if freeze else false,
			}
		"rage":
			var rage: BSRageSpell = bs.get("_rage")
			return {
				"cost": rage.energy_cost() if rage else 7,
				"active": rage._rage_mode if rage else false,
				"unlocked": rage.is_unlocked() if rage else false,
			}
		"skeleton_barrel":
			var barrel: BSSkeletonBarrel = bs.get("_skeleton_barrel")
			return {
				"cost": barrel.energy_cost() if barrel else 8,
				"active": barrel._barrel_mode if barrel else false,
				"unlocked": barrel.is_unlocked() if barrel else false,
			}
	return {
		"cost": 0,
		"active": false,
		"unlocked": false,
	}


func _refresh_test_ship_ability_hud() -> void:
	if not is_instance_valid(_test_ship_ability_hud):
		return
	var bs: Node = _test_combat_building_system()
	var attack_ready := _test_attack_is_ready()
	var energy := 0
	var max_energy := _ship_energy_for_level(_test_attack_ship_level)
	if is_instance_valid(bs) and bs.get("_cannon") != null:
		var cannon: BSCannon = bs.get("_cannon")
		energy = cannon._cannon_energy
	if is_instance_valid(_test_ship_energy_label):
		_test_ship_energy_label.text = "Energy: %d / %d" % [energy, max_energy]
	if is_instance_valid(_test_ship_ability_hint):
		if attack_ready:
			_test_ship_ability_hint.text = "Choose, then click target"
		else:
			_test_ship_ability_hint.text = "Start Attack"

	for ability_key in TEST_SHIP_ABILITY_ORDER:
		var button: Button = _test_ship_ability_buttons.get(ability_key, null)
		if not is_instance_valid(button):
			continue
		var state := _test_ship_ability_state(ability_key)
		var cost := int(state.get("cost", 0))
		var active := bool(state.get("active", false))
		var unlocked := bool(state.get("unlocked", false))
		var disabled := (
			not attack_ready
			or not unlocked
			or (not active and energy < cost)
		)
		button.disabled = disabled
		button.text = "%s\n%d energy" % [
			TEST_SHIP_ABILITY_LABELS.get(ability_key, ability_key),
			cost,
		]
		if active:
			button.text = "%s\nCANCEL" % TEST_SHIP_ABILITY_LABELS.get(
				ability_key,
				ability_key
			)
		elif not unlocked:
			button.text = "%s\nLOCKED" % TEST_SHIP_ABILITY_LABELS.get(
				ability_key,
				ability_key
			)
		button.button_pressed = active
		button.tooltip_text = _test_ship_ability_tooltip(
			ability_key,
			cost,
			active,
			unlocked,
			attack_ready
		)


func _test_ship_ability_tooltip(
	ability_key: String,
	cost: int,
	active: bool,
	unlocked: bool,
	attack_ready: bool
) -> String:
	if not attack_ready:
		return "Start a test attack and wait for the Main Ship."
	if not unlocked:
		return "Requires Main Ship level 6."
	if active:
		return "Cancel target selection."
	var descriptions := {
		"cannon": "Fire at a selected building.",
		"rally": "Redirect deployed troops toward a selected area.",
		"medkit": "Place a healing field for deployed troops.",
		"freeze": "Freeze defenses in the selected area.",
		"rage": "Boost troops inside the selected area.",
		"skeleton_barrel": "Damage a building and deploy four skeletons.",
	}
	return "%s Cost: %d energy." % [
		descriptions.get(ability_key, "Use Main Ship ability."),
		cost,
	]


func _toggle_test_ship_ability(ability_key: String) -> void:
	if not _test_attack_is_ready():
		_set_status("Start Attack and wait for the Main Ship before using abilities.")
		return
	var bs: Node = _test_combat_building_system()
	if not is_instance_valid(bs):
		return
	match ability_key:
		"cannon":
			if bool(bs.get("_ship_cannon_mode")):
				bs.call("_exit_ship_cannon_mode")
			else:
				bs.call("_enter_ship_cannon_mode")
		"rally":
			if bool(bs.get("_ship_rally_mode")):
				bs.call("_exit_ship_rally_mode")
			else:
				bs.call("_enter_ship_rally_mode")
		"medkit":
			if bool(bs.get("_ship_medkit_mode")):
				bs.call("_exit_ship_medkit_mode")
			else:
				bs.call("_enter_ship_medkit_mode")
		"freeze":
			if bool(bs.get("_ship_freeze_mode")):
				bs.call("_exit_ship_freeze_mode")
			else:
				bs.call("_enter_ship_freeze_mode")
		"rage":
			if bool(bs.get("_ship_rage_mode")):
				bs.call("_exit_ship_rage_mode")
			else:
				bs.call("_enter_ship_rage_mode")
		"skeleton_barrel":
			if bool(bs.get("_ship_skeleton_barrel_mode")):
				bs.call("_exit_ship_skeleton_barrel_mode")
			else:
				bs.call("_enter_ship_skeleton_barrel_mode")
	_set_status("%s selected. Click its target in the battle area." % (
		TEST_SHIP_ABILITY_LABELS.get(ability_key, ability_key)
	))
	_refresh_test_ship_ability_hud()


func refill_test_ship_energy() -> void:
	var bs: Node = _test_combat_building_system()
	if not is_instance_valid(bs) or bs.get("_cannon") == null:
		_set_status("Main Ship combat system is not ready.")
		return
	var cannon: BSCannon = bs.get("_cannon")
	cannon._cannon_energy = _ship_energy_for_level(_test_attack_ship_level)
	cannon._update_cannon_energy_ui()
	_refresh_test_ship_ability_hud()
	_set_status("Main Ship energy refilled.")


func reset_test_ship_abilities(report_status: bool = true) -> void:
	var bs: Node = _test_combat_building_system()
	if not is_instance_valid(bs):
		return
	var ship_level := clampi(_test_attack_ship_level, 1, _max_test_ship_level())
	var cannon: BSCannon = bs.get("_cannon")
	var rally: BSRally = bs.get("_rally")
	var medkit: BSMedkit = bs.get("_medkit")
	var freeze: BSFreezeSpell = bs.get("_freeze")
	var rage: BSRageSpell = bs.get("_rage")
	var barrel: BSSkeletonBarrel = bs.get("_skeleton_barrel")
	if cannon:
		cannon.reset(ship_level)
	if rally:
		rally.reset()
	if medkit:
		medkit.reset(ship_level)
	if freeze:
		freeze.reset(ship_level)
	if rage:
		rage.reset(ship_level)
	if barrel:
		barrel.reset(ship_level)
	_refresh_test_ship_ability_hud()
	if report_status:
		_set_status("Main Ship energy and abilities reset.")


func _ship_energy_for_level(ship_level: int) -> int:
	var normalized_level := clampi(ship_level, 1, _max_test_ship_level())
	return int(BuildingSystem.PLAYER_SHIP_LEVELS.get(
		normalized_level,
		{}
	).get("energy", 4))


func _add_attack_loadout_controls(vbox: VBoxContainer) -> void:
	var attack_label := Label.new()
	attack_label.text = "Test Attack Loadout"
	attack_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(attack_label)

	var ship_row := HBoxContainer.new()
	ship_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ship_row.add_theme_constant_override("separation", 5)
	vbox.add_child(ship_row)

	var ship_label := Label.new()
	ship_label.text = "Main Ship"
	ship_label.custom_minimum_size = Vector2(96, 32)
	ship_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	ship_label.add_theme_font_size_override("font_size", 14)
	ship_row.add_child(ship_label)

	_test_attack_ship_level = _max_test_ship_level()
	ship_row.add_child(_small_button("L-", Callable(self, "_change_test_ship_level").bind(-1)))
	_test_ship_level_label = Label.new()
	_test_ship_level_label.custom_minimum_size = Vector2(42, 32)
	_test_ship_level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_test_ship_level_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_test_ship_level_label.add_theme_font_size_override("font_size", 14)
	ship_row.add_child(_test_ship_level_label)
	ship_row.add_child(_small_button("L+", Callable(self, "_change_test_ship_level").bind(1)))

	_test_ship_capacity_label = Label.new()
	_test_ship_capacity_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_test_ship_capacity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_test_ship_capacity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_test_ship_capacity_label.add_theme_font_size_override("font_size", 14)
	ship_row.add_child(_test_ship_capacity_label)

	_attack_loadout_box = VBoxContainer.new()
	_attack_loadout_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_attack_loadout_box.add_theme_constant_override("separation", 5)
	vbox.add_child(_attack_loadout_box)
	call_deferred("_populate_attack_loadout_rows")

	var presets := HBoxContainer.new()
	presets.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	presets.add_theme_constant_override("separation", 6)
	vbox.add_child(presets)
	presets.add_child(_small_button("Clear", clear_test_attack_loadout))
	presets.add_child(_small_button("Mixed x1", mixed_test_attack_loadout))
	presets.add_child(_small_button("Load Ship", load_test_attack_army))
	presets.add_child(_small_button("Attack", start_test_attack))
	presets.add_child(_small_button("FPS Test", run_mixed_fps_profile))
	_refresh_test_ship_row()


func _populate_attack_loadout_rows() -> void:
	if not _attack_loadout_box:
		return
	var troops: Array[String] = _test_attack_troops()
	if troops.is_empty():
		call_deferred("_populate_attack_loadout_rows")
		return
	for child in _attack_loadout_box.get_children():
		child.queue_free()
	_attack_count_labels.clear()
	_attack_level_labels.clear()

	for troop_name in troops:
		_attack_counts[troop_name] = int(_attack_counts.get(troop_name, 0))
		_attack_levels[troop_name] = int(_attack_levels.get(troop_name, _test_attack_max_level(troop_name)))
		var row := HBoxContainer.new()
		row.set_meta("troop_name", troop_name)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 4)
		_attack_loadout_box.add_child(row)

		var name_label := Label.new()
		name_label.text = _test_troop_display_name(troop_name)
		name_label.custom_minimum_size = Vector2(96, 32)
		name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		name_label.add_theme_font_size_override("font_size", 14)
		row.add_child(name_label)

		row.add_child(_small_button("-", Callable(self, "_change_attack_count").bind(troop_name, -1)))
		var count_label := Label.new()
		count_label.custom_minimum_size = Vector2(42, 32)
		count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		count_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		count_label.add_theme_font_size_override("font_size", 14)
		row.add_child(count_label)
		_attack_count_labels[troop_name] = count_label
		row.add_child(_small_button("+", Callable(self, "_change_attack_count").bind(troop_name, 1)))

		row.add_child(_small_button("L-", Callable(self, "_change_attack_level").bind(troop_name, -1)))
		var level_label := Label.new()
		level_label.custom_minimum_size = Vector2(42, 32)
		level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		level_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		level_label.add_theme_font_size_override("font_size", 14)
		row.add_child(level_label)
		_attack_level_labels[troop_name] = level_label
		row.add_child(_small_button("L+", Callable(self, "_change_attack_level").bind(troop_name, 1)))
		_refresh_attack_row(troop_name)
	_refresh_test_ship_row()


func _add_speed_controls(vbox: VBoxContainer) -> void:
	var speed_label := Label.new()
	speed_label.text = "Test Game Speed"
	speed_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(speed_label)

	var speed_row := HBoxContainer.new()
	speed_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	speed_row.add_theme_constant_override("separation", 6)
	vbox.add_child(speed_row)

	speed_row.add_child(_small_button("-", Callable(self, "change_test_speed").bind(-TEST_SPEED_STEP)))
	_speed_label = Label.new()
	_speed_label.custom_minimum_size = Vector2(62, 34)
	_speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_speed_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_speed_label.add_theme_font_size_override("font_size", 15)
	speed_row.add_child(_speed_label)
	speed_row.add_child(_small_button("+", Callable(self, "change_test_speed").bind(TEST_SPEED_STEP)))

	var presets_row := HBoxContainer.new()
	presets_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	presets_row.add_theme_constant_override("separation", 6)
	vbox.add_child(presets_row)
	for speed in TEST_SPEED_PRESETS:
		presets_row.add_child(_small_button(_format_test_speed(speed), Callable(self, "set_test_speed").bind(speed)))
	_refresh_test_speed_label()


func _add_model_scale_controls(vbox: VBoxContainer) -> void:
	var scale_label := Label.new()
	scale_label.text = "Model Scale Overrides"
	scale_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(scale_label)

	var help := Label.new()
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.text = "Test scene only. 100% uses the current BuildingSystem scale. Move sliders down to shrink models."
	help.add_theme_font_size_override("font_size", 13)
	vbox.add_child(help)

	var actions := HBoxContainer.new()
	actions.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_theme_constant_override("separation", 6)
	vbox.add_child(actions)
	actions.add_child(_small_button("Reset", reset_model_scale_overrides))
	actions.add_child(_small_button("Print", print_model_scale_overrides))

	_model_scale_list = VBoxContainer.new()
	_model_scale_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_model_scale_list.add_theme_constant_override("separation", 8)
	vbox.add_child(_model_scale_list)
	call_deferred("_populate_model_scale_controls")


func _populate_model_scale_controls() -> void:
	if not _model_scale_list:
		return
	var main_bs: Node = _building_system_for_grid("main")
	if not main_bs:
		call_deferred("_populate_model_scale_controls")
		return
	for child in _model_scale_list.get_children():
		child.queue_free()
	_model_scale_labels.clear()
	_model_scale_sliders.clear()
	_model_scale_base_values.clear()
	_model_scale_multipliers.clear()

	var ids: Array[String] = _active_building_ids()

	for building_id in ids:
		var bs: Node = _building_system_for_building(building_id)
		if not bs or not ("building_defs" in bs) or not bs.building_defs.has(building_id):
			continue
		var def: Dictionary = bs.building_defs.get(building_id, {})
		if def.get("no_shop", false) or building_id == "flag":
			continue
		_add_model_scale_section(building_id, def)


func _add_model_scale_section(building_id: String, def: Dictionary) -> void:
	var section := VBoxContainer.new()
	section.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	section.add_theme_constant_override("separation", 4)
	_model_scale_list.add_child(section)

	var title := Label.new()
	title.text = String(def.get("name", building_id))
	title.add_theme_font_size_override("font_size", 15)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	section.add_child(title)

	var level_count: int = _visual_scale_level_count(def)
	for level in range(1, level_count + 1):
		_add_model_scale_row(section, building_id, level, def, level_count)


func _add_model_scale_row(parent: VBoxContainer, building_id: String, level: int, def: Dictionary, level_count: int) -> void:
	var base_scale: float = _base_model_scale_for_def(def, level)
	var key := _model_scale_key(building_id, level)
	_model_scale_base_values[key] = base_scale
	_model_scale_multipliers[key] = 1.0

	var row := VBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 2)
	parent.add_child(row)

	var label_row := HBoxContainer.new()
	label_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label_row.add_theme_constant_override("separation", 6)
	row.add_child(label_row)

	var value_label := Label.new()
	value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	value_label.add_theme_font_size_override("font_size", 13)
	label_row.add_child(value_label)
	_model_scale_labels[key] = value_label

	var reset_btn := Button.new()
	reset_btn.text = "100%"
	reset_btn.custom_minimum_size = Vector2(52, 28)
	reset_btn.add_theme_font_size_override("font_size", 12)
	reset_btn.pressed.connect(Callable(self, "set_model_scale_multiplier").bind(building_id, level, 1.0))
	label_row.add_child(reset_btn)

	var slider := HSlider.new()
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.min_value = MODEL_SCALE_MIN
	slider.max_value = MODEL_SCALE_MAX
	slider.step = MODEL_SCALE_STEP
	slider.value = 1.0
	slider.tooltip_text = "Multiplier for %s%s" % [String(def.get("name", building_id)), " L%d" % level if level_count > 1 else ""]
	slider.value_changed.connect(Callable(self, "_on_model_scale_slider_changed").bind(building_id, level))
	row.add_child(slider)
	_model_scale_sliders[key] = slider

	_refresh_model_scale_label(building_id, level)


func _on_model_scale_slider_changed(multiplier: float, building_id: String, level: int) -> void:
	set_model_scale_multiplier(building_id, level, multiplier)


func set_model_scale_multiplier(building_id: String, level: int, multiplier: float) -> void:
	var key := _model_scale_key(building_id, level)
	var clamped_multiplier: float = clampf(multiplier, MODEL_SCALE_MIN, MODEL_SCALE_MAX)
	_model_scale_multipliers[key] = clamped_multiplier
	var slider: HSlider = _model_scale_sliders.get(key, null)
	if slider and not is_equal_approx(float(slider.value), clamped_multiplier):
		slider.value = clamped_multiplier
	_apply_model_scale_overrides(building_id)
	_refresh_model_scale_label(building_id, level)


func reset_model_scale_overrides() -> void:
	for key in _model_scale_multipliers.keys():
		_model_scale_multipliers[key] = 1.0
	for building_id in _model_scale_building_ids():
		_apply_model_scale_overrides(building_id)
	for key in _model_scale_labels.keys():
		var parts := String(key).split(":")
		if parts.size() == 2:
			_refresh_model_scale_label(parts[0], int(parts[1]))
	_refresh_model_scale_sliders()
	_set_status("Model scale overrides reset to 100%.")


func print_model_scale_overrides() -> void:
	var lines: Array[String] = []
	for building_id in _model_scale_building_ids():
		var bs: Node = _building_system_for_building(building_id)
		if not bs or not ("building_defs" in bs) or not bs.building_defs.has(building_id):
			continue
		var def: Dictionary = bs.building_defs[building_id]
		var level_count: int = _visual_scale_level_count(def)
		if level_count <= 1:
			lines.append("%s model_scale=%.4f" % [building_id, _effective_model_scale(building_id, 1)])
			continue
		var values: Array[String] = []
		for level in range(1, level_count + 1):
			values.append("%.4f" % _effective_model_scale(building_id, level))
		lines.append("%s model_scales=[%s]" % [building_id, ", ".join(values)])
	print("[TestHarness] Model scale overrides:\n" + "\n".join(lines))
	_set_status("Printed current model scales to console.")


func _refresh_model_scale_sliders() -> void:
	for key in _model_scale_sliders.keys():
		var slider: HSlider = _model_scale_sliders.get(key, null)
		if slider:
			slider.value = float(_model_scale_multipliers.get(key, 1.0))


func _refresh_model_scale_label(building_id: String, level: int) -> void:
	var key := _model_scale_key(building_id, level)
	var label: Label = _model_scale_labels.get(key, null)
	if not label:
		return
	var base_scale: float = float(_model_scale_base_values.get(key, 0.2))
	var multiplier: float = float(_model_scale_multipliers.get(key, 1.0))
	var effective: float = base_scale * multiplier
	var prefix := "L%d " % level if _model_scale_has_multiple_levels(building_id) else ""
	label.text = "%s%.4f  (%d%% of %.4f)" % [prefix, effective, int(roundf(multiplier * 100.0)), base_scale]


func _apply_model_scale_overrides(building_id: String) -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not bs or not ("building_defs" in bs) or not bs.building_defs.has(building_id):
			continue
		var def: Dictionary = bs.building_defs[building_id]
		var level_count: int = _visual_scale_level_count(def)
		if level_count <= 1:
			def["model_scale"] = _effective_model_scale(building_id, 1)
			if def.has("model_scales"):
				def["model_scales"] = [_effective_model_scale(building_id, 1)]
		else:
			var scales: Array[float] = []
			for level in range(1, level_count + 1):
				scales.append(_effective_model_scale(building_id, level))
			def["model_scale"] = scales[0]
			def["model_scales"] = scales
		bs.building_defs[building_id] = def
		_apply_model_scale_to_placed_buildings(bs, building_id, def)


func _apply_model_scale_to_placed_buildings(bs: Node, building_id: String, def: Dictionary) -> void:
	if not bs or not ("placed_buildings" in bs):
		return
	for b in bs.placed_buildings:
		if String(b.get("id", "")) != building_id:
			continue
		var level: int = int(b.get("level", 1))
		var node: Node3D = b.get("node", null)
		if not is_instance_valid(node):
			continue
		var visual_model: Node3D = null
		if bs.has_method("_get_building_visual_model"):
			visual_model = bs._get_building_visual_model(node)
		if is_instance_valid(visual_model):
			var s := _effective_model_scale(building_id, level)
			visual_model.scale = Vector3(s, s, s)
		if "_building_aabb_cache" in bs and bs.has_method("_aabb_cache_key"):
			bs._building_aabb_cache.erase(bs._aabb_cache_key(building_id, level))
		if bs.has_method("_refresh_building_base_for_level"):
			bs._refresh_building_base_for_level(node, def, building_id, level)


func _model_scale_building_ids() -> Array[String]:
	var ids: Array[String] = []
	for key in _model_scale_base_values.keys():
		var parts := String(key).split(":")
		if parts.size() != 2:
			continue
		if not ids.has(parts[0]):
			ids.append(parts[0])
	return ids


func _effective_model_scale(building_id: String, level: int) -> float:
	var key := _model_scale_key(building_id, level)
	var base_scale: float = float(_model_scale_base_values.get(key, 0.2))
	var multiplier: float = float(_model_scale_multipliers.get(key, 1.0))
	return base_scale * multiplier


func _base_model_scale_for_def(def: Dictionary, level: int) -> float:
	var scales: Array = def.get("model_scales", [])
	if level >= 1 and scales.size() >= level:
		return float(scales[level - 1])
	return float(def.get("model_scale", 0.2))


func _visual_scale_level_count(def: Dictionary) -> int:
	var level_count: int = 1
	if def.has("scenes"):
		level_count = maxi(level_count, int(def.get("scenes", []).size()))
	if def.has("model_scales"):
		level_count = maxi(level_count, int(def.get("model_scales", []).size()))
	if def.has("model_offsets"):
		level_count = maxi(level_count, int(def.get("model_offsets", []).size()))
	return level_count


func _model_scale_has_multiple_levels(building_id: String) -> bool:
	var count: int = 0
	for key in _model_scale_base_values.keys():
		if String(key).begins_with(building_id + ":"):
			count += 1
			if count > 1:
				return true
	return false


func _model_scale_key(building_id: String, level: int) -> String:
	return "%s:%d" % [building_id, level]


func spawn_demon_king_color_test() -> void:
	_clear_demon_king_color_test()
	var scene_res: PackedScene = ResourceLoader.load("res://Model/Characters/Model/DemonKing_Body.fbx", "PackedScene")
	var script_res: Script = ResourceLoader.load("res://scripts/demon_king.gd", "Script")
	if scene_res == null or script_res == null:
		_set_status("Demon King color test failed: missing model or script.")
		return
	_demon_color_preview_root = Node3D.new()
	_demon_color_preview_root.name = "DemonKingColorPreview"
	var parent: Node = get_tree().current_scene if get_tree().current_scene else self
	parent.add_child(_demon_color_preview_root)
	for entry in DEMON_COLOR_TEST_VARIANTS:
		_spawn_demon_king_color_preview(scene_res, script_res, entry)
	_set_status("Spawned Demon King color preview: blue, purple, gold.")


func _clear_demon_king_color_test() -> void:
	if is_instance_valid(_demon_color_preview_root):
		_demon_color_preview_root.queue_free()
	_demon_color_preview_root = null


func _spawn_demon_king_color_preview(scene_res: PackedScene, script_res: Script, entry: Dictionary) -> void:
	var preview: Node3D = scene_res.instantiate() as Node3D
	if preview == null:
		return
	preview.name = "DemonKingPreview_%s" % String(entry.get("variant", "purple")).capitalize()
	preview.set_script(script_res)
	preview.set("level", 7)
	if preview.has_method("set_player_troop_levels"):
		preview.call("set_player_troop_levels", {"DemonKing": 7})
	if preview.has_method("set_tint_variant"):
		preview.call("set_tint_variant", String(entry.get("variant", "purple")))
	preview.position = entry.get("pos", Vector3.ZERO)
	preview.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	preview.scale = Vector3.ONE * 0.12
	_demon_color_preview_root.add_child(preview)
	if preview.has_method("set_tint_variant"):
		preview.call_deferred("set_tint_variant", String(entry.get("variant", "purple")))

	var label := Label3D.new()
	label.name = "Label_%s" % String(entry.get("variant", "purple")).capitalize()
	label.text = String(entry.get("label", "Variant"))
	label.position = entry.get("pos", Vector3.ZERO) + Vector3(0.0, 0.82, 0.0)
	label.rotation_degrees = Vector3(-35.0, 0.0, 0.0)
	label.font_size = 64
	label.pixel_size = 0.006
	label.modulate = entry.get("color", Color.WHITE)
	label.outline_size = 8
	label.outline_modulate = Color(0.0, 0.0, 0.0, 0.8)
	_demon_color_preview_root.add_child(label)


func _capture_demon_king_color_test() -> void:
	_hide_capture_scene_chrome()
	spawn_demon_king_color_test()
	_layout_demon_king_color_capture()
	_frame_demon_king_color_camera()
	await get_tree().create_timer(1.0).timeout
	await RenderingServer.frame_post_draw
	var output_path: String = "user://demon_king_color_preview.png"
	for arg in OS.get_cmdline_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			output_path = text.get_slice("=", 1)
	var image: Image = get_viewport().get_texture().get_image()
	var err: Error = image.save_png(output_path)
	if err == OK:
		print("[TestHarness] Demon King color capture saved: ", output_path)
	else:
		push_error("Demon King color capture failed: %s" % error_string(err))
	get_tree().quit()


func _capture_attack_grid_test() -> void:
	var scene := get_tree().current_scene
	var attack_plane: MeshInstance3D = null
	if scene:
		attack_plane = scene.get_node_or_null("Island/shipPlane") as MeshInstance3D
	if attack_plane == null:
		push_error("Attack grid capture failed: Island/shipPlane is missing.")
		get_tree().quit(1)
		return
	attack_plane.visible = true
	_frame_attack_grid_camera(attack_plane)
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false
	_hide_capture_canvas_items(scene)
	await get_tree().create_timer(1.5).timeout
	await RenderingServer.frame_post_draw
	var output_path: String = "user://attack_grid_preview.png"
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			output_path = text.get_slice("=", 1)
	var image: Image = get_viewport().get_texture().get_image()
	var err: Error = image.save_png(output_path)
	if err == OK:
		print("[TestHarness] Attack grid capture saved: ", output_path)
	else:
		push_error("Attack grid capture failed: %s" % error_string(err))
	get_tree().quit()


func _capture_tentacle_idle_test() -> void:
	var scene := get_tree().current_scene
	if scene == null:
		push_error("Tentacle idle capture failed: current scene is missing.")
		get_tree().quit(1)
		return

	var tentacles: Array[Node3D] = []
	for node in scene.find_children("AnimatedTentacle*", "Node3D", true, false):
		tentacles.append(node as Node3D)
	if tentacles.size() != 3:
		push_error("Tentacle idle capture failed: expected 3 animated tentacles, got %d." % tentacles.size())
		get_tree().quit(1)
		return

	var tracked_rotations: Array[Quaternion] = []
	for tentacle in tentacles:
		var player := tentacle.find_child("AnimationPlayer", true, false) as AnimationPlayer
		var skeleton := tentacle.find_child("Skeleton3D", true, false) as Skeleton3D
		if player == null or skeleton == null or not player.is_playing() or "idle" not in String(player.current_animation).to_lower():
			push_error("Tentacle idle capture failed: idle playback is inactive on %s." % tentacle.name)
			get_tree().quit(1)
			return
		var tracked_bone := skeleton.find_bone("Tentacle10")
		if tracked_bone < 0:
			push_error("Tentacle idle capture failed: Tentacle10 bone is missing on %s." % tentacle.name)
			get_tree().quit(1)
			return
		tracked_rotations.append(skeleton.get_bone_pose_rotation(tracked_bone))

	_hide_tentacle_capture_chrome(scene)
	await get_tree().create_timer(0.35).timeout
	var output_dir := _tentacle_capture_dir()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	if not await _save_tentacle_capture(output_dir.path_join("01-idle-a.png"), "idle-a"):
		get_tree().quit(1)
		return

	await get_tree().create_timer(1.15).timeout
	var changed_count := 0
	for tentacle_index in tentacles.size():
		var skeleton := tentacles[tentacle_index].find_child("Skeleton3D", true, false) as Skeleton3D
		var tracked_bone := skeleton.find_bone("Tentacle10")
		var current_rotation := skeleton.get_bone_pose_rotation(tracked_bone)
		if tracked_rotations[tentacle_index].angle_to(current_rotation) > 0.005:
			changed_count += 1
	if changed_count != tentacles.size():
		push_error("Tentacle idle capture failed: only %d/%d bone poses changed." % [changed_count, tentacles.size()])
		get_tree().quit(1)
		return

	if not await _save_tentacle_capture(output_dir.path_join("02-idle-b.png"), "idle-b"):
		get_tree().quit(1)
		return
	print("[TENTACLE_IDLE_TEST] PASS animated=%d changed=%d output=%s" % [tentacles.size(), changed_count, output_dir])
	get_tree().quit()


func _hide_tentacle_capture_chrome(scene: Node) -> void:
	_hide_capture_canvas_items(scene)
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false


func _tentacle_capture_dir() -> String:
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			return text.get_slice("=", 1)
	return "user://tentacle_idle"


func _save_tentacle_capture(path: String, label: String) -> bool:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var err := image.save_png(path)
	if err != OK:
		push_error("Tentacle idle capture %s failed: %s" % [label, error_string(err)])
		return false
	print("[TENTACLE_IDLE_TEST] capture=%s path=%s" % [label, path])
	return true


func _verify_main_ship_motion() -> void:
	var controller := get_node_or_null("../MainShipController")
	if controller == null:
		push_error("Main ship motion check failed: controller is missing.")
		get_tree().quit(1)
		return

	var ready_wait := 0.0
	while not controller.is_ready() and ready_wait < 2.0:
		await get_tree().process_frame
		ready_wait += get_process_delta_time()
	if not controller.is_ready():
		push_error("Main ship motion check failed: ship did not attach.")
		get_tree().quit(1)
		return

	controller.force_home()
	var ship_visual := controller.get("ship_visual") as Node3D
	var rest_transform: Transform3D = controller.get("_visual_rest_transform")
	if ship_visual == null:
		push_error("Main ship motion check failed: ship visual is missing.")
		get_tree().quit(1)
		return

	var rest_rotation := rest_transform.basis.orthonormalized().get_rotation_quaternion()
	var max_vertical_offset := 0.0
	var max_roll_angle := 0.0
	var elapsed := 0.0
	while elapsed < 3.0:
		await get_tree().process_frame
		elapsed += get_process_delta_time()
		max_vertical_offset = maxf(
			max_vertical_offset,
			absf(ship_visual.transform.origin.y - rest_transform.origin.y)
		)
		var current_rotation := ship_visual.transform.basis.orthonormalized().get_rotation_quaternion()
		max_roll_angle = maxf(max_roll_angle, rest_rotation.angle_to(current_rotation))

	var configured_bob := float(controller.get("bob_amplitude"))
	var configured_roll := float(controller.get("roll_degrees"))
	if configured_bob > 0.015 or configured_roll > 0.65:
		push_error(
			"Main ship motion check failed: configured motion is too strong (bob=%.4f roll=%.2f)."
			% [configured_bob, configured_roll]
		)
		get_tree().quit(1)
		return
	if max_vertical_offset > configured_bob + 0.002:
		push_error("Main ship motion check failed: observed bob %.4f exceeds configuration." % max_vertical_offset)
		get_tree().quit(1)
		return
	if rad_to_deg(max_roll_angle) > configured_roll + 0.1:
		push_error("Main ship motion check failed: observed roll %.2f exceeds configuration." % rad_to_deg(max_roll_angle))
		get_tree().quit(1)
		return
	if max_vertical_offset < configured_bob * 0.75 or rad_to_deg(max_roll_angle) < configured_roll * 0.75:
		push_error("Main ship motion check failed: wave motion did not complete a representative cycle.")
		get_tree().quit(1)
		return

	print(
		"[MAIN_SHIP_MOTION_TEST] PASS bob=%.4f roll_deg=%.2f speed_hz=%.2f"
		% [max_vertical_offset, rad_to_deg(max_roll_angle), float(controller.get("bob_speed"))]
	)
	get_tree().quit()


func _verify_main_ship_panel() -> void:
	await get_tree().process_frame
	var building_system := get_node_or_null("../BuildingSystem") as BuildingSystem
	if building_system == null:
		push_error("Main ship panel test failed: BuildingSystem is missing.")
		get_tree().quit(1)
		return
	await building_system._show_main_ship_panel()
	if str(building_system.selected_building.get("id", "")) != "main_ship":
		push_error("Main ship panel test failed: local ship was not selected.")
		get_tree().quit(1)
		return
	var snapshot: Dictionary = building_system._test_player_ship_snapshot()
	if int(snapshot.get("level", 0)) < 1 or int(snapshot.get("capacity", 0)) < snapshot.get("troops", []).size():
		push_error("Main ship panel test failed: local ship snapshot is invalid.")
		get_tree().quit(1)
		return
	print("[MAIN_SHIP_PANEL_TEST] PASS level=%d capacity=%d troops=%d net_required=false" % [
		int(snapshot.get("level", 0)),
		int(snapshot.get("capacity", 0)),
		snapshot.get("troops", []).size(),
	])
	var warmup := get_node_or_null("../Warmup")
	var wait_seconds := 0.0
	while warmup != null and warmup.visible and wait_seconds < 5.0:
		await get_tree().process_frame
		wait_seconds += get_process_delta_time()
	get_tree().quit()


func _verify_main_ship_flag_uv() -> void:
	var controller := get_node_or_null("../MainShipController")
	if controller == null:
		push_error("Main ship flag UV check failed: controller is missing.")
		get_tree().quit(1)
		return
	var ready_wait := 0.0
	while not controller.is_ready() and ready_wait < 2.0:
		await get_tree().process_frame
		ready_wait += get_process_delta_time()
	if not controller.is_ready():
		push_error("Main ship flag UV check failed: ship did not attach.")
		get_tree().quit(1)
		return
	var summary: Dictionary = controller.get_flag_uv_layout_summary()
	if int(summary.get("surface_count", 0)) < 1:
		push_error("Main ship flag UV check failed: ShipSail surface is missing.")
		get_tree().quit(1)
		return
	for surface_value in summary.get("surfaces", []):
		if not (surface_value is Dictionary):
			continue
		var surface := surface_value as Dictionary
		var uv_min: Vector2 = surface.get("min", Vector2.ZERO)
		var uv_max: Vector2 = surface.get("max", Vector2.ZERO)
		var span := uv_max - uv_min
		if span.x < 0.99 or span.y < 0.99:
			push_error("Main ship flag UV check failed: collapsed UV span %s." % span)
			get_tree().quit(1)
			return
	print("[MAIN_SHIP_FLAG_UV_TEST] PASS surfaces=%s" % summary.surface_count)
	get_tree().quit()


func _capture_main_ship_flag_orientation() -> void:
	await get_tree().process_frame
	var scene := get_tree().current_scene
	var controller := get_node_or_null("../MainShipController")
	if scene == null or controller == null:
		push_error("Main ship flag orientation capture failed: controller is missing.")
		get_tree().quit(1)
		return
	var wait_seconds := 0.0
	while not controller.is_ready() and wait_seconds < 3.0:
		await get_tree().process_frame
		wait_seconds += get_process_delta_time()
	if not controller.is_ready():
		push_error("Main ship flag orientation capture failed: ship did not attach.")
		get_tree().quit(1)
		return

	var marker := Image.create(256, 256, false, Image.FORMAT_RGBA8)
	marker.fill(Color("f45b24"))
	marker.fill_rect(Rect2i(0, 0, 256, 52), Color("ed2532"))
	marker.fill_rect(Rect2i(0, 204, 256, 52), Color("2458d3"))
	marker.fill_rect(Rect2i(0, 0, 42, 256), Color("25b96f"))
	marker.fill_rect(Rect2i(84, 18, 88, 18), Color.WHITE)
	var marker_texture := ImageTexture.create_from_image(marker)
	controller.set_player_flag_url("orientation-test")
	controller.apply_player_flag_texture("orientation-test", marker_texture)
	controller.force_combat()
	_hide_capture_canvas_items(scene)
	_frame_main_ship_flag_camera(controller.global_position)
	await get_tree().create_timer(0.35).timeout
	await RenderingServer.frame_post_draw
	var output_path := ProjectSettings.globalize_path("user://main-ship-flag-orientation.png")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			output_path = text.get_slice("=", 1)
	var err := get_viewport().get_texture().get_image().save_png(output_path)
	if err != OK:
		push_error("Main ship flag orientation capture failed: %s" % error_string(err))
		get_tree().quit(1)
		return
	print("[MAIN_SHIP_FLAG_ORIENTATION] capture=", output_path)
	get_tree().quit()


func _frame_main_ship_flag_camera(ship_position: Vector3) -> void:
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "MainShipFlagOrientationCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.75
	get_tree().current_scene.add_child(camera)
	var target := ship_position + Vector3(0.0, 0.38, 0.0)
	camera.global_position = target + Vector3(2.1, 2.35, 2.25)
	camera.look_at(target, Vector3.UP)
	camera.current = true


func _frame_attack_grid_camera(attack_plane: MeshInstance3D) -> void:
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "AttackGridCaptureCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 4.5
	get_tree().current_scene.add_child(camera)
	var target := attack_plane.global_position
	camera.global_position = target + Vector3(4.8, 6.8, 5.2)
	camera.look_at(target, Vector3.UP)
	camera.current = true


func _capture_archer_tower_test() -> void:
	var scene := get_tree().current_scene
	var bs := _building_system_for_building("archer_tower")
	if scene == null or bs == null:
		push_error("Archer Tower capture failed: building system is missing.")
		get_tree().quit(1)
		return
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false
	_hide_capture_canvas_items(scene)
	reset_sandbox()
	await get_tree().process_frame

	var def: Dictionary = bs.building_defs.get("archer_tower", {})
	var grid_positions: Array[Vector2i] = [
		Vector2i(2, 10),
		Vector2i(6, 10),
		Vector2i(10, 10),
		Vector2i(14, 10),
		Vector2i(18, 10),
		Vector2i(22, 10),
	]
	var tower_centers: Array[Vector3] = []
	var max_center_delta := 0.0
	for level in range(1, 7):
		var grid_pos := grid_positions[level - 1]
		bs._spawn_building_locally("archer_tower", grid_pos, def, -1)
		await get_tree().process_frame
		var building: Dictionary = _last_building_at(bs, "archer_tower", grid_pos)
		if building.is_empty():
			push_error("Archer Tower capture failed: level %d did not spawn." % level)
			get_tree().quit(1)
			return
		await _set_building_level_for_test(bs, building, def, level)
		await get_tree().create_timer(0.12).timeout
		var building_node: Node3D = building.get("node", null)
		var visual_model: Node3D = bs._get_building_visual_model(building_node)
		var tower_unit: Node3D = building.get("tower_unit_node", null)
		var tower_aabb := _world_mesh_aabb(visual_model)
		var unit_aabb := _world_mesh_aabb(tower_unit, ["BowAttachment", "ArrowAttachment"])
		var center_delta := Vector2(
			unit_aabb.get_center().x - tower_aabb.get_center().x,
			unit_aabb.get_center().z - tower_aabb.get_center().z
		)
		max_center_delta = maxf(max_center_delta, center_delta.length())
		print(
			"[ARCHER_TOWER_CAPTURE] level=", level,
			" tower_aabb=", tower_aabb,
			" unit_aabb=", unit_aabb,
			" center_delta_xz=", center_delta,
			" unit_foot_y=", unit_aabb.position.y
		)
		tower_centers.append(tower_aabb.get_center())

	_frame_archer_tower_camera(tower_centers)
	await get_tree().create_timer(2.05).timeout
	await RenderingServer.frame_post_draw
	var output_path := ProjectSettings.globalize_path("user://archer-towers.png")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			output_path = text.get_slice("=", 1)
	var err := get_viewport().get_texture().get_image().save_png(output_path)
	if err != OK:
		push_error("Archer Tower capture failed: %s" % error_string(err))
		get_tree().quit(1)
		return
	if max_center_delta > 0.03:
		push_error("Archer Tower capture failed: unit center drift is %.4f." % max_center_delta)
		get_tree().quit(1)
		return
	print("[ARCHER_TOWER_CAPTURE] PASS max_center_delta=", snappedf(max_center_delta, 0.0001), " capture=", output_path)
	get_tree().quit()


func _capture_resource_collection_feedback() -> void:
	var scene := get_tree().current_scene
	var bs := _building_system_for_grid("main")
	if scene == null or bs == null:
		push_error("Resource collection capture failed: building system is missing.")
		get_tree().quit(1)
		return
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false
	if is_instance_valid(bs.canvas):
		bs.canvas.visible = false
	if is_instance_valid(bs.world_ui_canvas):
		bs.world_ui_canvas.visible = true
	bs.resources["wood"] = 0
	bs.resources["ore"] = 0
	reset_sandbox()
	await get_tree().process_frame

	var specs: Array[Dictionary] = [
		{"id": "sawmill", "grid_pos": Vector2i(6, 10), "amount": 1860, "resource": "wood"},
		{"id": "mine", "grid_pos": Vector2i(17, 10), "amount": 1480, "resource": "ore"},
	]
	var buildings: Array[Dictionary] = []
	var centers: Array[Vector3] = []
	for spec in specs:
		var building_id := String(spec.id)
		var grid_pos: Vector2i = spec.grid_pos
		var def: Dictionary = bs.building_defs.get(building_id, {})
		bs._spawn_building_locally(building_id, grid_pos, def, -1)
		await get_tree().process_frame
		var building := _last_building_at(bs, building_id, grid_pos)
		if building.is_empty():
			push_error("Resource collection capture failed: %s did not spawn." % building_id)
			get_tree().quit(1)
			return
		_set_building_level_immediate(bs, building, def, 4)
		building["stored"] = float(spec.amount)
		buildings.append(building)
		var building_node := building.get("node") as Node3D
		centers.append(building_node.global_position)

	_frame_resource_collection_camera(centers)
	await get_tree().create_timer(0.55).timeout
	bs._production._update_collect_icons()
	await get_tree().process_frame
	# A deliberately slow network verifies that click feedback is optimistic and
	# appears immediately instead of waiting for the collection response.
	var delayed_net := DelayedCollectionNetwork.new()
	scene.add_child(delayed_net)
	bs._net = delayed_net
	var click_started_usec := Time.get_ticks_usec()
	for index in buildings.size():
		var building: Dictionary = buildings[index]
		var icon := building.get("_collect_icon") as Control
		if not is_instance_valid(icon):
			push_error("Resource collection capture failed: collect icon is missing for %s." % specs[index].id)
			get_tree().quit(1)
			return
		bs._production._click_collect_icon(icon, building, String(specs[index].resource))
	await get_tree().process_frame
	var feedback_latency_ms := float(Time.get_ticks_usec() - click_started_usec) / 1000.0
	if feedback_latency_ms > 100.0:
		push_error("Resource collection feedback was delayed by %.2f ms." % feedback_latency_ms)
		get_tree().quit(1)
		return

	var output_dir := _resource_collection_capture_dir()
	DirAccess.make_dir_recursive_absolute(output_dir)
	await get_tree().create_timer(0.17).timeout
	if not _verify_resource_feedback_labels(bs.world_ui_canvas, specs):
		get_tree().quit(1)
		return
	if not await _save_resource_collection_capture(output_dir.path_join("01-pop.png"), "pop"):
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.36).timeout
	if not await _save_resource_collection_capture(output_dir.path_join("02-rise.png"), "rise"):
		get_tree().quit(1)
		return
	await get_tree().create_timer(1.25).timeout
	var leftovers: Array[Node] = bs.world_ui_canvas.find_children("CollectionAmountFeedback_*", "Label", true, false)
	if not leftovers.is_empty():
		push_error("Resource collection capture failed: %d feedback labels did not clean up." % leftovers.size())
		get_tree().quit(1)
		return
	print(
		"[RESOURCE_COLLECTION_FEEDBACK] PASS labels=2 feedback_ms=%.2f network_delay_ms=1500 cleanup=true output=%s"
		% [feedback_latency_ms, output_dir]
	)
	get_tree().quit()


func _verify_collect_icons_during_move() -> void:
	var bs := _building_system_for_grid("main")
	if bs == null:
		push_error("Move collection icon test failed: building system is missing.")
		get_tree().quit(1)
		return
	if _panel:
		_panel.visible = false
	reset_sandbox()
	await get_tree().process_frame
	var def: Dictionary = bs.building_defs.get("mine", {})
	var grid_pos := Vector2i(12, 10)
	bs._spawn_building_locally("mine", grid_pos, def, -1)
	await get_tree().process_frame
	var building := _last_building_at(bs, "mine", grid_pos)
	if building.is_empty():
		push_error("Move collection icon test failed: mine did not spawn.")
		get_tree().quit(1)
		return
	building["stored"] = 100.0
	var building_node := building.get("node") as Node3D
	_frame_resource_collection_camera([building_node.global_position])
	await get_tree().process_frame
	bs._production._update_collect_icons()
	await get_tree().process_frame
	var icon := building.get("_collect_icon") as Control
	if not is_instance_valid(icon) or not icon.visible or icon.mouse_filter != Control.MOUSE_FILTER_STOP:
		push_error("Move collection icon test failed: initial collect icon is not interactive.")
		get_tree().quit(1)
		return
	bs.selected_building = building
	bs._start_move(building)
	if not bs._is_moving or icon.visible or icon.mouse_filter != Control.MOUSE_FILTER_IGNORE:
		push_error("Move collection icon test failed: move start did not suppress the collect icon.")
		get_tree().quit(1)
		return
	bs._production._update_collect_icons()
	await get_tree().process_frame
	if icon.visible or icon.mouse_filter != Control.MOUSE_FILTER_IGNORE:
		push_error("Move collection icon test failed: frame update restored the icon during movement.")
		get_tree().quit(1)
		return
	var stored_before_click := float(building.get("stored", 0.0))
	bs._production._click_collect_icon(icon, building, "ore")
	if not is_equal_approx(float(building.get("stored", 0.0)), stored_before_click):
		push_error("Move collection icon test failed: suppressed icon still collected resources.")
		get_tree().quit(1)
		return
	bs._cancel_move(false)
	await get_tree().process_frame
	bs._production._update_collect_icons()
	if bs._is_moving or not icon.visible or icon.mouse_filter != Control.MOUSE_FILTER_STOP:
		push_error("Move collection icon test failed: cancel did not restore the collect icon.")
		get_tree().quit(1)
		return
	bs._start_move(building)
	var confirmed_grid_pos := Vector2i(16, 10)
	var size_x := float(def.cells.x) * float(bs.cell_size)
	var size_z := float(def.cells.y) * float(bs.cell_size)
	var confirmed_local_pos: Vector3 = bs._grid_to_local(confirmed_grid_pos)
	confirmed_local_pos += Vector3(size_x * 0.5, 0.0, size_z * 0.5)
	bs.current_grid_pos = confirmed_grid_pos
	building_node.position = confirmed_local_pos
	bs._confirm_move()
	await get_tree().process_frame
	bs._production._update_collect_icons()
	if bs._is_moving or building.get("grid_pos") != confirmed_grid_pos or not icon.visible or icon.mouse_filter != Control.MOUSE_FILTER_STOP:
		push_error("Move collection icon test failed: confirm did not restore the collect icon.")
		get_tree().quit(1)
		return
	print("[MOVE_COLLECTION_ICON_TEST] PASS hidden_during_move=true input_blocked=true restored_after_cancel=true restored_after_confirm=true")
	get_tree().quit()


func _frame_resource_collection_camera(centers: Array[Vector3]) -> void:
	if centers.is_empty():
		return
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var center := Vector3.ZERO
	for item in centers:
		center += item
	center /= float(centers.size())
	var camera := Camera3D.new()
	camera.name = "ResourceCollectionCaptureCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 3.15
	get_tree().current_scene.add_child(camera)
	camera.global_position = center + Vector3(2.8, 2.45, 4.0)
	camera.look_at(center + Vector3(0.0, 0.18, 0.0), Vector3.UP)
	camera.current = true


func _resource_collection_capture_dir() -> String:
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			return text.get_slice("=", 1)
	return ProjectSettings.globalize_path("user://resource_collection_feedback")


func _verify_resource_feedback_labels(world_canvas: CanvasLayer, specs: Array[Dictionary]) -> bool:
	if not is_instance_valid(world_canvas):
		push_error("Resource collection capture failed: world UI canvas is missing.")
		return false
	for spec in specs:
		var expected_name := "CollectionAmountFeedback_%s" % String(spec.resource).capitalize()
		var label := world_canvas.get_node_or_null(expected_name) as Label
		var expected_text := "+%s" % bs_format_number(int(spec.amount))
		if label == null or label.text != expected_text:
			var visible_labels: Array[String] = []
			for child in world_canvas.get_children():
				if child is Label:
					visible_labels.append("%s=%s" % [child.name, (child as Label).text])
			print("[RESOURCE_COLLECTION_FEEDBACK] visible_labels=", visible_labels)
			push_error("Resource collection capture failed: expected %s with %s." % [expected_name, expected_text])
			return false
	return true


func bs_format_number(amount: int) -> String:
	var digits := str(maxi(amount, 0))
	var formatted := ""
	while digits.length() > 3:
		formatted = " " + digits.right(3) + formatted
		digits = digits.left(digits.length() - 3)
	return digits + formatted


func _save_resource_collection_capture(path: String, label: String) -> bool:
	await RenderingServer.frame_post_draw
	var err := get_viewport().get_texture().get_image().save_png(path)
	if err != OK:
		push_error("Resource collection %s capture failed: %s" % [label, error_string(err)])
		return false
	print("[RESOURCE_COLLECTION_FEEDBACK] capture=", label, " path=", path)
	return true


func _world_mesh_aabb(root: Node, excluded_ancestors: Array[String] = []) -> AABB:
	var merged := AABB()
	var first := true
	if root == null:
		return merged
	for mesh_instance in _mesh_instances_below(root):
		if _has_named_ancestor_below(mesh_instance, root, excluded_ancestors):
			continue
		var local_aabb: AABB = mesh_instance.get_aabb()
		for ix in range(2):
			for iy in range(2):
				for iz in range(2):
					var corner := local_aabb.position + local_aabb.size * Vector3(ix, iy, iz)
					var world_corner: Vector3 = mesh_instance.global_transform * corner
					if first:
						merged = AABB(world_corner, Vector3.ZERO)
						first = false
					else:
						merged = merged.expand(world_corner)
	return merged


func _has_named_ancestor_below(node: Node, root: Node, names: Array[String]) -> bool:
	var current := node
	while current != null and current != root:
		if names.has(String(current.name)):
			return true
		current = current.get_parent()
	return false


func _mesh_instances_below(root: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if root is MeshInstance3D:
		result.append(root as MeshInstance3D)
	for child in root.get_children():
		result.append_array(_mesh_instances_below(child))
	return result


func _frame_archer_tower_camera(centers: Array[Vector3]) -> void:
	if centers.is_empty():
		return
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var center := Vector3.ZERO
	for item in centers:
		center += item
	center /= float(centers.size())
	var camera := Camera3D.new()
	camera.name = "ArcherTowerCaptureCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 3.3
	get_tree().current_scene.add_child(camera)
	camera.global_position = center + Vector3(3.1, 2.7, 4.2)
	camera.look_at(center + Vector3(0.0, 0.20, 0.0), Vector3.UP)
	camera.current = true


func _verify_archer_tower_combat() -> void:
	var bs := _building_system_for_building("archer_tower")
	var attack := get_node_or_null("../AttackSystem")
	if bs == null or attack == null:
		push_error("Archer Tower combat test failed: combat nodes are missing.")
		get_tree().quit(1)
		return
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("archer_tower", 1):
		push_error("Archer Tower combat test failed: tower did not spawn.")
		get_tree().quit(1)
		return
	var tower: Dictionary = {}
	for candidate in bs.placed_buildings:
		if str(candidate.get("id", "")) == "archer_tower":
			tower = candidate
			break
	if tower.is_empty():
		push_error("Archer Tower combat test failed: tower state is missing.")
		get_tree().quit(1)
		return
	var tower_node: Node3D = tower.get("node", null)
	var tower_unit: Node3D = tower.get("tower_unit_node", null)
	if tower_node == null or tower_unit == null:
		push_error("Archer Tower combat test failed: tower archer is missing.")
		get_tree().quit(1)
		return

	attack._spawn_troops_at_pos(["Knight"], {}, tower_node.global_position + Vector3(0.55, 0.0, 0.0))
	var troop: Node = null
	var spawn_wait := 0.0
	while troop == null and spawn_wait < 2.0:
		await get_tree().process_frame
		spawn_wait += get_process_delta_time()
		for candidate in get_tree().get_nodes_in_group("troops"):
			if BaseTroop.is_live_troop(candidate):
				troop = candidate
				break
	if troop == null:
		push_error("Archer Tower combat test failed: target troop did not activate.")
		get_tree().quit(1)
		return
	var initial_hp := int(troop.get("hp"))
	var combat_wait := 0.0
	while is_instance_valid(troop) and int(troop.get("hp")) >= initial_hp and combat_wait < 4.0:
		await get_tree().process_frame
		combat_wait += get_process_delta_time()
	if not is_instance_valid(troop):
		print("[ARCHER_TOWER_COMBAT] PASS target_defeated initial_hp=", initial_hp, " elapsed=", combat_wait)
		get_tree().quit()
		return
	var remaining_hp := int(troop.get("hp"))
	if remaining_hp >= initial_hp:
		push_error("Archer Tower combat test failed: target HP stayed at %d." % remaining_hp)
		get_tree().quit(1)
		return
	print(
		"[ARCHER_TOWER_COMBAT] PASS initial_hp=", initial_hp,
		" remaining_hp=", remaining_hp,
		" damage=", initial_hp - remaining_hp,
		" elapsed=", snappedf(combat_wait, 0.001),
		" tower_state=", tower_unit.get("state")
	)
	get_tree().quit()


func _verify_pirate_archer_combat() -> void:
	var bs := _building_system_for_building("mine")
	var attack := get_node_or_null("../AttackSystem")
	if bs == null or attack == null:
		push_error("Pirate Archer combat test failed: combat nodes are missing.")
		get_tree().quit(1)
		return
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("mine", 1):
		push_error("Pirate Archer combat test failed: target building did not spawn.")
		get_tree().quit(1)
		return
	var target: Dictionary = {}
	for candidate in bs.placed_buildings:
		if str(candidate.get("id", "")) == "mine":
			target = candidate
			break
	if target.is_empty():
		push_error("Pirate Archer combat test failed: target state is missing.")
		get_tree().quit(1)
		return
	var target_node: Node3D = target.get("node", null)
	if target_node == null:
		push_error("Pirate Archer combat test failed: target node is missing.")
		get_tree().quit(1)
		return

	attack._spawn_troops_at_pos(["Archer"], {}, target_node.global_position + Vector3(0.60, 0.0, 0.0))
	var troop: Node = null
	var spawn_wait := 0.0
	while troop == null and spawn_wait < 2.0:
		await get_tree().process_frame
		spawn_wait += get_process_delta_time()
		for candidate in get_tree().get_nodes_in_group("troops"):
			if BaseTroop.is_live_troop(candidate) and bool(candidate.get_meta("clash_pirate_archer", false)):
				troop = candidate
				break
	if troop == null:
		push_error("Pirate Archer combat test failed: troop did not activate.")
		get_tree().quit(1)
		return
	if not bool(troop.get_meta("clash_pirate_archer", false)):
		push_error("Pirate Archer combat test failed: legacy visual was spawned.")
		get_tree().quit(1)
		return
	var expected_scale := AttackSystem._scale_for_troop("Archer", attack.troop_scale)
	if not is_equal_approx(float(troop._spawn_scale), expected_scale):
		push_error(
			"Pirate Archer combat test failed: expected spawn scale %.3f, got %.3f."
			% [expected_scale, float(troop._spawn_scale)]
		)
		get_tree().quit(1)
		return
	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null or not player.has_animation("Ranged_Bow_Release"):
		push_error("Pirate Archer combat test failed: attack animation is unavailable.")
		get_tree().quit(1)
		return

	var initial_hp := int(target.get("hp", 0))
	var projectile_seen := false
	var combat_wait := 0.0
	while int(target.get("hp", initial_hp)) >= initial_hp and combat_wait < 4.0:
		await get_tree().process_frame
		combat_wait += get_process_delta_time()
		var active_projectiles: Variant = troop.get("_active")
		if active_projectiles is Array and not active_projectiles.is_empty():
			projectile_seen = true
	var remaining_hp := int(target.get("hp", initial_hp))
	if remaining_hp >= initial_hp:
		push_error("Pirate Archer combat test failed: target HP stayed at %d." % initial_hp)
		get_tree().quit(1)
		return
	if not projectile_seen:
		push_error("Pirate Archer combat test failed: no arrow projectile was observed.")
		get_tree().quit(1)
		return
	print(
		"[PIRATE_ARCHER_COMBAT] PASS initial_hp=", initial_hp,
		" remaining_hp=", remaining_hp,
		" damage=", initial_hp - remaining_hp,
		" elapsed=", snappedf(combat_wait, 0.001),
		" animation=", player.current_animation
	)
	get_tree().quit()


func _capture_troop_scale_comparison() -> void:
	var scene := get_tree().current_scene
	var attack := get_node_or_null("../AttackSystem")
	if scene == null or attack == null:
		push_error("Troop scale comparison failed: AttackSystem is missing.")
		get_tree().quit(1)
		return
	reset_sandbox()
	await get_tree().process_frame
	attack._spawn_troops_at_pos(["Knight", "Mage", "Archer", "Mimic"], {}, Vector3.ZERO)

	var knight: Node3D = null
	var mage: Node3D = null
	var archer: Node3D = null
	var mimic: Node3D = null
	var spawn_wait := 0.0
	while (knight == null or mage == null or archer == null or mimic == null) and spawn_wait < 3.0:
		await get_tree().process_frame
		spawn_wait += get_process_delta_time()
		for candidate in get_tree().get_nodes_in_group("troops"):
			if not BaseTroop.is_live_troop(candidate):
				continue
			var script: Script = candidate.get_script() as Script
			var script_path := String(script.resource_path) if script != null else ""
			if script_path.ends_with("/knight.gd"):
				knight = candidate as Node3D
			elif script_path.ends_with("/mage.gd"):
				mage = candidate as Node3D
			elif script_path.ends_with("/archer.gd"):
				archer = candidate as Node3D
			elif script_path.ends_with("/mimic.gd"):
				mimic = candidate as Node3D
	if knight == null or mage == null or archer == null or mimic == null:
		push_error("Troop scale comparison failed: combat troops did not spawn.")
		get_tree().quit(1)
		return

	for troop in [knight, mage, archer, mimic]:
		troop.set_process(false)
		troop.set_physics_process(false)
	var ground_y := maxf(maxf(knight.global_position.y, mage.global_position.y), maxf(archer.global_position.y, mimic.global_position.y))
	var comparison_troops: Array[Node3D] = [knight, mage, archer, mimic]
	var comparison_x: Array[float] = [-0.72, -0.24, 0.24, 0.72]
	for index in comparison_troops.size():
		comparison_troops[index].global_position = Vector3(comparison_x[index], ground_y, 0.0)
		comparison_troops[index].rotation = Vector3.ZERO

	_hide_capture_canvas_items(scene)
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "TroopScaleComparisonCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.25
	scene.add_child(camera)
	var target := Vector3(0.0, ground_y + 0.13, 0.0)
	camera.global_position = target + Vector3(0.0, 2.2, 1.8)
	camera.look_at(target, Vector3.UP)
	camera.current = true

	await get_tree().create_timer(0.25).timeout
	var knight_aabb := _world_mesh_aabb(knight)
	var mage_aabb := _world_mesh_aabb(mage)
	var archer_aabb := _world_mesh_aabb(archer, ["BowAttachment", "ArrowAttachment"])
	var mimic_aabb := _world_mesh_aabb(mimic)
	var expected_archer_scale := AttackSystem._scale_for_troop("Archer", attack.troop_scale)
	var expected_mimic_scale := AttackSystem._scale_for_troop("Mimic", attack.troop_scale)
	print(
		"[TROOP_SCALE_COMPARISON] knight_scale=", knight._spawn_scale,
		" knight_height=", snappedf(knight_aabb.size.y, 0.0001),
		" mage_scale=", mage._spawn_scale,
		" mage_height=", snappedf(mage_aabb.size.y, 0.0001),
		" archer_scale=", archer._spawn_scale,
		" expected_archer_scale=", expected_archer_scale,
		" archer_height=", snappedf(archer_aabb.size.y, 0.0001),
		" mimic_scale=", mimic._spawn_scale,
		" expected_mimic_scale=", expected_mimic_scale,
		" mimic_height=", snappedf(mimic_aabb.size.y, 0.0001)
	)
	if not is_equal_approx(float(archer._spawn_scale), expected_archer_scale):
		push_error("Troop scale comparison failed: Archer multiplier was not applied.")
		get_tree().quit(1)
		return
	if not is_equal_approx(float(mimic._spawn_scale), expected_mimic_scale):
		push_error("Troop scale comparison failed: Mimic multiplier was not applied.")
		get_tree().quit(1)
		return

	var output_dir := ProjectSettings.globalize_path("user://")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			output_dir = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(output_dir)
	var output_path := output_dir.path_join("troop_scale_comparison.png")
	await RenderingServer.frame_post_draw
	var err := get_viewport().get_texture().get_image().save_png(output_path)
	if err != OK:
		push_error("Troop scale comparison capture failed: %s" % error_string(err))
		get_tree().quit(1)
		return
	print("[TROOP_SCALE_COMPARISON] capture=", output_path)
	get_tree().quit()


func _verify_shark_trap() -> void:
	var scene := get_tree().current_scene
	var bs := _building_system_for_grid("main")
	var attack := get_node_or_null("../AttackSystem")
	var battle: Variant = bs.get("_battle") if bs else null
	var ambient := scene.get_node_or_null("AmbientShark") as Node3D if scene else null
	if scene == null or bs == null or attack == null or battle == null or ambient == null:
		push_error("Shark Trap test failed: combat systems are missing.")
		get_tree().quit(1)
		return
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false
	_hide_capture_canvas_items(scene)
	var output_dir := ProjectSettings.globalize_path("user://shark_trap")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			output_dir = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(output_dir)

	reset_sandbox()
	_clear_shark_test_troops()
	await get_tree().create_timer(0.35).timeout
	if not ambient.has_method("is_decor_visible") or bool(ambient.call("is_decor_visible")):
		push_error("Shark Trap test failed: ambient shark is visible without an installed trap.")
		get_tree().quit(1)
		return
	battle.is_viewing_enemy = false
	var trap_def: Dictionary = bs.building_defs.get("shark_trap", {})
	var trap_grid := Vector2i(12, 12)
	bs._spawn_building_locally("shark_trap", trap_grid, trap_def, -1)
	await get_tree().process_frame
	var owner_trap := _last_building_at(bs, "shark_trap", trap_grid)
	if owner_trap.is_empty():
		push_error("Shark Trap test failed: owner preview did not spawn.")
		get_tree().quit(1)
		return
	var owner_node := owner_trap.get("node") as Node3D
	_set_building_level_immediate(bs, owner_trap, trap_def, 3)
	if not bool(owner_node.get_meta("shark_head_visual_ready", false)) or int(owner_node.get_meta("trap_damage", 0)) != 1050:
		push_error("Shark Trap test failed: owner head preview or level 3 damage is not configured.")
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.35).timeout
	if not bool(ambient.call("is_decor_visible")):
		push_error("Shark Trap test failed: ambient shark is hidden despite an installed trap.")
		get_tree().quit(1)
		return
	_frame_shark_test_camera(owner_node.global_position, 1.05)
	await get_tree().create_timer(0.42).timeout
	await _hold_shark_web_capture()
	if not await _save_shark_test_capture(output_dir.path_join("01-owner-preview.png"), "owner-preview"):
		get_tree().quit(1)
		return

	# TestMain's Start button attacks the current sandbox directly. It never
	# flips BSBattle.is_viewing_enemy, so verify that entering AttackSystem mode
	# arms an already-instantiated owner trap and keeps it hidden from the player.
	attack.is_attack_mode = true
	await get_tree().physics_frame
	await get_tree().physics_frame
	if not bool(owner_node.call("is_concealed_from_attacker")):
		push_error("Shark Trap test failed: TestMain self-attack did not conceal and arm the owner trap.")
		get_tree().quit(1)
		return
	var self_attack_target_position: Vector3 = owner_node.global_position + bs.global_transform.basis * Vector3(0.08, 0.0, -0.06)
	if not attack._spawn_manual_troop("Knight", 1, self_attack_target_position, 90):
		push_error("Shark Trap test failed: TestMain self-attack target did not spawn.")
		get_tree().quit(1)
		return
	var self_attack_wait := 0.0
	while not bool(owner_node.get_meta("trap_spent", false)) and self_attack_wait < 1.0:
		await get_tree().physics_frame
		self_attack_wait += get_physics_process_delta_time()
	if not bool(owner_node.get_meta("trap_spent", false)):
		push_error("Shark Trap test failed: TestMain self-attack did not trigger the armed trap.")
		get_tree().quit(1)
		return
	attack.is_attack_mode = false

	reset_sandbox()
	_clear_shark_test_troops()
	await get_tree().process_frame
	battle.is_viewing_enemy = true
	bs._spawn_building_locally("shark_trap", trap_grid, trap_def, -1)
	await get_tree().process_frame
	var combat_trap := _last_building_at(bs, "shark_trap", trap_grid)
	var combat_node := combat_trap.get("node") as Node3D
	if combat_node == null or not combat_node.has_method("is_concealed_from_attacker") or not bool(combat_node.call("is_concealed_from_attacker")):
		push_error("Shark Trap test failed: attacker can see the untriggered trap.")
		get_tree().quit(1)
		return
	var ground_spawn_position: Vector3 = combat_node.global_position + bs.global_transform.basis * Vector3(0.105, 0.0, -0.075) if combat_node != null else Vector3.ZERO
	bs.troop_levels["Knight"] = 5
	if combat_node == null or not attack._spawn_manual_troop("Knight", 5, ground_spawn_position, 0):
		push_error("Shark Trap test failed: ground troop did not spawn.")
		get_tree().quit(1)
		return
	var ground_target: Node3D = null
	for troop in get_tree().get_nodes_in_group("troops"):
		if BaseTroop.is_live_troop(troop) and troop.has_method("_get_troop_name") and str(troop.call("_get_troop_name")) == "Knight":
			ground_target = troop as Node3D
			break
	if ground_target == null:
		push_error("Shark Trap test failed: ground target could not be resolved.")
		get_tree().quit(1)
		return
	var trigger_wait := 0.0
	while not bool(combat_node.get_meta("trap_spent", false)) and trigger_wait < 1.0:
		await get_tree().process_frame
		trigger_wait += get_process_delta_time()
	if not bool(combat_node.get_meta("trap_spent", false)):
		push_error("Shark Trap test failed: ground troop did not trigger the trap.")
		get_tree().quit(1)
		return
	if int(ground_target.get("hp")) != 0:
		push_error("Shark Trap test failed: an over-levelled ordinary ground troop survived.")
		get_tree().quit(1)
		return
	_frame_shark_test_camera(combat_node.global_position, 1.8)
	await get_tree().create_timer(0.08).timeout
	await _hold_shark_web_capture()
	if not await _save_shark_test_capture(output_dir.path_join("02a-ground-rise.png"), "ground-rise"):
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.13).timeout
	var alignment_error := float(combat_node.call("visual_head_alignment_error_to", ground_target.global_position))
	if alignment_error > 0.025:
		push_error("Shark Trap test failed: bite head missed the target by %.4f units." % alignment_error)
		get_tree().quit(1)
		return
	if not await _save_shark_test_capture(output_dir.path_join("02b-ground-bite.png"), "ground-bite"):
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.24).timeout
	if not await _save_shark_test_capture(output_dir.path_join("02c-ground-sink.png"), "ground-sink"):
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.30).timeout

	reset_sandbox()
	_clear_shark_test_troops()
	await get_tree().process_frame
	battle.is_viewing_enemy = true
	var mimic_grid := Vector2i(12, 12)
	bs._spawn_building_locally("shark_trap", mimic_grid, trap_def, -4)
	await get_tree().process_frame
	var mimic_trap := _last_building_at(bs, "shark_trap", mimic_grid)
	var mimic_trap_node := mimic_trap.get("node") as Node3D
	_set_building_level_immediate(bs, mimic_trap, trap_def, 5)
	bs.troop_levels["Mimic"] = 1
	if mimic_trap_node == null or not attack._spawn_manual_troop("Mimic", 1, mimic_trap_node.global_position, 3):
		push_error("Shark Trap test failed: Mimic did not spawn.")
		get_tree().quit(1)
		return
	var live_mimic: Node3D = null
	for troop in get_tree().get_nodes_in_group("troops"):
		if BaseTroop.is_live_troop(troop) and troop.has_method("_get_troop_name") and str(troop.call("_get_troop_name")) == "Mimic":
			live_mimic = troop as Node3D
			break
	if live_mimic == null:
		push_error("Shark Trap test failed: Mimic could not be resolved.")
		get_tree().quit(1)
		return
	var mimic_anim := live_mimic.get("anim_player") as AnimationPlayer
	for required_anim in ["Idle_A", "Running_A", "Tongue_Attack", "GetHit", "Die"]:
		if mimic_anim == null or not mimic_anim.has_animation(required_anim):
			push_error("Mimic test failed: required animation is missing: %s" % required_anim)
			get_tree().quit(1)
			return
	var mimic_hp_before := int(live_mimic.get("hp"))
	var mimic_trigger_wait := 0.0
	while not bool(mimic_trap_node.get_meta("trap_spent", false)) and mimic_trigger_wait < 1.2:
		await get_tree().physics_frame
		mimic_trigger_wait += get_physics_process_delta_time()
	if not bool(mimic_trap_node.get_meta("trap_spent", false)):
		push_error("Shark Trap test failed: Mimic did not consume the trap.")
		get_tree().quit(1)
		return
	if not BaseTroop.is_live_troop(live_mimic) or int(live_mimic.get("hp")) != mimic_hp_before:
		push_error("Shark Trap test failed: Mimic took damage from the consumed trap.")
		get_tree().quit(1)
		return
	live_mimic.set_physics_process(false)
	live_mimic.set("state", BaseTroop.State.RUNNING)
	mimic_anim.play("Running_A")
	if BaseTroop.can_defense_target_troop(live_mimic, true, true):
		push_error("Mimic test failed: rolling Mimic is targetable by defenses.")
		get_tree().quit(1)
		return
	_frame_shark_test_camera(mimic_trap_node.global_position, 1.8)
	await get_tree().create_timer(0.12).timeout
	await _hold_shark_web_capture()
	if not await _save_shark_test_capture(output_dir.path_join("03-mimic-immune.png"), "mimic-immune"):
		get_tree().quit(1)
		return
	live_mimic.set("state", BaseTroop.State.ATTACKING)
	if not BaseTroop.can_defense_target_troop(live_mimic, true, true):
		push_error("Mimic test failed: attacking Mimic is not targetable by defenses.")
		get_tree().quit(1)
		return
	live_mimic.set_physics_process(true)
	if OS.get_cmdline_user_args().has("--verify-mimic-only"):
		print("[MIMIC_CLIENT] PASS trap=consumed damage=0 rolling=untargetable attacking=targetable animations=complete output=", output_dir)
		get_tree().quit()
		return

	reset_sandbox()
	_clear_shark_test_troops()
	await get_tree().process_frame
	battle.is_viewing_enemy = true
	var air_grid := Vector2i(17, 12)
	bs._spawn_building_locally("shark_trap", air_grid, trap_def, -2)
	await get_tree().process_frame
	var air_trap := _last_building_at(bs, "shark_trap", air_grid)
	var air_node := air_trap.get("node") as Node3D
	if air_node == null or not attack._spawn_manual_troop("FireDragon", 1, air_node.global_position, 1):
		push_error("Shark Trap test failed: flying troop did not spawn.")
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.55).timeout
	if bool(air_node.get_meta("trap_spent", false)):
		push_error("Shark Trap test failed: flying troop triggered the trap.")
		get_tree().quit(1)
		return
	var live_dragon := false
	for troop in get_tree().get_nodes_in_group("troops"):
		if BaseTroop.is_live_troop(troop) and BaseTroop.is_air_troop(troop):
			live_dragon = true
			break
	if not live_dragon:
		push_error("Shark Trap test failed: flying troop did not survive.")
		get_tree().quit(1)
		return
	_frame_shark_test_camera(air_node.global_position, 2.2)
	await _hold_shark_web_capture()
	if not await _save_shark_test_capture(output_dir.path_join("04-air-ignored.png"), "air-ignored"):
		get_tree().quit(1)
		return

	reset_sandbox()
	_clear_shark_test_troops()
	await get_tree().process_frame
	battle.is_viewing_enemy = true
	var demon_grid := Vector2i(12, 12)
	bs._spawn_building_locally("shark_trap", demon_grid, trap_def, -3)
	await get_tree().process_frame
	var demon_trap := _last_building_at(bs, "shark_trap", demon_grid)
	var demon_node := demon_trap.get("node") as Node3D
	_set_building_level_immediate(bs, demon_trap, trap_def, 5)
	bs.troop_levels["DemonKing"] = 5
	if demon_node == null or not attack._spawn_manual_troop("DemonKing", 5, demon_node.global_position, 2):
		push_error("Shark Trap test failed: Demon King did not spawn.")
		get_tree().quit(1)
		return
	var demon_trigger_wait := 0.0
	while not bool(demon_node.get_meta("trap_spent", false)) and demon_trigger_wait < 1.2:
		await get_tree().process_frame
		demon_trigger_wait += get_process_delta_time()
	if not bool(demon_node.get_meta("trap_spent", false)):
		push_error("Shark Trap test failed: Demon King did not trigger the trap.")
		get_tree().quit(1)
		return
	var live_demon: Node = null
	for troop in get_tree().get_nodes_in_group("troops"):
		if BaseTroop.is_live_troop(troop) and troop.has_method("_get_troop_name") and str(troop.call("_get_troop_name")) == "DemonKing":
			live_demon = troop
			break
	if not is_instance_valid(live_demon) or int(live_demon.get("hp")) != 1024:
		push_error("Shark Trap test failed: level 5 Demon King HP should be 1024 after a 2000 damage hit.")
		get_tree().quit(1)
		return
	await get_tree().create_timer(0.30).timeout
	_frame_shark_test_camera(demon_node.global_position, 2.0)
	await _hold_shark_web_capture()
	if not await _save_shark_test_capture(output_dir.path_join("05-demon-king-damaged.png"), "demon-king-damaged"):
		get_tree().quit(1)
		return
	if not ambient.has_method("is_water_lane_clear") or not bool(ambient.call("is_water_lane_clear", 360)):
		push_error("Shark Trap test failed: ambient shark route enters the island keepout zone.")
		get_tree().quit(1)
		return
	_frame_ambient_shark_camera(ambient.global_position, 3.2)
	await _hold_shark_web_capture()
	if not await _save_shark_test_capture(output_dir.path_join("06-ambient-shark.png"), "ambient"):
		get_tree().quit(1)
		return
	print("[SHARK_TRAP_CLIENT] PASS ground=instant-kill mimic=consumed_immune rolling=untargetable air=ignored demon_hp=1024 ambient=conditional output=", output_dir)
	get_tree().quit()


func _verify_ambient_shark_route() -> void:
	var scene := get_tree().current_scene
	var ambient := scene.get_node_or_null("AmbientShark") as Node3D if scene else null
	if ambient == null:
		push_error("Ambient Shark route test failed: controller is missing.")
		get_tree().quit(1)
		return
	await get_tree().process_frame
	if not bool(ambient.call("is_water_lane_clear", 720)):
		push_error("Ambient Shark route test failed: configured lane intersects island or attack grid.")
		get_tree().quit(1)
		return
	if not bool(ambient.call("is_shark_submerged")):
		push_error("Ambient Shark route test failed: shark is not below the water line.")
		get_tree().quit(1)
		return
	var warmup := scene.get_node_or_null("Warmup") as Node3D
	var warmup_frames := 0
	while warmup != null and warmup.visible and warmup_frames < 900:
		await get_tree().process_frame
		warmup_frames += 1
	await get_tree().process_frame

	var start_position := ambient.global_position
	var previous_position := start_position
	var minimum_radius := INF
	var maximum_radius := 0.0
	var maximum_step := 0.0
	var maximum_speed := 0.0
	var maximum_step_from := previous_position
	var maximum_step_to := previous_position
	var minimum_depth := INF
	var initial_state: Dictionary = ambient.call("route_debug_state")
	var previous_reported_speed := float(initial_state.get("current_speed", 0.0))
	var previous_yaw := float(initial_state.get("yaw", 0.0))
	var maximum_reported_acceleration := 0.0
	var maximum_yaw_step := 0.0
	for _frame in range(720):
		await get_tree().process_frame
		var current_position := ambient.global_position
		if not bool(ambient.call("is_current_position_clear")):
			push_error("Ambient Shark route test failed: live route entered a keepout zone.")
			get_tree().quit(1)
			return
		var state: Dictionary = ambient.call("route_debug_state")
		var center: Vector3 = state.get("center", Vector3.ZERO)
		var radius := Vector2(current_position.x - center.x, current_position.z - center.z).length()
		minimum_radius = minf(minimum_radius, radius)
		maximum_radius = maxf(maximum_radius, radius)
		var frame_step := previous_position.distance_to(current_position)
		var frame_delta := maxf(get_process_delta_time(), 0.0001)
		maximum_speed = maxf(maximum_speed, frame_step / frame_delta)
		var reported_speed := float(state.get("current_speed", 0.0))
		maximum_reported_acceleration = maxf(
			maximum_reported_acceleration,
			absf(reported_speed - previous_reported_speed) / frame_delta
		)
		previous_reported_speed = reported_speed
		var current_yaw := float(state.get("yaw", 0.0))
		maximum_yaw_step = maxf(
			maximum_yaw_step,
			absf(wrapf(current_yaw - previous_yaw, -PI, PI))
		)
		previous_yaw = current_yaw
		if frame_step > maximum_step:
			maximum_step = frame_step
			maximum_step_from = previous_position
			maximum_step_to = current_position
		minimum_depth = minf(minimum_depth, float(state.get("water_y", 0.0)) - current_position.y)
		previous_position = current_position
	var travelled := start_position.distance_to(ambient.global_position)
	if travelled < 0.35:
		push_error("Ambient Shark route test failed: shark did not travel through the water lane.")
		get_tree().quit(1)
		return
	if minimum_depth < 0.045:
		push_error("Ambient Shark route test failed: waves exposed too much of the shark.")
		get_tree().quit(1)
		return
	if maximum_speed > 1.35:
		push_error(
			"Ambient Shark route test failed: route contains a visible speed spike "
			+ str(snappedf(maximum_speed, 0.001))
			+ " units/s step=" + str(snappedf(maximum_step, 0.001))
			+ " from=" + str(maximum_step_from)
			+ " to=" + str(maximum_step_to)
		)
		get_tree().quit(1)
		return
	var configured_acceleration := float(initial_state.get("swim_acceleration", 0.18))
	if maximum_reported_acceleration > configured_acceleration + 0.035:
		push_error(
			"Ambient Shark route test failed: swim speed changed abruptly "
			+ str(snappedf(maximum_reported_acceleration, 0.001))
			+ " units/s2."
		)
		get_tree().quit(1)
		return
	if maximum_yaw_step > 0.16:
		push_error(
			"Ambient Shark route test failed: heading snapped by "
			+ str(snappedf(rad_to_deg(maximum_yaw_step), 0.1))
			+ " degrees in one frame."
		)
		get_tree().quit(1)
		return
	print(
		"[AMBIENT_SHARK_TEST] PASS travelled=", snappedf(travelled, 0.001),
		" radial_variation=", snappedf(maximum_radius - minimum_radius, 0.001),
		" minimum_depth=", snappedf(minimum_depth, 0.001),
		" maximum_step=", snappedf(maximum_step, 0.001),
		" maximum_speed=", snappedf(maximum_speed, 0.001),
		" maximum_acceleration=", snappedf(maximum_reported_acceleration, 0.001),
		" maximum_yaw_step_deg=", snappedf(rad_to_deg(maximum_yaw_step), 0.1),
		" state=", ambient.call("route_debug_state")
	)
	get_tree().quit()


func _verify_water_material_parity() -> void:
	var scene := get_tree().current_scene
	var water := scene.get_node_or_null("Water") as MeshInstance3D if scene else null
	var profile := scene.get_node_or_null("WebRenderProfile") as WebRenderProfile if scene else null
	var editor_material := water.material_override as ShaderMaterial if water else null
	if water == null or profile == null or editor_material == null or editor_material.shader == null:
		push_error("Water material parity test failed: scene water resources are missing.")
		get_tree().quit(1)
		return
	if editor_material.resource_path != "res://shaders/water_stable.tres":
		push_error("Water material parity test failed: editor does not use shared stable material.")
		get_tree().quit(1)
		return
	if editor_material.shader.resource_path != "res://shaders/water_web.gdshader":
		push_error("Water material parity test failed: editor still uses the legacy shader.")
		get_tree().quit(1)
		return
	var parameter_names: Array[String] = [
		"wave_texture_a",
		"wave_texture_b",
		"WATER_COL",
		"WATER2_COL",
		"FOAM_COL",
		"distortion_speed",
		"tile",
		"height",
		"wave_size",
		"wave_speed",
		"shore_fade_distance",
		"shallow_alpha",
		"deep_alpha",
	]
	var editor_values: Dictionary = {}
	for parameter_name in parameter_names:
		editor_values[parameter_name] = editor_material.get_shader_parameter(parameter_name)
	profile._apply_web_water(water)
	var browser_material := water.material_override as ShaderMaterial
	if browser_material == null or browser_material.shader != editor_material.shader:
		push_error("Water material parity test failed: Web profile selected a different shader.")
		get_tree().quit(1)
		return
	for parameter_name in parameter_names:
		if browser_material.get_shader_parameter(parameter_name) != editor_values[parameter_name]:
			push_error("Water material parity test failed: parameter differs: " + parameter_name)
			get_tree().quit(1)
			return
	var web_plane := water.mesh as PlaneMesh
	if web_plane == null or web_plane.subdivide_width > 24 or web_plane.subdivide_depth > 24:
		push_error("Water material parity test failed: Web mesh optimization was not retained.")
		get_tree().quit(1)
		return
	print(
		"[WATER_MATERIAL_PARITY] PASS material=", editor_material.resource_path,
		" shader=", editor_material.shader.resource_path,
		" web_subdivisions=", web_plane.subdivide_width, "x", web_plane.subdivide_depth
	)
	get_tree().quit()


func _hold_shark_web_capture() -> void:
	# Browser verification needs a stable frame long enough for an external
	# screenshot. Native/headless verification keeps the fast path unchanged.
	if OS.has_feature("web"):
		await get_tree().create_timer(1.5).timeout


func _clear_shark_test_troops() -> void:
	for troop in get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop):
			troop.queue_free()
	BaseTroop.invalidate_combat_lists()


func _frame_shark_test_camera(target: Vector3, size: float) -> void:
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "SharkTrapTestCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = size
	get_tree().current_scene.add_child(camera)
	camera.global_position = target + Vector3(1.65, 1.55, 2.25)
	camera.look_at(target + Vector3(0.0, 0.05, 0.0), Vector3.UP)
	camera.current = true


func _frame_ambient_shark_camera(target: Vector3, size: float) -> void:
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "AmbientSharkTestCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = size
	get_tree().current_scene.add_child(camera)
	camera.global_position = target + Vector3(0.9, 2.35, 1.7)
	camera.look_at(target, Vector3.UP)
	camera.current = true


func _save_shark_test_capture(path: String, label: String) -> bool:
	await RenderingServer.frame_post_draw
	var err := get_viewport().get_texture().get_image().save_png(path)
	if err != OK:
		push_error("Shark Trap %s capture failed: %s" % [label, error_string(err)])
		return false
	print("[SHARK_TRAP_CLIENT] capture=", label, " path=", path)
	return true


func _capture_single_ship_combat_test() -> void:
	var scene := get_tree().current_scene
	var attack := get_node_or_null("../AttackSystem")
	var controller := get_node_or_null("../MainShipController")
	var attack_plane: MeshInstance3D = scene.get_node_or_null("Island/shipPlane") as MeshInstance3D if scene else null
	if attack == null or controller == null or attack_plane == null:
		push_error("Single ship capture failed: combat nodes are missing.")
		get_tree().quit(1)
		return
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false
	_hide_capture_canvas_items(scene)
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("town_hall", 3):
		push_error("Single ship capture failed: target Town Hall did not spawn.")
		get_tree().quit(1)
		return
	_hide_single_ship_capture_overlays(scene)
	_print_runtime_grid_config(2, get_node_or_null("../BuildingSystem3"))
	mixed_test_attack_loadout()
	await get_tree().create_timer(0.5).timeout
	var ship_node: Node3D = controller.get_active_ship_node() if controller.has_method("get_active_ship_node") else null
	if ship_node == null:
		push_error("Single ship capture failed: Ship_Large is not attached.")
		get_tree().quit(1)
		return
	_frame_single_ship_camera(ship_node.global_position, attack_plane.global_position)
	var output_dir := _single_ship_capture_dir()
	DirAccess.make_dir_recursive_absolute(output_dir)
	if not await _save_single_ship_capture(output_dir.path_join("01-home.png"), "home"):
		get_tree().quit(1)
		return

	await start_test_attack()
	await get_tree().create_timer(0.75).timeout
	if not await _save_single_ship_capture(output_dir.path_join("02-approach.png"), "approach"):
		get_tree().quit(1)
		return
	var ready_wait := 0.0
	while not bool(attack._main_ship_ready_for_deployment) and ready_wait < float(attack.sail_duration) + 3.0:
		await get_tree().process_frame
		ready_wait += get_process_delta_time()
	if not bool(attack._main_ship_ready_for_deployment):
		push_error("Single ship capture failed: main ship did not reach combat shore.")
		get_tree().quit(1)
		return
	if not await _save_single_ship_capture(output_dir.path_join("03-ready.png"), "ready"):
		get_tree().quit(1)
		return

	var deployed := 0
	var offsets := [
		Vector2(-0.62, -0.10),
		Vector2(-0.30, 0.10),
		Vector2(0.0, -0.06),
		Vector2(0.30, 0.10),
		Vector2(0.62, -0.10),
	]
	var basis := attack_plane.global_transform.basis
	var axis_x := basis.x.normalized()
	var axis_z := basis.z.normalized()
	for local_offset in offsets:
		if attack._army_entries.is_empty():
			break
		attack.select_troop_group(0)
		var deploy_at: Vector3 = attack.plane_center + axis_x * local_offset.x + axis_z * local_offset.y
		if not attack._try_deploy_selected_troop(deploy_at):
			push_error("Single ship capture failed: troop deployment %d was rejected." % deployed)
			get_tree().quit(1)
			return
		deployed += 1
	if deployed < mini(5, _test_attack_troops().size()):
		push_error("Single ship capture failed: only %d troops deployed." % deployed)
		get_tree().quit(1)
		return
	await get_tree().create_timer(1.0).timeout
	if not await _save_single_ship_capture(output_dir.path_join("04-deployed.png"), "deployed"):
		get_tree().quit(1)
		return
	print("[SINGLE_SHIP_TEST] PASS deployed=", deployed, " replay_actions=", attack._manual_deploy_index, " output_dir=", output_dir)
	get_tree().quit()


func _capture_main_ship_approach_frames() -> void:
	var scene := get_tree().current_scene
	var attack := get_node_or_null("../AttackSystem")
	var controller := get_node_or_null("../MainShipController")
	if scene == null or attack == null or controller == null:
		push_error("Main ship frame capture failed: combat nodes are missing.")
		get_tree().quit(1)
		return
	if not controller.has_method("get_combat_motion_debug"):
		push_error("Main ship frame capture failed: motion telemetry is unavailable.")
		get_tree().quit(1)
		return
	if _panel:
		_panel.visible = false
		var panel_layer := _panel.get_parent()
		if panel_layer is CanvasLayer:
			(panel_layer as CanvasLayer).visible = false
	_hide_capture_canvas_items(scene)
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("town_hall", 3):
		push_error("Main ship frame capture failed: target Town Hall did not spawn.")
		get_tree().quit(1)
		return
	_hide_single_ship_capture_overlays(scene)
	mixed_test_attack_loadout()
	await get_tree().create_timer(0.25).timeout
	var initial_debug: Dictionary = controller.get_combat_motion_debug()
	var spawn_pos: Vector3 = initial_debug.get("spawn_pos", Vector3.ZERO)
	var stop_pos: Vector3 = initial_debug.get("stop_pos", Vector3.ZERO)
	_frame_main_ship_approach_camera(spawn_pos, stop_pos)
	var output_dir := _single_ship_capture_dir()
	DirAccess.make_dir_recursive_absolute(output_dir)
	if not await _save_ship_motion_frame(output_dir, 0, "home", controller):
		get_tree().quit(1)
		return

	await start_test_attack()
	var previous_position: Vector3 = controller.global_position
	var minimum_alignment := 1.0
	var straight_samples := 0
	var turning_samples := 0
	var frame_index := 1
	var reached_combat := false
	while frame_index <= 180:
		await RenderingServer.frame_post_draw
		var debug: Dictionary = controller.get_combat_motion_debug()
		var phase := String(debug.get("phase", "unknown"))
		var ship_position: Vector3 = debug.get("position", controller.global_position)
		var bow_direction: Vector3 = debug.get("bow_direction", Vector3.ZERO)
		var movement := ship_position - previous_position
		movement.y = 0.0
		var alignment := 1.0
		if movement.length_squared() > 0.000001 and bow_direction.length_squared() > 0.000001:
			alignment = bow_direction.normalized().dot(movement.normalized())
			minimum_alignment = minf(minimum_alignment, alignment)
			if phase == "straight":
				straight_samples += 1
			elif phase == "turning":
				turning_samples += 1
		var file_name := "frame-%03d-%s.png" % [frame_index, phase]
		if not _write_viewport_png(output_dir.path_join(file_name)):
			get_tree().quit(1)
			return
		print(
			"[MAIN_SHIP_FRAME] index=", frame_index,
			" phase=", phase,
			" position=", ship_position,
			" bow=", bow_direction,
			" movement=", movement,
			" alignment=", snappedf(alignment, 0.0001),
			" capture=", file_name
		)
		previous_position = ship_position
		frame_index += 1
		if phase == "combat":
			reached_combat = true
			break

	var final_debug: Dictionary = controller.get_combat_motion_debug()
	var final_position: Vector3 = final_debug.get("position", controller.global_position)
	var final_stop: Vector3 = final_debug.get("stop_pos", final_position)
	var final_long_axis: Vector3 = final_debug.get("long_axis", Vector3.ZERO)
	var expected_lateral: Vector3 = final_debug.get("lateral", Vector3.ZERO)
	var final_outward: Vector3 = final_debug.get("outward_axis", Vector3.ZERO)
	var expected_shore_normal: Vector3 = final_debug.get("shore_normal", Vector3.ZERO)
	var stop_error := final_position.distance_to(final_stop)
	var broadside_alignment := absf(final_long_axis.dot(expected_lateral))
	var shore_alignment := final_outward.dot(expected_shore_normal)
	var failures: Array[String] = []
	if not reached_combat:
		failures.append("combat pose was not reached")
	if straight_samples < 2:
		failures.append("straight approach was not sampled")
	if turning_samples < 2:
		failures.append("shoreline turn was not sampled")
	if minimum_alignment < 0.93:
		failures.append("bow diverged from movement (minimum %.4f)" % minimum_alignment)
	if stop_error > 0.02:
		failures.append("final stop error %.4f" % stop_error)
	if broadside_alignment < 0.98:
		failures.append("final broadside alignment %.4f" % broadside_alignment)
	if shore_alignment < 0.98:
		failures.append("final shore-facing alignment %.4f" % shore_alignment)
	if not failures.is_empty():
		push_error("Main ship frame capture failed: %s" % "; ".join(failures))
		get_tree().quit(1)
		return
	print(
		"[MAIN_SHIP_FRAME_TEST] PASS frames=", frame_index,
		" straight_samples=", straight_samples,
		" turning_samples=", turning_samples,
		" minimum_alignment=", snappedf(minimum_alignment, 0.0001),
		" stop_error=", snappedf(stop_error, 0.0001),
		" broadside_alignment=", snappedf(broadside_alignment, 0.0001),
		" shore_alignment=", snappedf(shore_alignment, 0.0001),
		" output_dir=", output_dir
	)
	get_tree().quit()


func _save_ship_motion_frame(output_dir: String, frame_index: int, phase: String, controller: Node) -> bool:
	await RenderingServer.frame_post_draw
	var file_name := "frame-%03d-%s.png" % [frame_index, phase]
	if not _write_viewport_png(output_dir.path_join(file_name)):
		return false
	var debug: Dictionary = controller.get_combat_motion_debug()
	print(
		"[MAIN_SHIP_FRAME] index=", frame_index,
		" phase=", phase,
		" position=", debug.get("position", Vector3.ZERO),
		" bow=", debug.get("bow_direction", Vector3.ZERO),
		" capture=", file_name
	)
	return true


func _write_viewport_png(path: String) -> bool:
	var image := get_viewport().get_texture().get_image()
	var err := image.save_png(path)
	if err != OK:
		push_error("Main ship frame capture failed for %s: %s" % [path, error_string(err)])
		return false
	return true


func _hide_single_ship_capture_overlays(scene: Node) -> void:
	for system in get_tree().get_nodes_in_group("building_systems"):
		if system.has_method("_deselect_building"):
			system.call("_deselect_building")
		var building_panel: Variant = system.get("building_panel")
		if building_panel is CanvasItem:
			(building_panel as CanvasItem).visible = false
	_hide_capture_canvas_items(scene)


func _print_runtime_grid_config(grid_index: int, system: Node) -> void:
	if system == null:
		push_error("[GRID_CONFIG] Missing BuildingSystem for grid %d" % grid_index)
		return
	print(
		"[GRID_CONFIG] index=", grid_index,
		" width=", system.get("grid_width"),
		" height=", system.get("grid_height"),
		" cell_size=", system.get("cell_size"),
		" extent_x=", system.get("grid_extent_x"),
		" extent_z=", system.get("grid_extent_z"),
		" center_x=", (system.get("grid_center") as Vector3).x,
		" center_z=", (system.get("grid_center") as Vector3).z,
		" rotation=", system.get("grid_rotation")
	)


func _single_ship_capture_dir() -> String:
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out-dir="):
			return text.get_slice("=", 1)
	return ProjectSettings.globalize_path("user://single_ship_combat")


func _save_single_ship_capture(path: String, label: String) -> bool:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var err := image.save_png(path)
	if err != OK:
		push_error("Single ship capture %s failed: %s" % [label, error_string(err)])
		return false
	print("[SINGLE_SHIP_TEST] capture=", label, " path=", path)
	return true


func _frame_single_ship_camera(home_position: Vector3, grid_position: Vector3) -> void:
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "SingleShipCaptureCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 7.2
	get_tree().current_scene.add_child(camera)
	var target := (home_position + grid_position) * 0.5
	target.y = 0.0
	camera.global_position = target + Vector3(6.4, 8.6, 7.2)
	camera.look_at(target, Vector3.UP)
	camera.current = true


func _frame_main_ship_approach_camera(spawn_position: Vector3, stop_position: Vector3) -> void:
	var old_camera := get_viewport().get_camera_3d()
	if old_camera:
		old_camera.current = false
	var camera := Camera3D.new()
	camera.name = "MainShipApproachFrameCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = maxf(6.2, spawn_position.distance_to(stop_position) + 2.2)
	get_tree().current_scene.add_child(camera)
	var target := (spawn_position + stop_position) * 0.5
	target.y = 0.0
	camera.global_position = target + Vector3(5.6, 7.8, 6.4)
	camera.look_at(target, Vector3.UP)
	camera.current = true


func _hide_capture_scene_chrome() -> void:
	for node in get_tree().get_nodes_in_group("building_systems"):
		if node is Node3D:
			(node as Node3D).visible = false
	for node_name in ["Island", "Water"]:
		var node := get_tree().current_scene.get_node_or_null(node_name) if get_tree().current_scene else null
		if node is Node3D:
			(node as Node3D).visible = false
	for canvas in get_tree().get_nodes_in_group("capture_hide_canvas"):
		if canvas is CanvasItem:
			(canvas as CanvasItem).visible = false
	for node in get_tree().get_nodes_in_group("ui"):
		if node is CanvasItem:
			(node as CanvasItem).visible = false
	var scene := get_tree().current_scene
	if scene:
		for child in scene.get_children():
			if child is CanvasLayer:
				(child as CanvasLayer).visible = false
		_hide_capture_canvas_items(scene)
	if _panel:
		_panel.visible = false
		var layer := _panel.get_parent()
		if layer is CanvasLayer:
			(layer as CanvasLayer).visible = false
		elif layer is CanvasItem:
			(layer as CanvasItem).visible = false


func _hide_capture_canvas_items(node: Node) -> void:
	if node is CanvasItem:
		(node as CanvasItem).visible = false
	for child in node.get_children():
		if child is Node:
			_hide_capture_canvas_items(child as Node)


func _layout_demon_king_color_capture() -> void:
	if not is_instance_valid(_demon_color_preview_root):
		return
	var positions: Dictionary = {
		"DemonKingPreview_Blue": Vector3(-1.05, 0.0, 0.0),
		"DemonKingPreview_Purple": Vector3(0.0, 0.0, 0.0),
		"DemonKingPreview_Gold": Vector3(1.05, 0.0, 0.0),
		"Label_Blue": Vector3(-1.05, 1.65, 0.0),
		"Label_Purple": Vector3(0.0, 1.65, 0.0),
		"Label_Gold": Vector3(1.05, 1.65, 0.0),
	}
	for child in _demon_color_preview_root.get_children():
		if positions.has(child.name):
			child.position = positions[child.name]
		if child is Node3D:
			var node_3d := child as Node3D
			if child.name.begins_with("DemonKingPreview_"):
				node_3d.rotation_degrees = Vector3(0.0, 0.0, 0.0)
				node_3d.scale = Vector3.ONE * 0.24
			elif child is Label3D:
				node_3d.rotation_degrees = Vector3(0.0, 0.0, 0.0)


func _frame_demon_king_color_camera() -> void:
	var camera := Camera3D.new()
	camera.name = "DemonKingCaptureCamera"
	var parent: Node = get_tree().current_scene if get_tree().current_scene else self
	parent.add_child(camera)
	var center := Vector3(0.0, 0.76, 0.0)
	camera.global_position = Vector3(0.0, 0.9, 4.0)
	camera.look_at(center, Vector3.UP)
	camera.fov = 35.0
	camera.current = true


func _populate_spawn_list() -> void:
	if not _spawn_list:
		return
	var ids: Array[String] = _active_building_ids()
	if ids.is_empty():
		call_deferred("_populate_spawn_list")
		return
	for child in _spawn_list.get_children():
		child.queue_free()
	for building_id in ids:
		var bs: Node = _building_system_for_building(building_id)
		if not bs:
			continue
		var def: Dictionary = bs.building_defs.get(building_id, {})
		if def.get("no_shop", false):
			continue
		_add_spawn_row(building_id, def)


func _add_spawn_row(building_id: String, def: Dictionary) -> void:
	var box := VBoxContainer.new()
	box.set_meta("building_id", building_id)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 4)
	_spawn_list.add_child(box)

	var label := Label.new()
	label.text = String(def.get("name", building_id))
	label.add_theme_font_size_override("font_size", 16)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(label)

	var levels := HBoxContainer.new()
	levels.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	levels.add_theme_constant_override("separation", 6)
	box.add_child(levels)

	var max_level: int = _max_level_for_def(def)
	for level in range(1, max_level + 1):
		var btn := Button.new()
		btn.text = str(level)
		btn.custom_minimum_size = Vector2(42, 38)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 16)
		btn.pressed.connect(Callable(self, "spawn_building_level").bind(building_id, level))
		levels.add_child(btn)


func _add_ship_spawn_row() -> void:
	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 4)
	_spawn_list.add_child(box)

	var label := Label.new()
	label.text = "Ship"
	label.add_theme_font_size_override("font_size", 16)
	box.add_child(label)

	var levels := HBoxContainer.new()
	levels.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	levels.add_theme_constant_override("separation", 6)
	box.add_child(levels)

	for level in range(1, _max_test_ship_level() + 1):
		var btn := Button.new()
		btn.text = str(level)
		btn.custom_minimum_size = Vector2(42, 38)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 16)
		btn.pressed.connect(Callable(self, "spawn_ship_level").bind(level))
		levels.add_child(btn)


func spawn_ship_level(target_level: int) -> void:
	_test_attack_ship_level = clampi(target_level, 1, _max_test_ship_level())
	_refresh_test_ship_row()
	load_test_attack_army()


func spawn_building_level(building_id: String, target_level: int) -> bool:
	if building_id == "":
		_set_status("Choose a building first.")
		return false
	var bs: Node = _building_system_for_building(building_id)
	if not bs:
		_set_status("No grid found for " + building_id + ".")
		return false
	if not bs.building_defs.has(building_id):
		_set_status("Unknown building: " + building_id)
		return false
	var def: Dictionary = bs.building_defs[building_id]
	var grid_pos: Vector2i = _random_free_grid_pos(bs, def)
	if grid_pos == Vector2i(-1, -1):
		_set_status("No free place for " + building_id + ". Clear space or reset.")
		return false
	bs._spawn_building_locally(building_id, grid_pos, def, -1)
	await get_tree().process_frame
	var b: Dictionary = _last_building_at(bs, building_id, grid_pos)
	if b.is_empty():
		_set_status("Spawn failed for " + building_id + ".")
		return false
	target_level = clampi(target_level, 1, _max_level_for_def(def))
	await _set_building_level_for_test(bs, b, def, target_level)
	if building_id == "port":
		_configure_test_ship(bs, b, mini(target_level, 3))
	bs._sync_react_buildings()
	bs._select_building(b)
	_set_status("Spawned %s level %d." % [def.get("name", building_id), target_level])
	return true


func duplicate_selected_building() -> void:
	var source_bs: Node = _active_building_system()
	if not source_bs or source_bs.selected_building.is_empty():
		_set_status("Click/select a building first, then press Ctrl+D.")
		return
	var source: Dictionary = source_bs.selected_building
	var building_id := String(source.get("id", ""))
	if building_id == "" or not source_bs.building_defs.has(building_id):
		_set_status("Selected building cannot be duplicated.")
		return
	var target_bs: Node = _building_system_for_building(building_id)
	if not target_bs or not target_bs.building_defs.has(building_id):
		_set_status("No target grid for " + building_id + ".")
		return
	var def: Dictionary = target_bs.building_defs[building_id]
	var grid_pos: Vector2i = _random_free_grid_pos_near(target_bs, def, source.get("grid_pos", Vector2i.ZERO))
	if grid_pos == Vector2i(-1, -1):
		_set_status("No free place to duplicate " + building_id + ".")
		return
	target_bs._spawn_building_locally(building_id, grid_pos, def, -1)
	await get_tree().process_frame
	var clone: Dictionary = _last_building_at(target_bs, building_id, grid_pos)
	if clone.is_empty():
		_set_status("Duplicate failed for " + building_id + ".")
		return
	var level: int = int(source.get("level", 1))
	await _set_building_level_for_test(target_bs, clone, def, level)
	_copy_building_runtime_meta(source, clone)
	if building_id == "port" and target_bs.has_method("_spawn_port_ship"):
		target_bs._spawn_port_ship(clone)
	target_bs._sync_react_buildings()
	target_bs._select_building(clone)
	_set_status("Duplicated %s level %d." % [def.get("name", building_id), level])


func build_working_village() -> void:
	_build_generation += 1
	var generation := _build_generation
	reset_sandbox(false)
	await get_tree().process_frame
	if generation != _build_generation:
		return
	randomize()

	for item in _core_layout():
		var building_id := String(item.id)
		var bs := _building_system_for_building(building_id)
		if not bs:
			continue
		if not bs.building_defs.has(building_id):
			continue
		var def: Dictionary = bs.building_defs[building_id]
		var grid_pos: Vector2i = _random_free_grid_pos(bs, def)
		if grid_pos == Vector2i(-1, -1):
			grid_pos = item.pos
		bs._spawn_building_locally(building_id, grid_pos, def, -1)
		await get_tree().process_frame
		if generation != _build_generation:
			return
		var b: Dictionary = _last_building_at(bs, building_id, grid_pos)
		if b.is_empty():
			continue
		await _set_random_building_level(bs, b, def)
		if generation != _build_generation or not is_instance_valid(b.get("node", null)):
			return
		if building_id == "port":
			_configure_test_ship(bs, b, 3)
		elif building_id == "tombstone":
			bs._spawn_tombstone_skeletons(b, int(b.get("level", 1)))

	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("resources" in bs):
			continue
		bs.resources = {"gold": 10000, "wood": 10000, "ore": 10000}
		if bs.has_method("_update_resource_ui"):
			bs._update_resource_ui()
		if bs.has_method("_send_resource_caps"):
			bs._send_resource_caps()
		if bs.has_method("_sync_react_buildings"):
			bs._sync_react_buildings()

	_select_first_town_hall()
	_set_status("Random working village with random levels built.")


func build_max_village_for_town_hall(
	th_level: int,
	deterministic_seed: int = 0
) -> void:
	th_level = clampi(th_level, 1, _max_supported_town_hall_level())
	_build_generation += 1
	var generation := _build_generation
	reset_sandbox(false)
	await get_tree().process_frame
	if generation != _build_generation:
		return

	var spawned_count: int = 0
	if deterministic_seed == 0:
		randomize()
	else:
		seed(deterministic_seed)
	for building_id in _max_village_build_order():
		var bs := _building_system_for_building(building_id)
		if not bs or not ("building_defs" in bs) or not bs.building_defs.has(building_id):
			continue
		var max_count: int = _max_building_count_for_th(building_id, th_level)
		if max_count <= 0:
			continue
		var def: Dictionary = bs.building_defs[building_id]
		var target_level: int = _target_building_level_for_th(building_id, def, th_level)
		for _i in range(max_count):
			var grid_pos: Vector2i = _random_free_grid_pos(bs, def)
			if grid_pos == Vector2i(-1, -1):
				_set_status("TH%d max village stopped: no free place for %s." % [th_level, building_id])
				_sync_all_building_systems()
				_select_first_town_hall()
				return
			bs._spawn_building_locally(building_id, grid_pos, def, -1)
			await get_tree().process_frame
			if generation != _build_generation:
				return
			var b: Dictionary = _last_building_at(bs, building_id, grid_pos)
			if b.is_empty():
				continue
			_set_building_level_immediate(bs, b, def, target_level)
			if bs.has_method("_apply_building_level_visuals_for_test"):
				bs._apply_building_level_visuals_for_test(b, def)
			if generation != _build_generation or not is_instance_valid(b.get("node", null)):
				return
			if building_id == "port":
				_configure_test_ship(bs, b, mini(target_level, 3))
			elif building_id == "tombstone":
				bs._spawn_tombstone_skeletons(b, int(b.get("level", 1)))
			spawned_count += 1

	_give_test_resources()
	_sync_all_building_systems()
	_select_first_town_hall()
	_set_status("Built max TH%d village: %d buildings." % [th_level, spawned_count])


func _capture_th6_village() -> void:
	var town_hall_level: int = _max_supported_town_hall_level()
	await build_max_village_for_town_hall(town_hall_level)
	await get_tree().create_timer(1.25).timeout

	var expected_counts: Dictionary = {}
	for building_id in _max_village_build_order():
		var expected_count: int = _max_building_count_for_th(building_id, town_hall_level)
		if expected_count > 0:
			expected_counts[building_id] = expected_count
	var actual_counts: Dictionary = {}
	var total_buildings: int = 0
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("placed_buildings" in bs):
			continue
		for building: Dictionary in bs.placed_buildings:
			var building_id: String = str(building.get("id", ""))
			if not expected_counts.has(building_id):
				continue
			actual_counts[building_id] = int(actual_counts.get(building_id, 0)) + 1
			total_buildings += 1
			var expected_level: int = _target_building_level_for_th(
				building_id,
				bs.building_defs.get(building_id, {}),
				town_hall_level
			)
			if int(building.get("level", 0)) != expected_level:
				push_error("TH6 capture failed: %s expected level %d, got %d." % [
					building_id,
					expected_level,
					int(building.get("level", 0)),
				])
				get_tree().quit(1)
				return

	for building_id: String in expected_counts:
		if int(actual_counts.get(building_id, 0)) != int(expected_counts[building_id]):
			push_error("TH6 capture failed: %s expected count %d, got %d." % [
				building_id,
				int(expected_counts[building_id]),
				int(actual_counts.get(building_id, 0)),
			])
			get_tree().quit(1)
			return

	var town_hall := _building_system_for_building("town_hall")
	var town_hall_visual_found: bool = false
	if town_hall and "placed_buildings" in town_hall:
		for building: Dictionary in town_hall.placed_buildings:
			if str(building.get("id", "")) != "town_hall":
				continue
			var building_node: Node = building.get("node", null)
			if is_instance_valid(building_node):
				town_hall_visual_found = not building_node.find_children("*", "MeshInstance3D", true, false).is_empty()
			break
	if not town_hall_visual_found:
		push_error("TH6 capture failed: Town Hall 6 has no rendered mesh.")
		get_tree().quit(1)
		return

	if DisplayServer.get_name() == "headless":
		print("[MAX_VILLAGE_TEST] PASS th=%d buildings=%d ship_capacity=%d" % [
			town_hall_level,
			total_buildings,
			_ship_capacity_for_level(_max_test_ship_level()),
		])
		get_tree().quit()
		return

	var scene := get_tree().current_scene
	if _panel:
		_panel.visible = false
		var layer := _panel.get_parent()
		if layer is CanvasLayer:
			(layer as CanvasLayer).visible = false
	if scene:
		_hide_capture_canvas_items(scene)
	await RenderingServer.frame_post_draw
	var output_path := ProjectSettings.globalize_path("user://th6-village.png")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			output_path = text.get_slice("=", 1)
	var err := get_viewport().get_texture().get_image().save_png(output_path)
	if err != OK:
		push_error("TH6 capture failed: %s" % error_string(err))
		get_tree().quit(1)
		return
	print("[MAX_VILLAGE_TEST] PASS th=%d buildings=%d ship_capacity=%d capture=%s" % [
		town_hall_level,
		total_buildings,
		_ship_capacity_for_level(_max_test_ship_level()),
		output_path,
	])
	get_tree().quit()


func _verify_test_scene_mixed_combat() -> void:
	await get_tree().process_frame
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("town_hall", 3):
		push_error("[TEST_SCENE_MIXED_COMBAT] target Town Hall did not spawn")
		get_tree().quit(1)
		return

	mixed_test_attack_loadout()
	var expected_troops: int = _test_attack_troops().size()
	await start_test_attack()
	var attack: Node = get_node_or_null("../AttackSystem")
	if attack == null:
		push_error("[TEST_SCENE_MIXED_COMBAT] AttackSystem is missing")
		get_tree().quit(1)
		return

	var ready_wait: float = 0.0
	var ready_timeout: float = float(attack.get("sail_duration")) + 4.0
	while not bool(attack.get("_main_ship_ready_for_deployment")) and ready_wait < ready_timeout:
		await get_tree().process_frame
		ready_wait += get_process_delta_time()
	if not bool(attack.get("_main_ship_ready_for_deployment")):
		push_error("[TEST_SCENE_MIXED_COMBAT] Main Ship never reached the attack shore")
		get_tree().quit(1)
		return

	var deployed: int = 0
	while not attack.get("_army_entries").is_empty():
		attack.select_troop_group(0)
		var offset: Vector3 = attack._get_lateral_dir() * (float(deployed % 5) - 2.0) * 0.08
		if not attack._try_deploy_selected_troop(attack.plane_center + offset):
			break
		deployed += 1
	if deployed != expected_troops:
		push_error("[TEST_SCENE_MIXED_COMBAT] expected %d deployments, got %d" % [expected_troops, deployed])
		get_tree().quit(1)
		return

	var spawn_wait: float = float(attack.get("troop_spawn_delay")) * float(deployed) + 1.0
	await get_tree().create_timer(spawn_wait).timeout
	var live_troops: int = get_tree().get_nodes_in_group("troops").size()
	if live_troops < deployed:
		push_error("[TEST_SCENE_MIXED_COMBAT] only %d/%d troops reached the scene" % [live_troops, deployed])
		get_tree().quit(1)
		return
	print("[TEST_SCENE_MIXED_COMBAT] PASS roster=%d deployed=%d live=%d" % [
		expected_troops,
		deployed,
		live_troops,
	])
	get_tree().quit()


func _verify_test_ship_abilities() -> void:
	await get_tree().process_frame
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("town_hall", 3):
		push_error("[TEST_SHIP_ABILITIES] target Town Hall did not spawn")
		get_tree().quit(1)
		return

	clear_test_attack_loadout()
	_test_attack_ship_level = _max_test_ship_level()
	_attack_counts["Knight"] = 1
	_attack_levels["Knight"] = _test_attack_max_level("Knight")
	_refresh_attack_row("Knight")
	_refresh_test_ship_row()
	await start_test_attack()

	var attack: Node = get_node_or_null("../AttackSystem")
	var bs: Node = _test_combat_building_system()
	if not is_instance_valid(attack) or not is_instance_valid(bs):
		push_error("[TEST_SHIP_ABILITIES] combat systems are missing")
		get_tree().quit(1)
		return
	var ready_wait := 0.0
	var ready_timeout := float(attack.get("sail_duration")) + 4.0
	while not _test_attack_is_ready() and ready_wait < ready_timeout:
		await get_tree().process_frame
		ready_wait += get_process_delta_time()
	if not _test_attack_is_ready():
		push_error("[TEST_SHIP_ABILITIES] Main Ship never became ready")
		get_tree().quit(1)
		return

	var cannon: BSCannon = bs.get("_cannon")
	var rally: BSRally = bs.get("_rally")
	var medkit: BSMedkit = bs.get("_medkit")
	var freeze: BSFreezeSpell = bs.get("_freeze")
	var rage: BSRageSpell = bs.get("_rage")
	var barrel: BSSkeletonBarrel = bs.get("_skeleton_barrel")
	var expected_energy := _ship_energy_for_level(_test_attack_ship_level)
	if (
		cannon == null
		or cannon._cannon_energy != expected_energy
		or rally == null
		or medkit == null
		or not medkit.is_unlocked()
		or freeze == null
		or not freeze.is_unlocked()
		or rage == null
		or not rage.is_unlocked()
		or barrel == null
		or not barrel.is_unlocked()
	):
		push_error("[TEST_SHIP_ABILITIES] level 6 energy/unlocks are incorrect")
		get_tree().quit(1)
		return

	var target: Dictionary = {}
	var target_building_system: Node = null
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		var candidate_bs: Node = raw_bs
		for building in candidate_bs.get("placed_buildings"):
			if str(building.get("id", "")) == "town_hall":
				target = building
				target_building_system = candidate_bs
				break
		if not target.is_empty():
			break
	if target.is_empty():
		push_error("[TEST_SHIP_ABILITIES] target building is missing")
		get_tree().quit(1)
		return

	var target_node: Node3D = target.get("node", null)
	var target_position := target_node.global_position
	var camera := get_viewport().get_camera_3d()
	if camera == null or not is_instance_valid(target_building_system):
		push_error("[TEST_SHIP_ABILITIES] barrel targeting prerequisites are missing")
		get_tree().quit(1)
		return
	var direct_barrel_pick: Dictionary = bs.call(
		"_find_ship_barrel_target_from_screen",
		camera.unproject_position(target_position)
	)
	if (
		direct_barrel_pick.get("building", {}).get("node", null)
		!= target_node
	):
		push_error("[TEST_SHIP_ABILITIES] direct barrel click did not select target")
		get_tree().quit(1)
		return

	var target_local: Vector3 = target_building_system.to_local(target_position)
	var test_cell_size: float = float(target_building_system.get("cell_size"))
	var ground_local := Vector3.INF
	for offset in [
		Vector3(test_cell_size * 6.0, 0.0, 0.0),
		Vector3(-test_cell_size * 6.0, 0.0, 0.0),
		Vector3(0.0, 0.0, test_cell_size * 6.0),
		Vector3(0.0, 0.0, -test_cell_size * 6.0),
	]:
		var candidate_ground: Vector3 = target_local + offset
		candidate_ground.y = float(target_building_system.get("grid_y"))
		if (
			target_building_system.call("_is_local_inside_grid", candidate_ground)
			and target_building_system.call(
				"_find_building_at",
				target_building_system.call("_local_to_grid", candidate_ground)
			).is_empty()
		):
			ground_local = candidate_ground
			break
	if ground_local == Vector3.INF:
		push_error("[TEST_SHIP_ABILITIES] no free ground point for barrel test")
		get_tree().quit(1)
		return
	var ground_world: Vector3 = target_building_system.to_global(ground_local)
	ground_world.y = float(target_building_system.get("grid_y"))
	var ground_barrel_pick: Dictionary = bs.call(
		"_find_ship_barrel_target_from_screen",
		camera.unproject_position(ground_world)
	)
	var resolved_ground: Vector3 = ground_barrel_pick.get("position", Vector3.INF)
	if (
		not ground_barrel_pick.get("building", {}).is_empty()
		or resolved_ground == Vector3.INF
		or Vector2(resolved_ground.x, resolved_ground.z).distance_to(
			Vector2(ground_world.x, ground_world.z)
		) > 0.02
	):
		push_error("[TEST_SHIP_ABILITIES] distant barrel click snapped to a building")
		get_tree().quit(1)
		return

	var hp_before := int(target.get("hp", 0))
	cannon._fire_ship_cannon(target)
	if cannon._cannon_energy != expected_energy - 1:
		push_error("[TEST_SHIP_ABILITIES] cannon did not consume energy")
		get_tree().quit(1)
		return
	var cannon_wait := 0.0
	while int(target.get("hp", hp_before)) == hp_before and cannon_wait < 10.0:
		await get_tree().process_frame
		cannon_wait += get_process_delta_time()
	if int(target.get("hp", hp_before)) >= hp_before:
		push_error("[TEST_SHIP_ABILITIES] cannon did not damage its target")
		get_tree().quit(1)
		return

	reset_test_ship_abilities(false)
	if not rally._drop_rally(target_position):
		push_error("[TEST_SHIP_ABILITIES] rally grenade could not be launched")
		get_tree().quit(1)
		return
	reset_test_ship_abilities(false)
	if not medkit._drop_medkit(target_position):
		push_error("[TEST_SHIP_ABILITIES] medkit could not be placed")
		get_tree().quit(1)
		return
	reset_test_ship_abilities(false)
	if not freeze._drop_freeze(target_position):
		push_error("[TEST_SHIP_ABILITIES] freeze orb could not be launched")
		get_tree().quit(1)
		return
	reset_test_ship_abilities(false)
	var rage_cost := rage.energy_cost()
	rage._enter_rage_mode()
	if not rage._rage_mode:
		push_error("[TEST_SHIP_ABILITIES] rage targeting mode did not activate")
		get_tree().quit(1)
		return
	var rage_click := InputEventMouseButton.new()
	rage_click.button_index = MOUSE_BUTTON_LEFT
	rage_click.position = camera.unproject_position(ground_world)
	rage_click.pressed = true
	bs._unhandled_input(rage_click)
	if (
		rage._rage_uses != 1
		or rage._rage_mode
		or cannon._cannon_energy != expected_energy - rage_cost
		or rage._active_zones.is_empty()
		or not is_instance_valid(rage._active_zones[0].get("root", null))
	):
		push_error("[TEST_SHIP_ABILITIES] rage browser-style ground click was not applied")
		get_tree().quit(1)
		return
	reset_test_ship_abilities(false)
	if not rage._drop_rage(target_position):
		push_error("[TEST_SHIP_ABILITIES] rage field could not be placed")
		get_tree().quit(1)
		return
	var rage_root: Node3D = (
		rage._active_zones[0].get("root", null)
		if not rage._active_zones.is_empty()
		else null
	)
	if not is_instance_valid(rage_root):
		push_error("[TEST_SHIP_ABILITIES] rage field visual is missing")
		get_tree().quit(1)
		return
	if rage_root.global_position.y < bs.grid_y + 0.07:
		push_error("[TEST_SHIP_ABILITIES] rage field is below the web-safe ground offset")
		get_tree().quit(1)
		return
	var rage_disk_found := false
	for rage_child in rage_root.get_children():
		if not rage_child is MeshInstance3D:
			continue
		var rage_mesh_instance := rage_child as MeshInstance3D
		if rage_mesh_instance.mesh == null:
			push_error("[TEST_SHIP_ABILITIES] rage field mesh is missing")
			get_tree().quit(1)
			return
		if rage_mesh_instance.mesh is CylinderMesh:
			rage_disk_found = true
			if rage_mesh_instance.mesh.get_aabb().size.y > 0.01:
				push_error("[TEST_SHIP_ABILITIES] rage field disk is not flat")
				get_tree().quit(1)
				return
		var rage_material := (
			rage_mesh_instance.material_override
			as StandardMaterial3D
		)
		if rage_material == null or rage_material.no_depth_test:
			push_error("[TEST_SHIP_ABILITIES] rage field ignores scene depth")
			get_tree().quit(1)
			return
	if not rage_disk_found:
		push_error("[TEST_SHIP_ABILITIES] rage field lacks a web-compatible disk")
		get_tree().quit(1)
		return
	reset_test_ship_abilities(false)
	if not barrel.fire_at_building(target):
		push_error("[TEST_SHIP_ABILITIES] skeleton barrel could not be launched")
		get_tree().quit(1)
		return
	reset_test_ship_abilities(false)

	if _test_ship_ability_buttons.size() != TEST_SHIP_ABILITY_ORDER.size():
		push_error("[TEST_SHIP_ABILITIES] HUD does not expose every ability")
		get_tree().quit(1)
		return
	_refresh_test_ship_ability_hud()
	if not _test_ship_energy_label.text.contains(str(expected_energy)):
		push_error("[TEST_SHIP_ABILITIES] HUD energy label is stale")
		get_tree().quit(1)
		return

	if is_instance_valid(_panel):
		_panel.visible = false
	await get_tree().process_frame
	await get_tree().process_frame
	var capture_path := "headless-renderer"
	var capture_image: Image = null
	if DisplayServer.get_name() != "headless":
		var viewport_texture := get_viewport().get_texture()
		capture_image = (
			viewport_texture.get_image() if viewport_texture != null else null
		)
	if capture_image != null and not capture_image.is_empty():
		capture_path = ProjectSettings.globalize_path(
			"user://test-main-ship-abilities.png"
		)
		var capture_error := capture_image.save_png(capture_path)
		if capture_error != OK:
			push_error("[TEST_SHIP_ABILITIES] screenshot failed: %s" % (
				error_string(capture_error)
			))
			get_tree().quit(1)
			return
	print("[TEST_SHIP_ABILITIES] PASS energy=%d abilities=%d capture=%s" % [
		expected_energy,
		_test_ship_ability_buttons.size(),
		capture_path,
	])
	get_tree().quit()


func _change_attack_count(troop_name: String, delta: int) -> void:
	var current: int = int(_attack_counts.get(troop_name, 0))
	var next_count: int = maxi(0, current + delta)
	if delta > 0:
		var next_slots: int = _selected_attack_slots() + _attack_troop_slot_cost(troop_name)
		if next_slots > _ship_capacity_for_level(_test_attack_ship_level):
			_set_status("Main Ship is full. Raise its level or remove another troop.")
			return
	_attack_counts[troop_name] = next_count
	_refresh_attack_row(troop_name)
	_refresh_test_ship_row()


func _change_attack_level(troop_name: String, delta: int) -> void:
	var max_level: int = _test_attack_max_level(troop_name)
	var current: int = int(_attack_levels.get(troop_name, max_level))
	_attack_levels[troop_name] = clampi(current + delta, 1, max_level)
	_refresh_attack_row(troop_name)


func _refresh_attack_row(troop_name: String) -> void:
	var count_label: Label = _attack_count_labels.get(troop_name, null)
	if count_label:
		count_label.text = str(int(_attack_counts.get(troop_name, 0)))
	var level_label: Label = _attack_level_labels.get(troop_name, null)
	if level_label:
		level_label.text = "L%d" % int(_attack_levels.get(troop_name, 1))


func clear_test_attack_loadout() -> void:
	for troop_name in _test_attack_troops():
		_attack_counts[troop_name] = 0
		_refresh_attack_row(troop_name)
	_refresh_test_ship_row()
	_set_status("Attack loadout cleared.")


func mixed_test_attack_loadout() -> void:
	_test_attack_ship_level = _max_test_ship_level()
	for troop_name in _test_attack_troops():
		_attack_counts[troop_name] = 1
		_refresh_attack_row(troop_name)
	_refresh_test_ship_row()
	_set_status("Mixed attack loadout: one of each troop.")


func start_test_attack() -> void:
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("enter_attack_mode"):
		_set_status("AttackSystem not found.")
		return
	var fleet: Array = _build_test_attack_fleet()
	if fleet.is_empty():
		_set_status("Choose at least one attacker.")
		return
	if not _load_test_attack_army(false):
		return
	var warmup_started := Time.get_ticks_msec()
	var warmup_script: Script = load("res://scripts/warmup.gd")
	if warmup_script != null:
		var warmup: Node = warmup_script.start_combat_warmup(get_parent())
		if warmup != null and is_instance_valid(warmup):
			_set_status("Combat warmup running - see [WARMUP_PROFILE] logs.")
			await warmup.finished
	print("[TestHarness] combat_warmup_elapsed_ms=", Time.get_ticks_msec() - warmup_started)
	_prepare_test_battle(fleet)
	attack.enter_attack_mode(fleet)
	var total_troops: int = 0
	for ship in fleet:
		for troop_name in ship.get("troops", []):
			if troop_name != "_SLOT_FILLER_":
				total_troops += 1
	_set_status("Main ship approaching with %d troops. Select a unit and click the attack grid." % total_troops)


func _prepare_test_battle(fleet: Array) -> void:
	var now_sec := Time.get_ticks_msec() / 1000.0
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		var bs: Node = raw_bs
		if not is_instance_valid(bs):
			continue
		bs.set("is_viewing_enemy", true)
		var battle: BSBattle = bs.get("_battle")
		if battle == null:
			continue
		battle._replay_active = false
		battle._victory_declared = false
		battle._battle_timer = 0.0
		battle._battle_timer_active = bool(bs.get("create_ui"))
		battle._battle_start_time = now_sec
		battle._saved_fleet = fleet.duplicate(true)
		battle._battle_replay.clear()
		battle._had_troops = false
		battle._skeleton_respawn_timer = 0.0
		battle.enemy_info = {
			"id": "test-sandbox",
			"name": "Test Sandbox",
			"battle_session_id": "test-local",
		}
	reset_test_ship_abilities(false)
	_refresh_test_ship_ability_hud()


func load_test_attack_army() -> void:
	_load_test_attack_army(true)


func _load_test_attack_army(report_status: bool) -> bool:
	var fleet: Array = _build_test_attack_fleet()
	if fleet.is_empty():
		if report_status:
			_set_status("Choose at least one troop to load.")
		return false
	var main_ship: Dictionary = fleet[0]
	var controller: Node = get_node_or_null("../MainShipController")
	if not is_instance_valid(controller):
		if report_status:
			_set_status("MainShipController not found.")
		return false
	var troops: Array = main_ship.get("troops", []).duplicate(true)
	controller.set_meta("ship_level", int(main_ship.get("level", _test_attack_ship_level)))
	controller.set_meta("ship_capacity", int(main_ship.get("capacity", troops.size())))
	controller.set_meta("ship_troops", troops)
	controller.set_meta("ship_troops_template", troops.duplicate(true))
	_apply_test_troop_levels()
	if report_status:
		_set_status("Loaded %d occupied slots into Main Ship level %d." % [
			troops.size(),
			_test_attack_ship_level,
		])
	return true


func run_mixed_fps_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_try_deploy_selected_troop"):
		_set_status("AttackSystem does not support automatic FPS test deployment.")
		return

	_fps_profile_active = true
	Engine.time_scale = 1.0
	print("[FPS_PROFILE] start scenario=isolated_town_hall_mixed_x1 idle_seconds=", FPS_PROFILE_IDLE_SECONDS,
		" combat_seconds=", FPS_PROFILE_COMBAT_SECONDS)
	_set_status("FPS profile: building isolated Town Hall target...")
	reset_sandbox()
	await get_tree().process_frame
	var target_spawned: bool = await spawn_building_level("town_hall", 1)
	if not target_spawned:
		_set_status("FPS profile failed: Town Hall target did not spawn.")
		_fps_profile_active = false
		return
	await get_tree().create_timer(FPS_PROFILE_SETTLE_SECONDS).timeout

	_set_status("FPS profile: measuring idle baseline...")
	var idle_metrics: Dictionary = await _sample_fps_profile("idle", FPS_PROFILE_IDLE_SECONDS)

	mixed_test_attack_loadout()
	_set_status("FPS profile: warming combat assets...")
	await start_test_attack()
	var ship_wait: float = 0.0
	while not bool(attack._main_ship_ready_for_deployment) and ship_wait < float(attack.sail_duration) + 2.0:
		await get_tree().process_frame
		ship_wait += get_process_delta_time()
	var deployed_count: int = 0
	while not attack._army_entries.is_empty():
		attack.select_troop_group(0)
		var offset: Vector3 = attack._get_lateral_dir() * (float(deployed_count % 5) - 2.0) * 0.08
		if not attack._try_deploy_selected_troop(attack.plane_center + offset):
			break
		deployed_count += 1
	print("[FPS_PROFILE] auto_deploy count=", deployed_count, " position=", attack.plane_center)
	if deployed_count == 0:
		_set_status("FPS profile failed: automatic troop deployment was rejected.")
		_fps_profile_active = false
		return

	var deploy_wait: float = float(attack.troop_spawn_delay) * 7.0 + FPS_PROFILE_SETTLE_SECONDS
	print("[FPS_PROFILE] deploy_wait seconds=", deploy_wait)
	await get_tree().create_timer(deploy_wait).timeout
	_set_status("FPS profile: measuring mixed combat...")
	var combat_metrics: Dictionary = await _sample_fps_profile("combat", FPS_PROFILE_COMBAT_SECONDS)

	var idle_avg: float = float(idle_metrics.get("avg_fps", 0.0))
	var combat_avg: float = float(combat_metrics.get("avg_fps", 0.0))
	var idle_median: float = float(idle_metrics.get("median_fps", 0.0))
	var combat_median: float = float(combat_metrics.get("median_fps", 0.0))
	var drop_pct: float = 0.0
	if idle_median > 0.0:
		drop_pct = maxf(0.0, (idle_median - combat_median) / idle_median * 100.0)
	print("[FPS_PROFILE] summary idle_avg=%.1f idle_median=%.1f idle_min=%.1f idle_p95_frame_ms=%.2f idle_max_frame_ms=%.2f" % [
		idle_avg,
		idle_median,
		float(idle_metrics.get("min_fps", 0.0)),
		float(idle_metrics.get("p95_frame_ms", 0.0)),
		float(idle_metrics.get("max_frame_ms", 0.0)),
	])
	print("[FPS_PROFILE] summary combat_avg=%.1f combat_median=%.1f combat_min=%.1f combat_p95_frame_ms=%.2f combat_max_frame_ms=%.2f drop_pct=%.1f" % [
		combat_avg,
		combat_median,
		float(combat_metrics.get("min_fps", 0.0)),
		float(combat_metrics.get("p95_frame_ms", 0.0)),
		float(combat_metrics.get("max_frame_ms", 0.0)),
		drop_pct,
	])
	_set_status("FPS done: idle median %.1f, combat median %.1f, drop %.1f%%. See [FPS_PROFILE]." % [idle_median, combat_median, drop_pct])
	_fps_profile_active = false
	if OS.get_cmdline_user_args().has("--auto-fps-profile"):
		await get_tree().process_frame
		get_tree().quit()


func _prepare_automated_profile_ui() -> void:
	if is_instance_valid(_panel):
		_panel.visible = false
	if is_instance_valid(_test_ship_ability_hud):
		_test_ship_ability_hud.visible = false
	_test_ship_ability_refresh_elapsed = 0.0


func run_knight_swarm_fps_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_try_deploy_selected_troop"):
		_set_status("AttackSystem does not support automatic FPS test deployment.")
		return

	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	var profile_args: PackedStringArray = OS.get_cmdline_user_args()
	var profile_troop_name := "Knight"
	for argument in profile_args:
		if argument.begins_with("--swarm-profile-troop="):
			profile_troop_name = argument.trim_prefix("--swarm-profile-troop=")
			break
	if not TEST_ATTACK_PREFERRED_ORDER.has(profile_troop_name):
		push_error(
			"[KNIGHT_SWARM_PROFILE] unsupported troop=%s"
			% profile_troop_name
		)
		_fps_profile_active = false
		return
	var full_base_profile: bool = profile_args.has("--swarm-profile-full-base")
	print(
		"[KNIGHT_SWARM_PROFILE] start count=",
		KNIGHT_SWARM_PROFILE_COUNT,
		" troop=",
		profile_troop_name,
		" full_base=",
		full_base_profile
	)
	await _await_profile_background_warmup()
	if full_base_profile:
		_set_status("Swarm profile: building maximum TH6 village...")
		await build_max_village_for_town_hall(6)
	else:
		_set_status("Swarm profile: building isolated target...")
		reset_sandbox()
		await get_tree().process_frame
		if not await spawn_building_level("town_hall", 6):
			_set_status("Swarm profile failed: Town Hall target did not spawn.")
			_fps_profile_active = false
			return
	var profile_target: Dictionary = {}
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		for building in raw_bs.get("placed_buildings"):
			if str(building.get("id", "")) == "town_hall":
				profile_target = building
				break
		if not profile_target.is_empty():
			break
	if profile_target.is_empty():
		_set_status("Knight swarm profile failed: Town Hall target data is missing.")
		_fps_profile_active = false
		return
	profile_target["max_hp"] = 50000000
	profile_target["hp"] = 50000000
	await get_tree().create_timer(FPS_PROFILE_SETTLE_SECONDS).timeout
	_dump_render_inventory("full_base_idle" if full_base_profile else "isolated_idle")

	var quick_profile: bool = profile_args.has("--quick-knight-profile")
	var idle_seconds: float = 2.0 if quick_profile else FPS_PROFILE_IDLE_SECONDS
	var combat_seconds: float = 6.0 if quick_profile else FPS_PROFILE_COMBAT_SECONDS
	var idle_metrics: Dictionary = await _sample_fps_profile("knight_idle", idle_seconds)
	if full_base_profile and profile_args.has("--profile-render-breakdown"):
		await _sample_render_breakdown()
	clear_test_attack_loadout()
	_test_attack_ship_level = _max_test_ship_level()
	_attack_counts[profile_troop_name] = KNIGHT_SWARM_PROFILE_COUNT
	_attack_levels[profile_troop_name] = 7
	_refresh_attack_row(profile_troop_name)
	_refresh_test_ship_row()
	if not _load_test_attack_army(false):
		_set_status("Knight swarm profile failed: 45-knight fleet did not fit.")
		_fps_profile_active = false
		return

	await start_test_attack()
	var ship_wait: float = 0.0
	while not bool(attack._main_ship_ready_for_deployment) and ship_wait < float(attack.sail_duration) + 2.0:
		await get_tree().process_frame
		ship_wait += get_process_delta_time()

	var deployed_count: int = 0
	while not attack._army_entries.is_empty():
		attack.select_troop_group(0)
		var column: int = deployed_count % 9
		var row: int = floori(float(deployed_count) / 9.0)
		var offset: Vector3 = (
			(attack._get_lateral_dir() as Vector3) * (float(column) - 4.0) * 0.055
			+ (attack._get_sail_dir() as Vector3) * float(row) * 0.035
		)
		if not attack._try_deploy_selected_troop(attack.plane_center + offset):
			break
		deployed_count += 1
	print("[KNIGHT_SWARM_PROFILE] auto_deploy count=", deployed_count)
	if deployed_count != KNIGHT_SWARM_PROFILE_COUNT:
		_set_status("Knight swarm profile failed: deployed %d / %d." % [
			deployed_count,
			KNIGHT_SWARM_PROFILE_COUNT,
		])
		_fps_profile_active = false
		return

	var disable_separation: bool = profile_args.has("--knight-probe-no-separation")
	var disable_slots: bool = profile_args.has("--knight-probe-no-slots")
	var disable_physics: bool = profile_args.has("--knight-probe-no-physics")
	var disable_animation: bool = profile_args.has("--knight-probe-no-animation")
	var disable_visuals: bool = profile_args.has("--knight-probe-no-visuals")
	var disable_defense_physics: bool = profile_args.has(
		"--knight-probe-no-defense-physics"
	)
	var disable_guard_physics: bool = profile_args.has(
		"--knight-probe-no-guard-physics"
	)
	var probe_modes: Array[String] = []
	if disable_separation:
		probe_modes.append("no_separation")
	if disable_slots:
		probe_modes.append("no_slots")
	if disable_physics:
		probe_modes.append("no_physics")
	if disable_animation:
		probe_modes.append("no_animation")
	if disable_visuals:
		probe_modes.append("no_visuals")
	if disable_defense_physics:
		probe_modes.append("no_defense_physics")
	if disable_guard_physics:
		probe_modes.append("no_guard_physics")
	for troop in get_tree().get_nodes_in_group("troops"):
		if not is_instance_valid(troop):
			continue
		if full_base_profile:
			troop.set("max_hp", 50000000)
			troop.set("hp", 50000000)
		if disable_separation:
			troop.set("can_pass_through_friendly_units", true)
		if disable_slots:
			troop.set("_slot_eval_timer", -1000000.0)
		if disable_physics:
			troop.set_physics_process(false)
		if disable_animation:
			troop.set("_animation_budget_active", false)
		if disable_visuals:
			troop.visible = false
	if disable_visuals:
		var crowd_batch := get_tree().current_scene.get_node_or_null("TroopCrowdBatch")
		if crowd_batch is Node3D:
			(crowd_batch as Node3D).visible = false
	if disable_defense_physics:
		var disabled_defense_count := _set_profile_defense_physics(false)
		print(
			"[KNIGHT_SWARM_PROFILE] disabled_defense_physics count=",
			disabled_defense_count
		)
	if disable_guard_physics:
		var disabled_guard_count := 0
		for guard in get_tree().get_nodes_in_group("skeleton_guards"):
			if not is_instance_valid(guard):
				continue
			guard.set_physics_process(false)
			disabled_guard_count += 1
		print(
			"[KNIGHT_SWARM_PROFILE] disabled_guard_physics count=",
			disabled_guard_count
		)
	print("[KNIGHT_SWARM_PROFILE] probe_modes=", probe_modes)

	var deploy_wait: float = (
		float(attack.troop_spawn_delay) * float(KNIGHT_SWARM_PROFILE_COUNT)
		+ FPS_PROFILE_SETTLE_SECONDS
	)
	await get_tree().create_timer(deploy_wait).timeout
	_dump_render_inventory("full_base_combat" if full_base_profile else "isolated_combat")
	await _capture_knight_swarm_profile_frame(profile_args)
	var combat_metrics: Dictionary = await _sample_fps_profile(
		"knight_combat",
		combat_seconds
	)
	print("[KNIGHT_SWARM_PROFILE] summary idle=", idle_metrics, " combat=", combat_metrics)
	_set_status("Knight swarm profile complete. See [KNIGHT_SWARM_PROFILE].")
	_fps_profile_active = false
	if OS.get_cmdline_user_args().has("--auto-knight-swarm-profile"):
		await get_tree().process_frame
		get_tree().quit()


func _set_profile_defense_physics(enabled: bool) -> int:
	var defense_scripts := {
		"res://scripts/turret.gd": true,
		"res://scripts/cannon.gd": true,
		"res://scripts/tower_archer.gd": true,
		"res://scripts/tower_mortar.gd": true,
		"res://scripts/tower_mage.gd": true,
	}
	var changed_count := 0
	var scene := get_tree().current_scene
	if scene == null:
		return changed_count
	for node in scene.find_children("*", "", true, false):
		var script := node.get_script() as Script
		if script == null or not defense_scripts.has(script.resource_path):
			continue
		node.set_physics_process(enabled)
		changed_count += 1
	return changed_count


func _set_profile_guard_physics(enabled: bool) -> int:
	var changed_count := 0
	for guard in get_tree().get_nodes_in_group("skeleton_guards"):
		if not is_instance_valid(guard):
			continue
		guard.set_physics_process(enabled)
		changed_count += 1
	return changed_count


func _set_profile_defense_only(script_path: String) -> int:
	var defense_scripts := {
		"res://scripts/turret.gd": true,
		"res://scripts/cannon.gd": true,
		"res://scripts/tower_archer.gd": true,
		"res://scripts/tower_mortar.gd": true,
		"res://scripts/tower_mage.gd": true,
	}
	var changed_count := 0
	var scene := get_tree().current_scene
	if scene == null:
		return changed_count
	for node in scene.find_children("*", "", true, false):
		var script := node.get_script() as Script
		if script == null or not defense_scripts.has(script.resource_path):
			continue
		node.set_physics_process(script.resource_path == script_path)
		changed_count += 1
	return changed_count


func _sample_render_breakdown() -> void:
	var scene := get_tree().current_scene
	if scene == null:
		return
	var building_roots: Array[Node3D] = []
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		for building in raw_bs.get("placed_buildings"):
			var building_node := building.get("node", null) as Node3D
			if is_instance_valid(building_node):
				building_roots.append(building_node)
	var island_visual := scene.get_node_or_null("Island/Visual") as Node3D
	var water := scene.get_node_or_null("Water") as Node3D

	for building_node in building_roots:
		building_node.visible = false
	await get_tree().process_frame
	await _sample_fps_profile("render_without_buildings", 1.5)
	for building_node in building_roots:
		if is_instance_valid(building_node):
			building_node.visible = true

	if is_instance_valid(island_visual):
		island_visual.visible = false
	await get_tree().process_frame
	await _sample_fps_profile("render_without_island", 1.5)
	if is_instance_valid(island_visual):
		island_visual.visible = true

	if is_instance_valid(water):
		water.visible = false
	await get_tree().process_frame
	await _sample_fps_profile("render_without_water", 1.5)
	if is_instance_valid(water):
		water.visible = true
	await get_tree().process_frame


func _capture_knight_swarm_profile_frame(profile_args: PackedStringArray) -> void:
	var output_path := ""
	for argument in profile_args:
		if argument.begins_with("--knight-swarm-capture-out="):
			output_path = argument.trim_prefix("--knight-swarm-capture-out=")
			break
	if output_path.is_empty():
		return
	var output_dir := output_path.get_base_dir()
	if not output_dir.is_empty():
		DirAccess.make_dir_recursive_absolute(
			ProjectSettings.globalize_path(output_dir)
			if output_dir.begins_with("user://")
			else output_dir
		)
	await RenderingServer.frame_post_draw
	var err := get_viewport().get_texture().get_image().save_png(output_path)
	if err != OK:
		push_error(
			"[KNIGHT_SWARM_PROFILE] capture failed path=%s error=%s"
			% [output_path, error_string(err)]
		)
		return
	print("[KNIGHT_SWARM_PROFILE] capture=", output_path)


func _dump_render_inventory(phase: String) -> void:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	var groups: Dictionary = {}
	var paths: Dictionary = {}
	var visible_meshes := 0
	var visible_surfaces := 0
	var visible_multimeshes := 0
	var visible_particles := 0
	var visible_3d_labels := 0
	var visible_canvas_items := 0
	var canvas_groups: Dictionary = {}
	for raw_visual in scene_root.find_children("*", "VisualInstance3D", true, false):
		var visual := raw_visual as VisualInstance3D
		if visual == null or not visual.is_visible_in_tree():
			continue
		var draw_units := 1
		if visual is MeshInstance3D:
			var mesh_instance := visual as MeshInstance3D
			if mesh_instance.mesh == null:
				continue
			draw_units = maxi(1, mesh_instance.mesh.get_surface_count())
			visible_meshes += 1
			visible_surfaces += draw_units
		elif visual is MultiMeshInstance3D:
			var multimesh_instance := visual as MultiMeshInstance3D
			if multimesh_instance.multimesh == null or multimesh_instance.multimesh.mesh == null:
				continue
			draw_units = maxi(1, multimesh_instance.multimesh.mesh.get_surface_count())
			visible_multimeshes += 1
			visible_surfaces += draw_units
		elif visual is GPUParticles3D or visual is CPUParticles3D:
			visible_particles += 1
		elif visual is Label3D:
			visible_3d_labels += 1
		var label := _render_inventory_group(visual)
		groups[label] = int(groups.get(label, 0)) + draw_units
		var visual_path := str(scene_root.get_path_to(visual))
		paths[visual_path] = int(paths.get(visual_path, 0)) + draw_units
	for raw_canvas in scene_root.find_children("*", "CanvasItem", true, false):
		var canvas_item := raw_canvas as CanvasItem
		if canvas_item != null and canvas_item.is_visible_in_tree():
			visible_canvas_items += 1
			var canvas_label := _render_inventory_group(canvas_item)
			canvas_groups[canvas_label] = int(canvas_groups.get(canvas_label, 0)) + 1
	var ranked: Array[Dictionary] = []
	for label in groups:
		ranked.append({"label": str(label), "draw_units": int(groups[label])})
	ranked.sort_custom(
		func(a: Dictionary, b: Dictionary) -> bool:
			return int(a.draw_units) > int(b.draw_units)
	)
	if ranked.size() > 18:
		ranked.resize(18)
	var ranked_paths: Array[Dictionary] = []
	for visual_path in paths:
		ranked_paths.append({
			"path": str(visual_path),
			"draw_units": int(paths[visual_path]),
		})
	ranked_paths.sort_custom(
		func(a: Dictionary, b: Dictionary) -> bool:
			return int(a.draw_units) > int(b.draw_units)
	)
	if ranked_paths.size() > 30:
		ranked_paths.resize(30)
	var ranked_canvas: Array[Dictionary] = []
	for label in canvas_groups:
		ranked_canvas.append({
			"label": str(label),
			"items": int(canvas_groups[label]),
		})
	ranked_canvas.sort_custom(
		func(a: Dictionary, b: Dictionary) -> bool:
			return int(a.items) > int(b.items)
	)
	if ranked_canvas.size() > 12:
		ranked_canvas.resize(12)
	print(
		"[RENDER_INVENTORY] phase=%s meshes=%d surfaces=%d multimeshes=%d particles=%d labels3d=%d canvas_items=%d top=%s canvas_top=%s"
		% [
			phase,
			visible_meshes,
			visible_surfaces,
			visible_multimeshes,
			visible_particles,
			visible_3d_labels,
			visible_canvas_items,
			ranked,
			ranked_canvas,
		]
	)
	print("[RENDER_PATHS] phase=%s top=%s" % [phase, ranked_paths])


func _render_inventory_group(node: Node) -> String:
	var current := node
	var top_level_name := str(node.name)
	var scene_root := get_tree().current_scene
	while current != null:
		if current.has_meta("building_type"):
			return "building:%s" % str(current.get_meta("building_type"))
		if current.is_in_group("troops"):
			return "troops"
		if current.name == "Island":
			return "island"
		if current.name == "Water":
			return "water"
		if current.get_parent() == scene_root:
			top_level_name = str(current.name)
		current = current.get_parent()
	return "scene:%s" % top_level_name


func run_mixed_swarm_fps_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_spawn_troops_at_pos"):
		_set_status("AttackSystem does not support mixed swarm profiling.")
		return

	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	var troop_names: Array[String] = []
	for troop_name in TEST_ATTACK_PREFERRED_ORDER:
		for _unit_index in int(MIXED_SWARM_PROFILE_COUNTS.get(troop_name, 0)):
			troop_names.append(troop_name)
	print(
		"[MIXED_SWARM_PROFILE] start count=",
		troop_names.size(),
		" roster=",
		MIXED_SWARM_PROFILE_COUNTS
	)
	await _await_profile_background_warmup()
	reset_sandbox()
	await get_tree().process_frame
	if not await spawn_building_level("town_hall", 6):
		_set_status("Mixed swarm profile failed: Town Hall target did not spawn.")
		_fps_profile_active = false
		return
	var profile_target: Dictionary = {}
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		for building in raw_bs.get("placed_buildings"):
			if str(building.get("id", "")) == "town_hall":
				profile_target = building
				break
		if not profile_target.is_empty():
			break
	if profile_target.is_empty():
		_set_status("Mixed swarm profile failed: Town Hall target data is missing.")
		_fps_profile_active = false
		return
	profile_target["max_hp"] = 500000000
	profile_target["hp"] = 500000000
	await get_tree().create_timer(FPS_PROFILE_SETTLE_SECONDS).timeout

	var profile_args: PackedStringArray = OS.get_cmdline_user_args()
	var quick_profile: bool = profile_args.has("--quick-mixed-profile")
	var idle_seconds: float = 2.0 if quick_profile else FPS_PROFILE_IDLE_SECONDS
	var combat_seconds: float = 8.0 if quick_profile else FPS_PROFILE_COMBAT_SECONDS
	var idle_metrics: Dictionary = await _sample_fps_profile("mixed_swarm_idle", idle_seconds)
	_prepare_test_battle([])
	var old_spawn_delay: float = float(attack.troop_spawn_delay)
	attack.troop_spawn_delay = 0.01
	var spawn_center: Vector3 = attack.plane_center
	if spawn_center == Vector3.ZERO:
		spawn_center = Vector3(-1.75, 0.0, 2.65)
	attack._spawn_troops_at_pos(troop_names, {}, spawn_center)
	await get_tree().create_timer(float(troop_names.size()) * 0.01 + 0.5).timeout
	attack.troop_spawn_delay = old_spawn_delay

	var spawned_count: int = get_tree().get_node_count_in_group("troops")
	print("[MIXED_SWARM_PROFILE] spawned=", spawned_count)
	if spawned_count < troop_names.size():
		push_error(
			"[MIXED_SWARM_PROFILE] expected at least %d troops, got %d"
			% [troop_names.size(), spawned_count]
		)
		_fps_profile_active = false
		return
	await get_tree().create_timer(FPS_PROFILE_SETTLE_SECONDS).timeout
	var combat_metrics: Dictionary = await _sample_fps_profile(
		"mixed_swarm_combat",
		combat_seconds
	)
	print(
		"[MIXED_SWARM_PROFILE] summary idle=",
		idle_metrics,
		" combat=",
		combat_metrics
	)
	_set_status("Mixed swarm profile complete. See [MIXED_SWARM_PROFILE].")
	_fps_profile_active = false
	if OS.get_cmdline_user_args().has("--auto-mixed-swarm-profile"):
		await get_tree().process_frame
		get_tree().quit()


func run_troop_matrix_fps_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_spawn_troops_at_pos"):
		_set_status("AttackSystem does not support troop matrix profiling.")
		return

	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	await _await_profile_background_warmup()
	var summaries: Dictionary = {}
	var requested_filter := _troop_matrix_profile_filter()
	for troop_name in TEST_ATTACK_PREFERRED_ORDER:
		if not requested_filter.is_empty() and not requested_filter.has(troop_name):
			continue
		attack.cleanup_combat_nodes()
		await get_tree().process_frame
		await get_tree().process_frame
		reset_sandbox()
		await get_tree().process_frame
		if not await spawn_building_level("town_hall", 6):
			push_error("[TROOP_MATRIX_PROFILE] target spawn failed troop=%s" % troop_name)
			_fps_profile_active = false
			return
		for raw_bs in get_tree().get_nodes_in_group("building_systems"):
			for building in raw_bs.get("placed_buildings"):
				if str(building.get("id", "")) == "town_hall":
					building["max_hp"] = 500000000
					building["hp"] = 500000000
		_prepare_test_battle([])
		var troop_names: Array[String] = []
		var slot_cost: int = _attack_troop_slot_cost(troop_name)
		var profile_count: int = maxi(
			1,
			floori(float(TROOP_MATRIX_PROFILE_CAPACITY) / float(slot_cost))
		)
		for _unit_index in profile_count:
			troop_names.append(troop_name)
		var old_spawn_delay: float = float(attack.troop_spawn_delay)
		attack.troop_spawn_delay = 0.005
		attack._spawn_troops_at_pos(
			troop_names,
			{},
			Vector3(-1.75, 0.0, 2.65)
		)
		await get_tree().create_timer(0.75).timeout
		attack.troop_spawn_delay = old_spawn_delay
		var active_count := get_tree().get_node_count_in_group("troops")
		var metrics: Dictionary = await _sample_fps_profile(
			"matrix_%s" % troop_name.to_lower(),
			2.0
		)
		metrics["active_count"] = active_count
		summaries[troop_name] = metrics
		print(
			"[TROOP_MATRIX_PROFILE] troop=",
			troop_name,
			" requested=",
			profile_count,
			" slot_cost=",
			slot_cost,
			" occupied_slots=",
			profile_count * slot_cost,
			" active=",
			active_count,
			" median_fps=",
			float(metrics.get("median_fps", 0.0)),
			" draw_calls=",
			float(metrics.get("avg_draw_calls", 0.0)),
			" physics_ms=",
			float(metrics.get("avg_physics_ms", 0.0))
		)
	print("[TROOP_MATRIX_PROFILE] summary=", summaries)
	_fps_profile_active = false
	if OS.get_cmdline_user_args().has("--auto-troop-matrix-profile"):
		await get_tree().process_frame
		get_tree().quit()


func run_th6_browser_matrix_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_spawn_troops_at_pos"):
		push_error("[TH6_BROWSER_MATRIX] AttackSystem is unavailable")
		return

	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	var scenarios: Array[Dictionary] = []
	var requested_scenario := ""
	var disable_defense_physics := false
	var defense_only_script := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--th6-profile-scenario="):
			requested_scenario = arg.trim_prefix("--th6-profile-scenario=")
		elif arg == "--th6-profile-no-defense":
			disable_defense_physics = true
		elif arg.begins_with("--th6-profile-defense-only="):
			defense_only_script = (
				"res://scripts/%s.gd"
				% arg.trim_prefix("--th6-profile-defense-only=")
			)
	for raw_scenario in TH6_BROWSER_PROFILE_SCENARIOS:
		var scenario := raw_scenario as Dictionary
		if (
			requested_scenario.is_empty()
			or str(scenario.get("name", "")) == requested_scenario
		):
			scenarios.append(scenario)
	if scenarios.is_empty():
		push_error(
			"[TH6_BROWSER_MATRIX] unknown scenario=%s"
			% requested_scenario
		)
		_fps_profile_active = false
		return
	print(
		"[TH6_BROWSER_MATRIX] start scenarios=",
		scenarios.size(),
		" capacity=",
		TH6_BROWSER_PROFILE_CAPACITY
	)
	var warmup_troops: Array = []
	for warmup_scenario in scenarios:
		for troop_name in _th6_profile_troops(warmup_scenario):
			warmup_troops.append(troop_name)
	var warmup_script: Script = load("res://scripts/warmup.gd")
	if warmup_script != null:
		if warmup_script.has_method("start_combat_warmup"):
			# Automated profiles have no user-idle window. Run the same hidden
			# render work in blocking mode so the benchmark cannot wait forever
			# for interactive-idle eligibility.
			warmup_script.start_combat_warmup(self, warmup_troops)
	await _await_profile_background_warmup(70.0)
	await build_max_village_for_town_hall(
		6,
		TH6_BROWSER_PROFILE_LAYOUT_SEED
	)
	await get_tree().create_timer(1.0).timeout
	_prepare_profile_buildings()
	_prepare_test_battle([])
	_dump_render_inventory("th6_browser_idle")
	var idle_metrics := await _sample_fps_profile("th6_browser_idle", 4.0)
	var results: Array[Dictionary] = []

	for scenario_index in range(scenarios.size()):
		var scenario: Dictionary = scenarios[scenario_index]
		var scenario_name := str(scenario.get("name", "scenario_%02d" % (
			scenario_index + 1
		)))
		print(
			"[TH6_BROWSER_MATRIX] begin index=",
			scenario_index + 1,
			" name=",
			scenario_name
		)
		attack.cleanup_combat_nodes()
		await get_tree().process_frame
		await get_tree().process_frame
		_prepare_profile_buildings()
		_prepare_test_battle([])
		if disable_defense_physics:
			_set_profile_defense_physics(false)
		elif not defense_only_script.is_empty():
			_set_profile_defense_only(defense_only_script)
		_test_attack_ship_level = 6
		reset_test_ship_abilities(false)

		var troop_names := _th6_profile_troops(scenario)
		var occupied_slots := _th6_profile_occupied_slots(troop_names)
		if occupied_slots > TH6_BROWSER_PROFILE_CAPACITY:
			push_error(
				"[TH6_BROWSER_MATRIX] invalid scenario=%s occupied=%d"
				% [scenario_name, occupied_slots]
			)
			continue
		var spawn_center := Vector3(-1.75, 0.0, 2.65)
		var old_spawn_delay: float = float(attack.troop_spawn_delay)
		attack.troop_spawn_delay = 0.005
		_spawn_th6_profile_formation(attack, troop_names, spawn_center)
		await get_tree().create_timer(
			maxf(0.65, float(troop_names.size()) * 0.006)
		).timeout
		attack.troop_spawn_delay = old_spawn_delay
		for raw_troop in get_tree().get_nodes_in_group("troops"):
			var troop := raw_troop as Node3D
			if not is_instance_valid(troop):
				continue
			troop.set("max_hp", 50000000)
			troop.set("hp", 50000000)
		var ability_results := _apply_th6_profile_abilities(
			scenario.get("abilities", []),
			spawn_center
		)
		await get_tree().create_timer(0.35).timeout
		var metrics := await _sample_fps_profile(
			"th6_%02d_%s" % [scenario_index + 1, scenario_name],
			_profile_sample_duration(TH6_BROWSER_PROFILE_SAMPLE_SEC)
		)
		metrics["index"] = scenario_index + 1
		metrics["name"] = scenario_name
		metrics["requested_troops"] = troop_names.size()
		metrics["occupied_slots"] = occupied_slots
		metrics["active_troops"] = get_tree().get_nodes_in_group(
			"troops"
		).size()
		metrics["active_guards"] = get_tree().get_nodes_in_group(
			"skeleton_guards"
		).size()
		metrics["active_particles"] = _count_profile_particles()
		metrics["abilities"] = ability_results
		results.append(metrics)
		print(
			"[TH6_BROWSER_MATRIX] capture index=",
			scenario_index + 1,
			" name=",
			scenario_name
		)
		# Browser screenshots stall the WebGL render thread. Keep that work
		# outside the measured sample and give the runner time to finish it
		# before the next scenario replaces the combat state.
		await get_tree().create_timer(1.5).timeout
		print(
			"[TH6_BROWSER_MATRIX] end index=",
			scenario_index + 1,
			" name=",
			scenario_name,
			" median_fps=",
			float(metrics.get("median_fps", 0.0)),
			" p95_frame_ms=",
			float(metrics.get("p95_frame_ms", 0.0)),
			" physics_ms=",
			float(metrics.get("avg_physics_ms", 0.0)),
			" draw_calls=",
			float(metrics.get("avg_draw_calls", 0.0)),
			" active_troops=",
			int(metrics.get("active_troops", 0))
		)

	attack.cleanup_combat_nodes()
	if disable_defense_physics or not defense_only_script.is_empty():
		_set_profile_defense_physics(true)
	reset_test_ship_abilities(false)
	_fps_profile_active = false
	var report := {
		"capacity": TH6_BROWSER_PROFILE_CAPACITY,
		"layout_seed": TH6_BROWSER_PROFILE_LAYOUT_SEED,
		"idle": idle_metrics,
		"scenarios": results,
	}
	print("[TH6_BROWSER_MATRIX] RESULT ", JSON.stringify(report))


func run_th6_bottleneck_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_spawn_troops_at_pos"):
		push_error("[TH6_BOTTLENECK] AttackSystem is unavailable")
		return

	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	print("[TH6_BOTTLENECK] start")
	await _await_profile_background_warmup(35.0)
	await build_max_village_for_town_hall(
		6,
		TH6_BROWSER_PROFILE_LAYOUT_SEED
	)
	await get_tree().create_timer(1.0).timeout
	_prepare_profile_buildings()
	_prepare_test_battle([])
	var requested_mode := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--th6-bottleneck-mode="):
			requested_mode = arg.trim_prefix("--th6-bottleneck-mode=")
	var idle_results: Dictionary = {}
	if requested_mode.is_empty():
		idle_results = await _sample_th6_idle_render_breakdown()
	var results: Array[Dictionary] = []

	for raw_mode in TH6_BOTTLENECK_PROFILE_MODES:
		var mode: Dictionary = raw_mode
		var mode_name := str(mode.get("name", "unknown"))
		if not requested_mode.is_empty() and mode_name != requested_mode:
			continue
		print("[TH6_BOTTLENECK] begin mode=", mode_name)
		attack.cleanup_combat_nodes()
		await get_tree().process_frame
		await get_tree().process_frame
		_prepare_profile_buildings()
		_prepare_test_battle([])
		_set_profile_defense_physics(true)
		BaseTroop.profile_dense_separation_interval = int(
			mode.get("separation_interval", 0)
		)
		BaseTroop.profile_dense_slot_interval_sec = float(
			mode.get("slot_interval_sec", 0.0)
		)

		var spawn_center := Vector3(-1.75, 0.0, 2.65)
		var old_spawn_delay: float = float(attack.troop_spawn_delay)
		attack.troop_spawn_delay = 0.005
		var troop_names: Array[String] = []
		for _troop_index in KNIGHT_SWARM_PROFILE_COUNT:
			troop_names.append("Knight")
		attack._spawn_troops_at_pos(troop_names, {}, spawn_center)
		await get_tree().create_timer(0.85).timeout
		attack.troop_spawn_delay = old_spawn_delay

		for raw_troop in get_tree().get_nodes_in_group("troops"):
			var troop := raw_troop as Node3D
			if not is_instance_valid(troop):
				continue
			troop.set("max_hp", 50000000)
			troop.set("hp", 50000000)
			if bool(mode.get("no_separation", false)):
				troop.set("can_pass_through_friendly_units", true)
			if bool(mode.get("no_slots", false)):
				troop.set("_slot_eval_timer", -1000000.0)
			if bool(mode.get("no_animation", false)):
				troop.set("_animation_budget_active", false)
			if bool(mode.get("no_physics", false)):
				troop.set_physics_process(false)
			if bool(mode.get("no_visuals", false)):
				troop.visible = false
		var crowd_batch := get_tree().current_scene.get_node_or_null(
			"TroopCrowdBatch"
		) as Node3D
		if is_instance_valid(crowd_batch):
			crowd_batch.visible = not bool(
				mode.get("no_visuals", false)
			)
		if bool(mode.get("no_defense_physics", false)):
			_set_profile_defense_physics(false)
		if bool(mode.get("no_guard_physics", false)):
			_set_profile_guard_physics(false)

		await get_tree().create_timer(0.35).timeout
		var metrics := await _sample_fps_profile(
			"th6_bottleneck_%s" % mode_name,
			_profile_sample_duration(
				TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
			)
		)
		metrics["name"] = mode_name
		metrics["active_troops"] = get_tree().get_nodes_in_group(
			"troops"
		).size()
		results.append(metrics)
		print(
			"[TH6_BOTTLENECK] end mode=",
			mode_name,
			" median_fps=",
			float(metrics.get("median_fps", 0.0)),
			" process_ms=",
			float(metrics.get("avg_process_ms", 0.0)),
			" physics_ms=",
			float(metrics.get("avg_physics_ms", 0.0)),
			" draw_calls=",
			float(metrics.get("avg_draw_calls", 0.0))
		)

	_set_profile_defense_physics(true)
	_set_profile_guard_physics(true)
	BaseTroop.profile_dense_separation_interval = 0
	BaseTroop.profile_dense_slot_interval_sec = 0.0
	if is_instance_valid(
		get_tree().current_scene.get_node_or_null("TroopCrowdBatch")
	):
		get_tree().current_scene.get_node("TroopCrowdBatch").visible = true
	attack.cleanup_combat_nodes()
	_fps_profile_active = false
	print(
		"[TH6_BOTTLENECK] RESULT ",
		JSON.stringify({
			"idle": idle_results,
			"modes": results,
		})
	)


func run_th6_defense_breakdown_profile() -> void:
	if _fps_profile_active:
		return
	var attack := get_node_or_null("../AttackSystem")
	if not attack or not attack.has_method("_spawn_troops_at_pos"):
		push_error("[TH6_DEFENSE_BREAKDOWN] AttackSystem is unavailable")
		return

	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	print("[TH6_DEFENSE_BREAKDOWN] start")
	await _await_profile_background_warmup(35.0)
	await build_max_village_for_town_hall(6, TH6_BROWSER_PROFILE_LAYOUT_SEED)
	await get_tree().create_timer(1.0).timeout
	_prepare_profile_buildings()
	_prepare_test_battle([])

	var modes: Array[Dictionary] = [
		{"name": "all", "script": ""},
		{"name": "none", "script": "none"},
		{"name": "turret", "script": "res://scripts/turret.gd"},
		{"name": "archer", "script": "res://scripts/tower_archer.gd"},
		{"name": "mortar", "script": "res://scripts/tower_mortar.gd"},
		{"name": "mage", "script": "res://scripts/tower_mage.gd"},
		{"name": "cannon", "script": "res://scripts/cannon.gd"},
	]
	var results: Array[Dictionary] = []
	for raw_mode in modes:
		var mode := raw_mode as Dictionary
		var mode_name := str(mode.get("name", "unknown"))
		var script_path := str(mode.get("script", ""))
		print("[TH6_DEFENSE_BREAKDOWN] begin mode=", mode_name)
		attack.cleanup_combat_nodes()
		await get_tree().process_frame
		await get_tree().process_frame
		_prepare_profile_buildings()
		_prepare_test_battle([])
		if script_path == "none":
			_set_profile_defense_physics(false)
		elif script_path.is_empty():
			_set_profile_defense_physics(true)
		else:
			_set_profile_defense_only(script_path)

		var troop_names: Array[String] = []
		for _troop_index in KNIGHT_SWARM_PROFILE_COUNT:
			troop_names.append("Knight")
		var old_spawn_delay: float = float(attack.troop_spawn_delay)
		attack.troop_spawn_delay = 0.005
		attack._spawn_troops_at_pos(
			troop_names,
			{},
			Vector3(-1.75, 0.0, 2.65)
		)
		await get_tree().create_timer(0.85).timeout
		attack.troop_spawn_delay = old_spawn_delay
		for raw_troop in get_tree().get_nodes_in_group("troops"):
			var troop := raw_troop as Node3D
			if not is_instance_valid(troop):
				continue
			troop.set("max_hp", 50000000)
			troop.set("hp", 50000000)
		await get_tree().create_timer(0.35).timeout
		var metrics := await _sample_fps_profile(
			"th6_defense_%s" % mode_name,
			TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
		)
		metrics["name"] = mode_name
		results.append(metrics)
		print(
			"[TH6_DEFENSE_BREAKDOWN] end mode=",
			mode_name,
			" median_fps=",
			float(metrics.get("median_fps", 0.0)),
			" process_ms=",
			float(metrics.get("avg_process_ms", 0.0)),
			" physics_ms=",
			float(metrics.get("avg_physics_ms", 0.0))
		)

	attack.cleanup_combat_nodes()
	_set_profile_defense_physics(true)
	_fps_profile_active = false
	print("[TH6_DEFENSE_BREAKDOWN] RESULT ", JSON.stringify({"modes": results}))


func run_th6_idle_render_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	print("[TH6_IDLE_RENDER] start")
	await _await_profile_background_warmup(35.0)
	await build_max_village_for_town_hall(
		6,
		TH6_BROWSER_PROFILE_LAYOUT_SEED
	)
	await get_tree().create_timer(1.0).timeout
	_prepare_profile_buildings()
	_prepare_test_battle([])
	var requested_mode := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--th6-idle-mode="):
			requested_mode = arg.trim_prefix("--th6-idle-mode=")
			break
	var idle_results: Dictionary
	if requested_mode.is_empty():
		idle_results = await _sample_th6_idle_render_breakdown()
	else:
		idle_results[requested_mode] = await _sample_th6_idle_render_mode(
			requested_mode,
			8.0
		)
	_fps_profile_active = false
	print(
		"[TH6_IDLE_RENDER] RESULT ",
		JSON.stringify({"idle": idle_results})
	)


func run_water_variant_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	print("[WATER_VARIANT] start")
	await _await_profile_background_warmup(35.0)
	await build_max_village_for_town_hall(
		6,
		TH6_BROWSER_PROFILE_LAYOUT_SEED
	)
	await get_tree().create_timer(1.0).timeout
	_prepare_profile_buildings()
	_prepare_test_battle([])

	var results: Array[Dictionary] = []
	for variant_index in range(WATER_VARIANTS.size()):
		var variant := WATER_VARIANTS[variant_index]
		var key := str(variant.get("key", "quality"))
		_apply_water_variant(key)
		await get_tree().create_timer(WATER_LAB_SETTLE_SECONDS).timeout
		print(
			"[WATER_VARIANT] capture index=",
			variant_index + 1,
			" name=",
			key
		)
		var metrics := await _sample_fps_profile(
			"water_%s" % key,
			WATER_LAB_SAMPLE_SECONDS
		)
		metrics["key"] = key
		metrics["label"] = str(variant.get("label", key.capitalize()))
		metrics["description"] = str(variant.get("description", ""))
		results.append(metrics)

	_apply_water_variant("quality")
	_fps_profile_active = false
	print(
		"[WATER_VARIANT] RESULT ",
		JSON.stringify({"variants": results})
	)


func run_th6_building_render_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	print("[TH6_BUILDING_RENDER] start")
	await _await_profile_background_warmup(35.0)
	await build_max_village_for_town_hall(
		6,
		TH6_BROWSER_PROFILE_LAYOUT_SEED
	)
	await get_tree().create_timer(1.0).timeout
	_prepare_profile_buildings()
	await get_tree().create_timer(1.0).timeout

	var grouped_roots: Dictionary = {}
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("placed_buildings" in raw_bs):
			continue
		for building: Dictionary in raw_bs.placed_buildings:
			var building_node := building.get("node", null) as Node3D
			if not is_instance_valid(building_node):
				continue
			var building_id := str(building.get("id", "unknown"))
			var roots: Array = grouped_roots.get(building_id, [])
			roots.append(building_node)
			grouped_roots[building_id] = roots

	var cold_baseline := await _sample_fps_profile(
		"th6_building_all_cold",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	await get_tree().create_timer(8.0).timeout
	var warm_baseline := await _sample_fps_profile(
		"th6_building_all_warm",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	var render_summaries: Dictionary = {}
	for raw_building_id in grouped_roots.keys():
		var building_id := str(raw_building_id)
		var roots := grouped_roots.get(building_id, []) as Array
		render_summaries[building_id] = _building_render_submission_summary(roots)
	var results: Array[Dictionary] = []
	var building_ids := grouped_roots.keys()
	building_ids.sort()
	for raw_building_id in building_ids:
		var building_id := str(raw_building_id)
		var roots := grouped_roots.get(building_id, []) as Array
		for raw_root in roots:
			var root := raw_root as Node3D
			if is_instance_valid(root):
				root.visible = false
		await get_tree().create_timer(1.0).timeout
		var metrics := await _sample_fps_profile(
			"th6_building_without_%s" % building_id,
			TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
		)
		metrics["building_id"] = building_id
		metrics["instances"] = roots.size()
		results.append(metrics)
		for raw_root in roots:
			var root := raw_root as Node3D
			if is_instance_valid(root):
				root.visible = true
		await get_tree().create_timer(1.0).timeout

	var final_baseline := await _sample_fps_profile(
		"th6_building_all_final",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	_fps_profile_active = false
	print(
		"[TH6_BUILDING_RENDER] RESULT ",
		JSON.stringify({
			"cold_baseline": cold_baseline,
			"warm_baseline": warm_baseline,
			"final_baseline": final_baseline,
			"building_types": results,
			"render_summaries": render_summaries,
		})
	)


func _building_render_submission_summary(roots: Array) -> Dictionary:
	var summary := {
		"instances": roots.size(),
		"visible_meshes": 0,
		"mesh_surfaces": 0,
		"skinned_meshes": 0,
		"transparent_surfaces": 0,
		"multimeshes": 0,
		"particles": 0,
		"animation_players": 0,
		"active_animation_players": 0,
		"mesh_names": {},
		"optimization_reasons": {},
	}
	for raw_root in roots:
		var root := raw_root as Node3D
		if not is_instance_valid(root):
			continue
		if root.has_meta("web_shark_opt_reason"):
			var reason := str(root.get_meta("web_shark_opt_reason"))
			var reasons := summary.optimization_reasons as Dictionary
			reasons[reason] = int(reasons.get(reason, 0)) + 1
		for raw_mesh in root.find_children("*", "MeshInstance3D", true, false):
			var mesh_instance := raw_mesh as MeshInstance3D
			if (
				mesh_instance == null
				or not mesh_instance.is_visible_in_tree()
				or mesh_instance.mesh == null
			):
				continue
			summary.visible_meshes = int(summary.visible_meshes) + 1
			var surface_count := mesh_instance.mesh.get_surface_count()
			summary.mesh_surfaces = int(summary.mesh_surfaces) + surface_count
			if mesh_instance.skin != null or not mesh_instance.skeleton.is_empty():
				summary.skinned_meshes = int(summary.skinned_meshes) + 1
			var mesh_key := str(mesh_instance.name)
			var mesh_names := summary.mesh_names as Dictionary
			mesh_names[mesh_key] = int(mesh_names.get(mesh_key, 0)) + 1
			for surface_index in range(surface_count):
				var material := mesh_instance.get_active_material(surface_index)
				if material is BaseMaterial3D and (
					(material as BaseMaterial3D).transparency
					!= BaseMaterial3D.TRANSPARENCY_DISABLED
				):
					summary.transparent_surfaces = (
						int(summary.transparent_surfaces) + 1
					)
		for raw_multimesh in root.find_children(
			"*",
			"MultiMeshInstance3D",
			true,
			false
		):
			var multimesh_instance := raw_multimesh as MultiMeshInstance3D
			if (
				multimesh_instance != null
				and multimesh_instance.is_visible_in_tree()
			):
				summary.multimeshes = int(summary.multimeshes) + 1
		for raw_particles in root.find_children(
			"*",
			"GPUParticles3D",
			true,
			false
		):
			var particles := raw_particles as GPUParticles3D
			if particles != null and particles.is_visible_in_tree():
				summary.particles = int(summary.particles) + 1
		for raw_player in root.find_children(
			"*",
			"AnimationPlayer",
			true,
			false
		):
			var player := raw_player as AnimationPlayer
			if player == null:
				continue
			summary.animation_players = int(summary.animation_players) + 1
			if player.is_playing():
				summary.active_animation_players = (
					int(summary.active_animation_players) + 1
				)
	return summary


func run_th6_hotspot_ab_profile() -> void:
	if _fps_profile_active:
		_set_status("FPS profile is already running.")
		return
	_fps_profile_active = true
	_prepare_automated_profile_ui()
	Engine.time_scale = 1.0
	print("[TH6_HOTSPOT_AB] start")
	await _await_profile_background_warmup(35.0)
	await build_max_village_for_town_hall(
		6,
		TH6_BROWSER_PROFILE_LAYOUT_SEED
	)
	await get_tree().create_timer(10.0).timeout
	_prepare_profile_buildings()
	await get_tree().create_timer(2.0).timeout

	var grouped_roots: Dictionary = {}
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("placed_buildings" in raw_bs):
			continue
		for building: Dictionary in raw_bs.placed_buildings:
			var building_node := building.get("node", null) as Node3D
			if not is_instance_valid(building_node):
				continue
			var building_id := str(building.get("id", "unknown"))
			var roots: Array = grouped_roots.get(building_id, [])
			roots.append(building_node)
			grouped_roots[building_id] = roots

	var tests: Array[Dictionary] = [
		{"building_id": "archer_tower", "condition": "meshes_hidden"},
		{"building_id": "archer_tower", "condition": "animations_paused"},
		{"building_id": "archer_tower", "condition": "processing_disabled"},
		{"building_id": "shark_trap", "condition": "meshes_hidden"},
		{"building_id": "shark_trap", "condition": "animations_paused"},
		{"building_id": "shark_trap", "condition": "processing_disabled"},
	]
	var results: Array[Dictionary] = []
	for test: Dictionary in tests:
		var building_id := str(test.building_id)
		var condition := str(test.condition)
		var roots := grouped_roots.get(building_id, []) as Array
		var before := await _sample_fps_profile(
			"%s_%s_before" % [building_id, condition],
			TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
		)
		var restore_state := _apply_hotspot_profile_condition(
			roots,
			condition
		)
		await get_tree().create_timer(0.5).timeout
		var active := await _sample_fps_profile(
			"%s_%s_active" % [building_id, condition],
			TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
		)
		_restore_hotspot_profile_condition(restore_state)
		await get_tree().create_timer(0.5).timeout
		var after := await _sample_fps_profile(
			"%s_%s_after" % [building_id, condition],
			TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
		)
		results.append({
			"building_id": building_id,
			"condition": condition,
			"instances": roots.size(),
			"before": before,
			"active": active,
			"after": after,
		})

	_fps_profile_active = false
	print(
		"[TH6_HOTSPOT_AB] RESULT ",
		JSON.stringify({"tests": results})
	)


func _apply_hotspot_profile_condition(
	roots: Array,
	condition: String
) -> Array[Dictionary]:
	var restore_state: Array[Dictionary] = []
	for raw_root in roots:
		var root := raw_root as Node3D
		if not is_instance_valid(root):
			continue
		if condition == "processing_disabled":
			restore_state.append({
				"kind": "process_mode",
				"node": root,
				"value": root.process_mode,
			})
			root.process_mode = Node.PROCESS_MODE_DISABLED
			continue
		if condition == "meshes_hidden":
			for raw_mesh in root.find_children(
				"*",
				"MeshInstance3D",
				true,
				false
			):
				var mesh_instance := raw_mesh as MeshInstance3D
				if mesh_instance == null:
					continue
				restore_state.append({
					"kind": "visible",
					"node": mesh_instance,
					"value": mesh_instance.visible,
				})
				mesh_instance.visible = false
			continue
		if condition == "animations_paused":
			for raw_player in root.find_children(
				"*",
				"AnimationPlayer",
				true,
				false
			):
				var player := raw_player as AnimationPlayer
				if player == null:
					continue
				restore_state.append({
					"kind": "speed_scale",
					"node": player,
					"value": player.speed_scale,
				})
				player.speed_scale = 0.0
	return restore_state


func _restore_hotspot_profile_condition(
	restore_state: Array[Dictionary]
) -> void:
	for entry: Dictionary in restore_state:
		var node := entry.get("node", null) as Node
		if not is_instance_valid(node):
			continue
		match str(entry.get("kind", "")):
			"process_mode":
				node.process_mode = int(entry.get(
					"value",
					Node.PROCESS_MODE_INHERIT
				)) as Node.ProcessMode
			"visible":
				(node as VisualInstance3D).visible = bool(
					entry.get("value", true)
				)
			"speed_scale":
				(node as AnimationPlayer).speed_scale = float(
					entry.get("value", 1.0)
				)


func _sample_th6_idle_render_breakdown() -> Dictionary:
	var scene := get_tree().current_scene
	if scene == null:
		return {}
	var result := {
		"default": await _sample_fps_profile(
			"th6_bottleneck_idle_default",
			TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
		),
	}
	var building_roots: Array[Node3D] = []
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		for building in raw_bs.get("placed_buildings"):
			var building_node := building.get("node", null) as Node3D
			if is_instance_valid(building_node):
				building_roots.append(building_node)
	for building_node in building_roots:
		building_node.visible = false
	await get_tree().process_frame
	result["without_buildings"] = await _sample_fps_profile(
		"th6_bottleneck_idle_without_buildings",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	for building_node in building_roots:
		if is_instance_valid(building_node):
			building_node.visible = true

	var island_visual := scene.get_node_or_null("Island/Visual") as Node3D
	if is_instance_valid(island_visual):
		island_visual.visible = false
	await get_tree().process_frame
	result["without_island"] = await _sample_fps_profile(
		"th6_bottleneck_idle_without_island",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	if is_instance_valid(island_visual):
		island_visual.visible = true

	var water := scene.get_node_or_null("Water") as Node3D
	if is_instance_valid(water):
		water.visible = false
	await get_tree().process_frame
	result["without_water"] = await _sample_fps_profile(
		"th6_bottleneck_idle_without_water",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	if is_instance_valid(water):
		water.visible = true
	for building_node in building_roots:
		if is_instance_valid(building_node):
			building_node.visible = false
	if is_instance_valid(island_visual):
		island_visual.visible = false
	if is_instance_valid(water):
		water.visible = false
	await get_tree().process_frame
	result["minimal_scene"] = await _sample_fps_profile(
		"th6_bottleneck_idle_minimal_scene",
		TH6_BOTTLENECK_PROFILE_SAMPLE_SEC
	)
	for building_node in building_roots:
		if is_instance_valid(building_node):
			building_node.visible = true
	if is_instance_valid(island_visual):
		island_visual.visible = true
	if is_instance_valid(water):
		water.visible = true
	await get_tree().process_frame
	return result


func _sample_th6_idle_render_mode(
	mode: String,
	duration_seconds: float
) -> Dictionary:
	var scene := get_tree().current_scene
	if scene == null:
		return {}
	var building_roots: Array[Node3D] = []
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		for building in raw_bs.get("placed_buildings"):
			var building_node := building.get("node", null) as Node3D
			if is_instance_valid(building_node):
				building_roots.append(building_node)
	var island_visual := scene.get_node_or_null("Island/Visual") as Node3D
	var water := scene.get_node_or_null("Water") as Node3D
	var hide_buildings := mode in ["without_buildings", "minimal_scene"]
	var hide_island := mode in ["without_island", "minimal_scene"]
	var hide_water := mode in ["without_water", "minimal_scene"]
	if mode not in [
		"default",
		"without_buildings",
		"without_island",
		"without_water",
		"minimal_scene",
	]:
		push_error("Unknown TH6 idle render mode: %s" % mode)
		return {}
	for building_node in building_roots:
		building_node.visible = not hide_buildings
	if is_instance_valid(island_visual):
		island_visual.visible = not hide_island
	if is_instance_valid(water):
		water.visible = not hide_water
	await get_tree().process_frame
	await get_tree().create_timer(4.0).timeout
	return await _sample_fps_profile(
		"th6_idle_%s" % mode,
		duration_seconds
	)


func _th6_profile_troops(scenario: Dictionary) -> Array[String]:
	var troops: Array[String] = []
	var single_name := str(scenario.get("single", ""))
	if not single_name.is_empty():
		var single_cost := _attack_troop_slot_cost(single_name)
		var single_count := maxi(
			1,
			floori(
				float(TH6_BROWSER_PROFILE_CAPACITY)
				/ float(single_cost)
			)
		)
		for _unit_index in single_count:
			troops.append(single_name)
		return troops
	var counts: Dictionary = scenario.get("troops", {})
	for troop_name in TEST_ATTACK_PREFERRED_ORDER:
		for _unit_index in int(counts.get(troop_name, 0)):
			troops.append(troop_name)
	return troops


func _th6_profile_occupied_slots(troop_names: Array[String]) -> int:
	var occupied := 0
	for troop_name in troop_names:
		occupied += _attack_troop_slot_cost(troop_name)
	return occupied


func _spawn_th6_profile_formation(
	attack: Node,
	troop_names: Array[String],
	spawn_center: Vector3
) -> void:
	# Real deployment happens across the beach. Spawning the entire army inside
	# a 15 cm strip creates an artificial overlap bottleneck and unreadable
	# screenshots, so the matrix uses a compact five-row frontage instead.
	const COLUMN_COUNT: int = 9
	const COLUMN_SPACING: float = 0.22
	const ROW_SPACING: float = 0.18
	var row_count := ceili(float(troop_names.size()) / float(COLUMN_COUNT))
	for troop_index in range(troop_names.size()):
		var column := troop_index % COLUMN_COUNT
		var row := floori(float(troop_index) / float(COLUMN_COUNT))
		var row_item_count := mini(
			COLUMN_COUNT,
			troop_names.size() - row * COLUMN_COUNT
		)
		var x_offset := (
			float(column) - float(row_item_count - 1) * 0.5
		) * COLUMN_SPACING
		var z_offset := (
			float(row) - float(row_count - 1) * 0.5
		) * ROW_SPACING
		attack.call(
			"_spawn_troops_at_pos",
			[troop_names[troop_index]],
			{},
			spawn_center + Vector3(x_offset, 0.0, z_offset)
		)


func _prepare_profile_buildings() -> void:
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("placed_buildings" in raw_bs):
			continue
		for building: Dictionary in raw_bs.placed_buildings:
			building["max_hp"] = 500000000
			building["hp"] = 500000000
			var node := building.get("node", null) as Node3D
			if is_instance_valid(node):
				node.visible = true
	BaseTroop.reset_combat_runtime_cache()


func _apply_th6_profile_abilities(
	raw_abilities: Variant,
	spawn_center: Vector3
) -> Dictionary:
	var results: Dictionary = {}
	var abilities: Array = raw_abilities if raw_abilities is Array else []
	if abilities.is_empty():
		return results
	var bs := _test_combat_building_system()
	if not is_instance_valid(bs):
		return {"error": "building_system_missing"}
	var cannon: BSCannon = bs.get("_cannon")
	if cannon == null:
		return {"error": "cannon_missing"}
	cannon._cannon_energy = 100
	var target := _th6_profile_town_hall()
	var target_node := target.get("node", null) as Node3D
	var defense_center := (
		target_node.global_position
		if is_instance_valid(target_node)
		else Vector3.ZERO
	)
	for ability_value in abilities:
		var ability_name := str(ability_value)
		var applied := false
		match ability_name:
			"medkit":
				var medkit: BSMedkit = bs.get("_medkit")
				applied = medkit != null and medkit._drop_medkit(spawn_center)
			"freeze":
				var freeze: BSFreezeSpell = bs.get("_freeze")
				applied = freeze != null and freeze._drop_freeze(
					defense_center
				)
			"rage":
				var rage: BSRageSpell = bs.get("_rage")
				applied = rage != null and rage._drop_rage(spawn_center)
			"skeleton_barrel":
				var barrel: BSSkeletonBarrel = bs.get("_skeleton_barrel")
				applied = (
					barrel != null
					and not target.is_empty()
					and barrel.fire_at_building(target)
				)
		results[ability_name] = applied
	return results


func _th6_profile_town_hall() -> Dictionary:
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("placed_buildings" in raw_bs):
			continue
		for building: Dictionary in raw_bs.placed_buildings:
			if str(building.get("id", "")) == "town_hall":
				return building
	return {}


func _count_profile_particles() -> int:
	var scene := get_tree().current_scene
	if scene == null:
		return 0
	var count := 0
	for child in scene.find_children("*", "GPUParticles3D", true, false):
		var particles := child as GPUParticles3D
		if (
			is_instance_valid(particles)
			and particles.is_visible_in_tree()
			and particles.emitting
		):
			count += 1
	for child in scene.find_children("*", "CPUParticles3D", true, false):
		var particles := child as CPUParticles3D
		if (
			is_instance_valid(particles)
			and particles.is_visible_in_tree()
			and particles.emitting
		):
			count += 1
	return count


func _troop_matrix_profile_filter() -> Dictionary:
	var result: Dictionary = {}
	for argument in OS.get_cmdline_user_args():
		if not argument.begins_with("--troop-matrix-filter="):
			continue
		var raw_names := argument.trim_prefix("--troop-matrix-filter=")
		for raw_name in raw_names.split(",", false):
			var troop_filter_name := raw_name.strip_edges()
			if troop_filter_name != "":
				result[troop_filter_name] = true
	return result


func _await_profile_background_warmup(timeout_seconds: float = 25.0) -> void:
	var warmup_script: Script = load("res://scripts/warmup.gd")
	if warmup_script == null or not warmup_script.has_method("is_combat_profile_ready"):
		return
	var started_msec: int = Time.get_ticks_msec()
	var timeout_msec: int = roundi(timeout_seconds * 1000.0)
	while (
		Time.get_ticks_msec() - started_msec < timeout_msec
		and not bool(warmup_script.call("is_combat_profile_ready"))
	):
		await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame
	print(
		"[FPS_PROFILE] background_warmup_wait_ms=",
		Time.get_ticks_msec() - started_msec,
		" ready=",
		bool(warmup_script.call("is_combat_profile_ready"))
	)


func _sample_fps_profile(phase: String, duration_seconds: float) -> Dictionary:
	var started_us: int = Time.get_ticks_usec()
	var previous_frame_us: int = started_us
	var previous_physics_frame: int = Engine.get_physics_frames()
	var next_report_us: int = started_us + 1000000
	var duration_us: int = int(duration_seconds * 1000000.0)
	var fps_samples: Array[float] = []
	var frame_times_ms: Array[float] = []
	var process_ms_samples: Array[float] = []
	var physics_ms_samples: Array[float] = []
	var navigation_ms_samples: Array[float] = []
	var draw_call_samples: Array[float] = []
	var primitive_samples: Array[float] = []
	var video_memory_samples: Array[float] = []
	var texture_memory_samples: Array[float] = []
	var buffer_memory_samples: Array[float] = []
	var object_samples: Array[float] = []
	var node_samples: Array[float] = []
	var resource_samples: Array[float] = []
	var visible_draw_call_samples: Array[float] = []
	var shadow_draw_call_samples: Array[float] = []
	var canvas_draw_call_samples: Array[float] = []
	var visible_primitive_samples: Array[float] = []
	var render_cpu_ms_samples: Array[float] = []
	var render_gpu_ms_samples: Array[float] = []
	var troop_count_samples: Array[float] = []
	var guard_count_samples: Array[float] = []
	var physics_ticks_per_frame: Array[float] = []
	var cache_before: Dictionary = TroopCrowdBatch.pose_cache_stats()
	var report_index: int = 0
	var verbose_samples := OS.get_cmdline_user_args().has(
		"--profile-verbose-samples"
	)

	while Time.get_ticks_usec() - started_us < duration_us:
		await get_tree().process_frame
		var now_us: int = Time.get_ticks_usec()
		var physics_frame: int = Engine.get_physics_frames()
		physics_ticks_per_frame.append(
			float(maxi(0, physics_frame - previous_physics_frame))
		)
		previous_physics_frame = physics_frame
		var frame_ms: float = float(now_us - previous_frame_us) / 1000.0
		previous_frame_us = now_us
		if frame_ms > 0.0 and frame_ms < 1000.0:
			frame_times_ms.append(frame_ms)
		if verbose_samples and now_us >= next_report_us:
			report_index += 1
			var fps: float = Engine.get_frames_per_second()
			fps_samples.append(fps)
			var snapshot := _capture_fps_profile_monitor_sample()
			var troops := int(snapshot.troops)
			var guards := int(snapshot.guards)
			troop_count_samples.append(float(troops))
			guard_count_samples.append(float(guards))
			process_ms_samples.append(float(snapshot.process_ms))
			physics_ms_samples.append(float(snapshot.physics_ms))
			navigation_ms_samples.append(float(snapshot.navigation_ms))
			draw_call_samples.append(float(snapshot.draw_calls))
			primitive_samples.append(float(snapshot.primitives))
			video_memory_samples.append(float(snapshot.video_memory))
			texture_memory_samples.append(float(snapshot.texture_memory))
			buffer_memory_samples.append(float(snapshot.buffer_memory))
			object_samples.append(float(snapshot.objects))
			node_samples.append(float(snapshot.nodes))
			resource_samples.append(float(snapshot.resources))
			visible_draw_call_samples.append(float(snapshot.visible_draw_calls))
			shadow_draw_call_samples.append(float(snapshot.shadow_draw_calls))
			canvas_draw_call_samples.append(float(snapshot.canvas_draw_calls))
			visible_primitive_samples.append(float(snapshot.visible_primitives))
			render_cpu_ms_samples.append(float(snapshot.render_cpu_ms))
			render_gpu_ms_samples.append(float(snapshot.render_gpu_ms))
			print("[FPS_PROFILE] sample phase=", phase, " second=", report_index,
				" fps=", fps, " troops=", troops,
				" draw_calls=", snapshot.draw_calls,
				" guards=", guards,
				" primitives=", snapshot.primitives,
				" video_mem=", snapshot.video_memory,
				" objects=", snapshot.objects,
				" nodes=", snapshot.nodes,
				" resources=", snapshot.resources,
				" viewport_draws=", snapshot.visible_draw_calls, "/",
				snapshot.shadow_draw_calls, "/", snapshot.canvas_draw_calls,
				" render_cpu_ms=", snappedf(snapshot.render_cpu_ms, 0.01),
				" render_gpu_ms=", snappedf(snapshot.render_gpu_ms, 0.01),
				" process_ms=", snappedf(snapshot.process_ms, 0.01),
				" physics_ms=", snappedf(snapshot.physics_ms, 0.01),
				" navigation_ms=", snappedf(snapshot.navigation_ms, 0.01))
			# Exclude diagnostic monitor synchronization and console I/O
			# from the next measured frame.
			previous_frame_us = Time.get_ticks_usec()
			next_report_us += 1000000

	if not verbose_samples:
		fps_samples = _derive_fps_samples(frame_times_ms)

	if draw_call_samples.is_empty():
		var snapshot := _capture_fps_profile_monitor_sample()
		troop_count_samples.append(float(snapshot.troops))
		guard_count_samples.append(float(snapshot.guards))
		process_ms_samples.append(float(snapshot.process_ms))
		physics_ms_samples.append(float(snapshot.physics_ms))
		navigation_ms_samples.append(float(snapshot.navigation_ms))
		draw_call_samples.append(float(snapshot.draw_calls))
		primitive_samples.append(float(snapshot.primitives))
		video_memory_samples.append(float(snapshot.video_memory))
		texture_memory_samples.append(float(snapshot.texture_memory))
		buffer_memory_samples.append(float(snapshot.buffer_memory))
		object_samples.append(float(snapshot.objects))
		node_samples.append(float(snapshot.nodes))
		resource_samples.append(float(snapshot.resources))
		visible_draw_call_samples.append(float(snapshot.visible_draw_calls))
		shadow_draw_call_samples.append(float(snapshot.shadow_draw_calls))
		canvas_draw_call_samples.append(float(snapshot.canvas_draw_calls))
		visible_primitive_samples.append(float(snapshot.visible_primitives))
		render_cpu_ms_samples.append(float(snapshot.render_cpu_ms))
		render_gpu_ms_samples.append(float(snapshot.render_gpu_ms))

	var avg_fps: float = 0.0
	var min_fps: float = 0.0
	var median_fps: float = 0.0
	if not fps_samples.is_empty():
		min_fps = fps_samples[0]
		for fps in fps_samples:
			avg_fps += fps
			min_fps = minf(min_fps, fps)
		avg_fps /= float(fps_samples.size())
		var sorted_fps: Array[float] = fps_samples.duplicate()
		sorted_fps.sort()
		var middle: int = floori(float(sorted_fps.size()) / 2.0)
		if sorted_fps.size() % 2 == 0:
			median_fps = (sorted_fps[middle - 1] + sorted_fps[middle]) * 0.5
		else:
			median_fps = sorted_fps[middle]

	var cache_after: Dictionary = TroopCrowdBatch.pose_cache_stats()

	return {
		"avg_fps": avg_fps,
		"median_fps": median_fps,
		"min_fps": min_fps,
		"p50_frame_ms": _percentile_float_samples(frame_times_ms, 0.50),
		"p95_frame_ms": _percentile_float_samples(frame_times_ms, 0.95),
		"p99_frame_ms": _percentile_float_samples(frame_times_ms, 0.99),
		"max_frame_ms": _percentile_float_samples(frame_times_ms, 1.0),
		"frames_over_16_67_pct": _sample_ratio_over(frame_times_ms, 16.67),
		"frames_over_25_pct": _sample_ratio_over(frame_times_ms, 25.0),
		"frames_over_33_33_pct": _sample_ratio_over(frame_times_ms, 33.33),
		"frames_over_50_pct": _sample_ratio_over(frame_times_ms, 50.0),
		"physics_ticks_p50": _percentile_float_samples(
			physics_ticks_per_frame, 0.50
		),
		"physics_ticks_p95": _percentile_float_samples(
			physics_ticks_per_frame, 0.95
		),
		"physics_ticks_max": _percentile_float_samples(
			physics_ticks_per_frame, 1.0
		),
		"render_frames_with_catchup_pct": _sample_ratio_over(
			physics_ticks_per_frame, 1.0
		),
		"avg_process_ms": _average_float_samples(process_ms_samples),
		"avg_physics_ms": _average_float_samples(physics_ms_samples),
		"avg_navigation_ms": _average_float_samples(navigation_ms_samples),
		"avg_draw_calls": _average_float_samples(draw_call_samples),
		"avg_primitives": _average_float_samples(primitive_samples),
		"avg_video_memory": _average_float_samples(video_memory_samples),
		"avg_texture_memory": _average_float_samples(texture_memory_samples),
		"avg_buffer_memory": _average_float_samples(buffer_memory_samples),
		"avg_objects": _average_float_samples(object_samples),
		"avg_nodes": _average_float_samples(node_samples),
		"avg_resources": _average_float_samples(resource_samples),
		"avg_visible_draw_calls": _average_float_samples(
			visible_draw_call_samples
		),
		"avg_shadow_draw_calls": _average_float_samples(
			shadow_draw_call_samples
		),
		"avg_canvas_draw_calls": _average_float_samples(
			canvas_draw_call_samples
		),
		"avg_visible_primitives": _average_float_samples(
			visible_primitive_samples
		),
		"avg_render_cpu_ms": _average_float_samples(render_cpu_ms_samples),
		"avg_render_gpu_ms": _average_float_samples(render_gpu_ms_samples),
		"troops_min": _percentile_float_samples(troop_count_samples, 0.0),
		"troops_max": _percentile_float_samples(troop_count_samples, 1.0),
		"guards_min": _percentile_float_samples(guard_count_samples, 0.0),
		"guards_max": _percentile_float_samples(guard_count_samples, 1.0),
		"pose_cache_hits_delta": int(cache_after.get("hits", 0)) - int(
			cache_before.get("hits", 0)
		),
		"pose_cache_misses_delta": int(cache_after.get("misses", 0)) - int(
			cache_before.get("misses", 0)
		),
		"pose_cache_evictions_delta": int(
			cache_after.get("evictions", 0)
		) - int(cache_before.get("evictions", 0)),
		"pose_cache_meshes": int(cache_after.get("meshes", 0)),
		"pose_cache_vertices": int(cache_after.get("vertices", 0)),
		"pose_cache_protected": int(cache_after.get("protected", 0)),
		"fps_samples": fps_samples.size(),
		"frame_samples": frame_times_ms.size(),
	}


func _capture_fps_profile_monitor_sample() -> Dictionary:
	var viewport_rid: RID = get_viewport().get_viewport_rid()
	return {
		"troops": get_tree().get_nodes_in_group("troops").size(),
		"guards": get_tree().get_nodes_in_group("skeleton_guards").size(),
		"draw_calls": int(Performance.get_monitor(
			Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME
		)),
		"primitives": int(Performance.get_monitor(
			Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME
		)),
		"video_memory": int(Performance.get_monitor(
			Performance.RENDER_VIDEO_MEM_USED
		)),
		"texture_memory": int(Performance.get_monitor(
			Performance.RENDER_TEXTURE_MEM_USED
		)),
		"buffer_memory": int(Performance.get_monitor(
			Performance.RENDER_BUFFER_MEM_USED
		)),
		"objects": int(Performance.get_monitor(
			Performance.RENDER_TOTAL_OBJECTS_IN_FRAME
		)),
		"nodes": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"resources": int(Performance.get_monitor(
			Performance.OBJECT_RESOURCE_COUNT
		)),
		"visible_draw_calls": RenderingServer.viewport_get_render_info(
			viewport_rid,
			RenderingServer.VIEWPORT_RENDER_INFO_TYPE_VISIBLE,
			RenderingServer.VIEWPORT_RENDER_INFO_DRAW_CALLS_IN_FRAME
		),
		"shadow_draw_calls": RenderingServer.viewport_get_render_info(
			viewport_rid,
			RenderingServer.VIEWPORT_RENDER_INFO_TYPE_SHADOW,
			RenderingServer.VIEWPORT_RENDER_INFO_DRAW_CALLS_IN_FRAME
		),
		"canvas_draw_calls": RenderingServer.viewport_get_render_info(
			viewport_rid,
			RenderingServer.VIEWPORT_RENDER_INFO_TYPE_CANVAS,
			RenderingServer.VIEWPORT_RENDER_INFO_DRAW_CALLS_IN_FRAME
		),
		"visible_primitives": RenderingServer.viewport_get_render_info(
			viewport_rid,
			RenderingServer.VIEWPORT_RENDER_INFO_TYPE_VISIBLE,
			RenderingServer.VIEWPORT_RENDER_INFO_PRIMITIVES_IN_FRAME
		),
		"render_cpu_ms": RenderingServer.viewport_get_measured_render_time_cpu(
			viewport_rid
		),
		"render_gpu_ms": RenderingServer.viewport_get_measured_render_time_gpu(
			viewport_rid
		),
		"process_ms": (
			Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
		),
		"physics_ms": (
			Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
		),
		"navigation_ms": (
			Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS)
			* 1000.0
		),
	}


func _derive_fps_samples(frame_times_ms: Array[float]) -> Array[float]:
	var samples: Array[float] = []
	var elapsed_ms: float = 0.0
	var frame_count: int = 0
	for frame_ms in frame_times_ms:
		elapsed_ms += frame_ms
		frame_count += 1
		if elapsed_ms >= 1000.0:
			samples.append(float(frame_count) * 1000.0 / elapsed_ms)
			elapsed_ms = 0.0
			frame_count = 0
	if frame_count > 0 and elapsed_ms >= 500.0:
		samples.append(float(frame_count) * 1000.0 / elapsed_ms)
	return samples


func _average_float_samples(samples: Array[float]) -> float:
	if samples.is_empty():
		return 0.0
	var total: float = 0.0
	for value in samples:
		total += value
	return snappedf(total / float(samples.size()), 0.01)


func _percentile_float_samples(
	samples: Array[float],
	percentile: float
) -> float:
	if samples.is_empty():
		return 0.0
	var sorted_samples: Array[float] = samples.duplicate()
	sorted_samples.sort()
	var index := clampi(
		int(ceil(float(sorted_samples.size()) * percentile)) - 1,
		0,
		sorted_samples.size() - 1
	)
	return sorted_samples[index]


func _sample_ratio_over(samples: Array[float], threshold: float) -> float:
	if samples.is_empty():
		return 0.0
	var over_count := 0
	for sample in samples:
		if sample > threshold:
			over_count += 1
	return float(over_count) * 100.0 / float(samples.size())


func _profile_sample_duration(default_seconds: float) -> float:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--profile-sample-sec="):
			return maxf(
				1.0,
				float(arg.trim_prefix("--profile-sample-sec="))
			)
	return default_seconds


func _build_test_attack_fleet() -> Array:
	var ship_capacity: int = _ship_capacity_for_level(_test_attack_ship_level)
	var main_ship: Dictionary = {
		"id": "test_main_ship",
		"level": _test_attack_ship_level,
		"capacity": ship_capacity,
		"troops": [],
	}
	var used_slots: int = 0

	for troop_name in _test_attack_troops():
		var count: int = int(_attack_counts.get(troop_name, 0))
		var level: int = int(_attack_levels.get(troop_name, 1))
		var slot_cost: int = _attack_troop_slot_cost(troop_name)
		for _i in range(count):
			if used_slots + slot_cost > ship_capacity:
				return [main_ship]
			var troops: Array = main_ship["troops"]
			troops.append(_attack_troop_entry(troop_name, level))
			for _slot in range(slot_cost - 1):
				troops.append("_SLOT_FILLER_")
			used_slots += slot_cost

	return [main_ship] if not main_ship.get("troops", []).is_empty() else []


func _attack_troop_entry(troop_name: String, level: int) -> String:
	return "%s:L%d" % [troop_name, level]


func _attack_troop_slot_cost(troop_name: String) -> int:
	return maxi(1, int(_test_troop_def(troop_name).get("slot_cost", 1)))


func _apply_test_troop_levels() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("troop_levels" in bs):
			continue
		for troop_name in _test_attack_troops():
			bs.troop_levels[troop_name] = int(_attack_levels.get(troop_name, 1))


func set_test_speed(speed: float) -> void:
	Engine.time_scale = clampf(speed, TEST_SPEED_MIN, TEST_SPEED_MAX)
	_refresh_test_speed_label()
	_set_status("Game speed set to %s." % _format_test_speed(Engine.time_scale))


func change_test_speed(delta: float) -> void:
	set_test_speed(Engine.time_scale + delta)


func _refresh_test_speed_label() -> void:
	if _speed_label:
		_speed_label.text = _format_test_speed(Engine.time_scale)


func _format_test_speed(speed: float) -> String:
	if is_equal_approx(speed, roundf(speed)):
		return "%dx" % int(roundf(speed))
	return "%.2fx" % speed


func reset_sandbox(cancel_active_build: bool = true) -> void:
	if cancel_active_build:
		_build_generation += 1
	var attack := get_node_or_null("../AttackSystem")
	if attack and attack.has_method("exit_attack_mode"):
		attack.exit_attack_mode()
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		var bs: Node = raw_bs
		if not is_instance_valid(bs):
			continue
		var battle: BSBattle = bs.get("_battle")
		if battle:
			battle.reset()
		bs.set("is_viewing_enemy", false)
		if bs.has_method("_destroy_all_buildings"):
			bs._destroy_all_buildings()
	reset_test_ship_abilities(false)
	_refresh_test_ship_ability_hud()
	_set_status("Sandbox reset.")


func toggle_music() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if not audio or not audio.has_method("toggle_music"):
		_set_status("AudioManager not found.")
		return
	var enabled: bool = audio.toggle_music()
	_set_status("Music ON." if enabled else "Music OFF.")


func _last_building_at(bs: Node, building_id: String, grid_pos: Vector2i) -> Dictionary:
	if not bs or not ("placed_buildings" in bs):
		return {}
	for i in range(bs.placed_buildings.size() - 1, -1, -1):
		var b: Dictionary = bs.placed_buildings[i]
		if str(b.get("id", "")) == building_id and b.get("grid_pos", Vector2i.ZERO) == grid_pos:
			return b
	return {}


func _active_building_system() -> Node:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if "selected_building" in bs and not bs.selected_building.is_empty():
			return bs
	return _building_system_for_grid("main")


func _building_system_for_building(building_id: String) -> Node:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if _building_system_allows(bs, building_id):
			return bs
	return null


func _set_building_level_immediate(bs: Node, b: Dictionary, def: Dictionary, target_level: int) -> void:
	var level: int = clampi(target_level, 1, _max_level_for_def(def))
	b["level"] = level
	b["max_hp"] = bs._get_hp_for(def, level)
	b["hp"] = b["max_hp"]
	if b.has("node") and is_instance_valid(b["node"]):
		b["node"].set_meta("building_level", level)
	if bs.has_method("_apply_building_runtime_level"):
		bs._apply_building_runtime_level(b)


func _set_building_level_for_test(bs: Node, b: Dictionary, def: Dictionary, target_level: int) -> void:
	var level: int = clampi(target_level, 1, _max_level_for_def(def))
	if level <= 1:
		_set_building_level_immediate(bs, b, def, 1)
		return
	if not bs.has_method("_run_upgrade_sequence"):
		_set_building_level_immediate(bs, b, def, level)
		return
	b["is_upgrading"] = true
	await bs._run_upgrade_sequence(b, def, level)


func _copy_building_runtime_meta(source: Dictionary, clone: Dictionary) -> void:
	var src_node: Node = source.get("node", null)
	var clone_node: Node = clone.get("node", null)
	if not is_instance_valid(src_node) or not is_instance_valid(clone_node):
		return
	for meta_name in ["has_ship", "ship_level", "ship_troops", "ship_troops_template"]:
		if src_node.has_meta(meta_name):
			clone_node.set_meta(meta_name, src_node.get_meta(meta_name))


func _random_free_grid_pos_near(bs: Node, def: Dictionary, origin: Vector2i) -> Vector2i:
	if not bs or def.is_empty() or not ("grid_width" in bs) or not ("grid_height" in bs):
		return Vector2i(-1, -1)
	var cells: Vector2i = def.get("cells", Vector2i.ONE)
	var max_x: int = int(bs.grid_width) - cells.x
	var max_z: int = int(bs.grid_height) - cells.y
	if max_x < 0 or max_z < 0:
		return Vector2i(-1, -1)
	var max_radius: int = maxi(int(bs.grid_width), int(bs.grid_height))
	for radius in range(1, max_radius + 1):
		for z in range(origin.y - radius, origin.y + radius + 1):
			for x in range(origin.x - radius, origin.x + radius + 1):
				if x < 0 or z < 0 or x > max_x or z > max_z:
					continue
				if abs(x - origin.x) != radius and abs(z - origin.y) != radius:
					continue
				var gp: Vector2i = Vector2i(x, z)
				if bs.has_method("_can_place") and bs._can_place(gp, cells):
					return gp
	return _random_free_grid_pos(bs, def)


func _random_free_grid_pos(bs: Node, def: Dictionary) -> Vector2i:
	if not bs or def.is_empty() or not ("grid_width" in bs) or not ("grid_height" in bs):
		return Vector2i(-1, -1)
	var cells: Vector2i = def.get("cells", Vector2i.ONE)
	var max_x: int = int(bs.grid_width) - cells.x
	var max_z: int = int(bs.grid_height) - cells.y
	if max_x < 0 or max_z < 0:
		return Vector2i(-1, -1)
	var candidates: Array[Vector2i] = []
	for z in range(max_z + 1):
		for x in range(max_x + 1):
			candidates.append(Vector2i(x, z))
	candidates.shuffle()
	for gp in candidates:
		if bs.has_method("_can_place") and bs._can_place(gp, cells):
			return gp
	return Vector2i(-1, -1)


func _set_random_building_level(bs: Node, b: Dictionary, def: Dictionary) -> void:
	var max_level: int = _max_level_for_def(def)
	var target_level: int = randi_range(1, max_level)
	if target_level <= 1:
		return
	b["is_upgrading"] = true
	await bs._run_upgrade_sequence(b, def, target_level)


func _max_supported_town_hall_level() -> int:
	var levels: Array = BuildingSystem.TH_MAX_LEVEL.get("town_hall", [])
	return maxi(1, levels.size())


func _active_building_ids() -> Array[String]:
	var ids: Array[String] = []
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("building_defs" in bs):
			continue
		for raw_id in bs.building_defs.keys():
			var building_id := String(raw_id)
			var def: Dictionary = bs.building_defs.get(building_id, {})
			if building_id == "flag" or bool(def.get("no_shop", false)):
				continue
			if _building_system_allows(bs, building_id) and not ids.has(building_id):
				ids.append(building_id)
	ids.sort_custom(Callable(self, "_building_id_less"))
	return ids


func _max_village_build_order() -> Array[String]:
	return _active_building_ids()


func _building_id_less(left: String, right: String) -> bool:
	if left == "town_hall":
		return right != "town_hall"
	if right == "town_hall":
		return false
	var left_unlock: int = _building_unlock_level(left)
	var right_unlock: int = _building_unlock_level(right)
	if left_unlock != right_unlock:
		return left_unlock < right_unlock
	return left.naturalnocasecmp_to(right) < 0


func _building_unlock_level(building_id: String) -> int:
	var bs: Node = _building_system_for_building(building_id)
	var definition_unlock: int = 1
	if bs and "building_defs" in bs:
		definition_unlock = int(bs.building_defs.get(building_id, {}).get("min_town_hall_level", 1))
	return maxi(definition_unlock, int(BuildingSystem.TH_UNLOCK.get(building_id, 1)))


func _building_system_allows(bs: Node, building_id: String) -> bool:
	if not bs or not ("building_defs" in bs) or not bs.building_defs.has(building_id):
		return false
	if "allowed_buildings" in bs and not bs.allowed_buildings.is_empty() and building_id not in bs.allowed_buildings:
		return false
	if "blocked_buildings" in bs and building_id in bs.blocked_buildings:
		return false
	return true


func _test_attack_troops() -> Array[String]:
	var bs: Node = _building_system_for_grid("main")
	if not bs or not ("troop_defs" in bs):
		return []
	var available: Array[String] = []
	for raw_name in bs.troop_defs.keys():
		var troop_name := String(raw_name)
		if AttackSystem.TROOP_DEFS.has(troop_name):
			available.append(troop_name)

	var ordered: Array[String] = []
	for troop_name in TEST_ATTACK_PREFERRED_ORDER:
		if available.has(troop_name):
			ordered.append(troop_name)
			available.erase(troop_name)
	available.sort()
	ordered.append_array(available)
	return ordered


func _test_troop_def(troop_name: String) -> Dictionary:
	var bs: Node = _building_system_for_grid("main")
	if bs and "troop_defs" in bs:
		return bs.troop_defs.get(troop_name, {})
	return {}


func _test_troop_display_name(troop_name: String) -> String:
	var display_name := String(_test_troop_def(troop_name).get("display", troop_name))
	var role_start: int = display_name.find(" (")
	return display_name.left(role_start) if role_start > 0 else display_name


func _test_attack_max_level(troop_name: String) -> int:
	return maxi(1, int(_test_troop_def(troop_name).get("max_level", 1)))


func _max_test_ship_level() -> int:
	var max_level: int = 1
	for raw_level in BuildingSystem.PLAYER_SHIP_LEVELS.keys():
		max_level = maxi(max_level, int(raw_level))
	return max_level


func _ship_capacity_for_level(ship_level: int) -> int:
	var normalized_level: int = clampi(ship_level, 1, _max_test_ship_level())
	return maxi(1, int(BuildingSystem.PLAYER_SHIP_LEVELS.get(normalized_level, {}).get("capacity", 1)))


func _selected_attack_slots() -> int:
	var used_slots: int = 0
	for troop_name in _test_attack_troops():
		used_slots += int(_attack_counts.get(troop_name, 0)) * _attack_troop_slot_cost(troop_name)
	return used_slots


func _change_test_ship_level(delta: int) -> void:
	var next_level: int = clampi(_test_attack_ship_level + delta, 1, _max_test_ship_level())
	if _ship_capacity_for_level(next_level) < _selected_attack_slots():
		_set_status("Remove troops before lowering the Main Ship level.")
		return
	_test_attack_ship_level = next_level
	_refresh_test_ship_row()


func _refresh_test_ship_row() -> void:
	if _test_ship_level_label:
		_test_ship_level_label.text = "L%d" % _test_attack_ship_level
	if _test_ship_capacity_label:
		_test_ship_capacity_label.text = "%d / %d slots" % [
			_selected_attack_slots(),
			_ship_capacity_for_level(_test_attack_ship_level),
		]


func _max_building_count_for_th(building_id: String, th_level: int) -> int:
	if building_id == "town_hall":
		return 1
	if th_level < _building_unlock_level(building_id):
		return 0
	var limits: Array = BuildingSystem.TH_MAX_COUNT.get(building_id, [])
	if limits.is_empty():
		return 1
	var idx: int = clampi(th_level - 1, 0, limits.size() - 1)
	return int(limits[idx])


func _target_building_level_for_th(building_id: String, def: Dictionary, th_level: int) -> int:
	var bs: Node = _building_system_for_building(building_id)
	if bs and bs.has_method("_get_building_max_level_for_th"):
		return int(bs._get_building_max_level_for_th(building_id, th_level))
	return mini(th_level, _max_level_for_def(def))


func _max_level_for_def(def: Dictionary) -> int:
	var max_level: int = 1
	for key in ["hp_levels", "scenes", "model_scales", "model_offsets"]:
		if def.has(key):
			max_level = maxi(max_level, int(def.get(key, []).size()))
	return max_level


func _building_system_for_grid(grid_name: String) -> Node:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		var plane: Node = bs.get_node_or_null(bs.grid_plane_path)
		if not plane:
			continue
		if grid_name == "main" and plane.name == "gridPlane":
			return bs
		if grid_name == "port" and plane.name == "gridPlane2":
			return bs
		if grid_name == "ship" and plane.name == "shipPlane":
			return bs
	return null


func _select_first_town_hall() -> void:
	var bs: Node = _building_system_for_grid("main")
	if not bs:
		return
	for b in bs.placed_buildings:
		if b.get("id", "") == "town_hall":
			bs._select_building(b)
			return


func _give_test_resources() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("resources" in bs):
			continue
		bs.resources = {"gold": 100000, "wood": 100000, "ore": 100000}
		if bs.has_method("_update_resource_ui"):
			bs._update_resource_ui()
		if bs.has_method("_send_resource_caps"):
			bs._send_resource_caps()


func _sync_all_building_systems() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if bs.has_method("_sync_react_buildings"):
			bs._sync_react_buildings()


func _configure_test_ship(bs: Node, b: Dictionary, ship_level: int) -> void:
	var node: Node = b.get("node", null)
	if not is_instance_valid(node):
		return
	var normalized_level: int = clampi(ship_level, 1, _max_test_ship_level())
	var troops: Array = []
	var capacity: int = _ship_capacity_for_level(normalized_level)
	for troop_name in _test_attack_troops():
		var slot_cost: int = _attack_troop_slot_cost(troop_name)
		if troops.size() + slot_cost > capacity:
			break
		troops.append(_attack_troop_entry(troop_name, _test_attack_max_level(troop_name)))
		for _slot in range(slot_cost - 1):
			troops.append("_SLOT_FILLER_")
	node.set_meta("has_ship", true)
	node.set_meta("ship_level", normalized_level)
	node.set_meta("ship_troops", troops)
	node.set_meta("ship_troops_template", troops.duplicate(true))
	if bs and bs.has_method("_spawn_port_ship"):
		var old_ship_node: Node = node.get_meta("ship_node", null)
		if is_instance_valid(old_ship_node):
			old_ship_node.queue_free()
		if node.has_meta("ship_node"):
			node.remove_meta("ship_node")
		bs._spawn_port_ship(b)


func _verify_test_scene_parity() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	var failures: Array[String] = []
	var test_root: Node = get_parent()

	var main_scene: PackedScene = load("res://scenes/Main.tscn")
	if main_scene == null:
		failures.append("Main.tscn could not be loaded")
	else:
		var main_root: Node = main_scene.instantiate()
		var production_paths: Array[String] = []
		_collect_scene_paths(main_root, "", production_paths)
		for node_path in production_paths:
			if test_root.get_node_or_null(NodePath(node_path)) == null:
				failures.append("missing Main node: %s" % node_path)
		main_root.free()

	var building_systems: Array[Node] = []
	for raw_bs in get_tree().get_nodes_in_group("building_systems"):
		var bs: Node = raw_bs
		building_systems.append(bs)
		if not bool(bs.get("test_mode")):
			failures.append("%s is not in test_mode" % bs.name)
	if building_systems.is_empty():
		failures.append("no BuildingSystem nodes registered")

	var building_ids: Array[String] = _active_building_ids()
	var spawn_ids: Array[String] = []
	if _spawn_list:
		for child in _spawn_list.get_children():
			if child.has_meta("building_id"):
				spawn_ids.append(String(child.get_meta("building_id")))
	for building_id in building_ids:
		if not spawn_ids.has(building_id):
			failures.append("building missing from spawn tools: %s" % building_id)

	var main_bs: Node = _building_system_for_grid("main")
	var expected_troops: Array[String] = []
	if main_bs and "troop_defs" in main_bs:
		for raw_name in main_bs.troop_defs.keys():
			var troop_name := String(raw_name)
			expected_troops.append(troop_name)
			if not AttackSystem.TROOP_DEFS.has(troop_name):
				failures.append("troop has no AttackSystem definition: %s" % troop_name)
	else:
		failures.append("main BuildingSystem troop registry unavailable")

	var loadout_troops: Array[String] = []
	if _attack_loadout_box:
		for child in _attack_loadout_box.get_children():
			if child.has_meta("troop_name"):
				loadout_troops.append(String(child.get_meta("troop_name")))
	for troop_name in expected_troops:
		if AttackSystem.TROOP_DEFS.has(troop_name) and not loadout_troops.has(troop_name):
			failures.append("troop missing from loadout tools: %s" % troop_name)

	_test_attack_ship_level = _max_test_ship_level()
	mixed_test_attack_loadout()
	var fleet: Array = _build_test_attack_fleet()
	var fleet_troops: Array[String] = []
	if not fleet.is_empty():
		for raw_entry in fleet[0].get("troops", []):
			var entry := String(raw_entry)
			if entry != "_SLOT_FILLER_":
				fleet_troops.append(entry.get_slice(":", 0))
	for troop_name in _test_attack_troops():
		if not fleet_troops.has(troop_name):
			failures.append("troop missing from mixed fleet: %s" % troop_name)
	if not _load_test_attack_army(false):
		failures.append("mixed fleet could not be loaded into MainShipController")

	if not failures.is_empty():
		for failure in failures:
			push_error("[TEST_SCENE_PARITY] %s" % failure)
		get_tree().quit(1)
		return
	print("[TEST_SCENE_PARITY] PASS main_nodes=%d buildings=%d troops=%d ship_level=%d capacity=%d" % [
		_count_scene_paths("res://scenes/Main.tscn"),
		building_ids.size(),
		expected_troops.size(),
		_test_attack_ship_level,
		_ship_capacity_for_level(_test_attack_ship_level),
	])
	get_tree().quit()


func _collect_scene_paths(node: Node, prefix: String, output: Array[String]) -> void:
	for child in node.get_children():
		var child_path := String(child.name) if prefix.is_empty() else "%s/%s" % [prefix, child.name]
		output.append(child_path)
		# Imported GLB/PackedScene descendants are runtime implementation details.
		# Their owners may legally reparent or replace them while the authored
		# TestMain/Main boundary remains identical.
		if not String(child.scene_file_path).is_empty():
			continue
		_collect_scene_paths(child, child_path, output)


func _count_scene_paths(scene_path: String) -> int:
	var packed: PackedScene = load(scene_path)
	if packed == null:
		return 0
	var root: Node = packed.instantiate()
	var paths: Array[String] = []
	_collect_scene_paths(root, "", paths)
	root.free()
	return paths.size()


func _set_status(text: String) -> void:
	if _status:
		_status.text = text
	print("[TestHarness] ", text)
