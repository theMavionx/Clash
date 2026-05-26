extends Node
## Test-only one-button village builder for scenes/TestMain.tscn.

var _panel: PanelContainer
var _status: Label
var _spawn_list: VBoxContainer
var _build_generation: int = 0
var _attack_counts: Dictionary = {}
var _attack_levels: Dictionary = {}
var _attack_count_labels: Dictionary = {}
var _attack_level_labels: Dictionary = {}
var _speed_label: Label

const MAX_VILLAGE_BUILD_ORDER: Array[String] = [
	"town_hall",
	"mine",
	"sawmill",
	"barn",
	"storage",
	"tombstone",
	"archer_tower",
	"turret",
	"mage_tower",
	"port",
]

const TEST_TH_MAX_COUNT: Dictionary = {
	"mine": [1, 2, 3, 3],
	"sawmill": [1, 2, 3, 3],
	"barn": [1, 1, 1, 1],
	"port": [1, 2, 5, 5],
	"archer_tower": [1, 2, 3, 3],
	"tombstone": [0, 1, 3, 3],
	"turret": [0, 0, 3, 3],
	"storage": [0, 1, 2, 3],
	"mage_tower": [0, 0, 0, 2],
	"town_hall": [1, 1, 1, 1],
}

const TEST_ATTACK_TROOPS: Array[String] = ["Knight", "Mage", "Barbarian", "Archer", "Ranger", "DemonKing"]
const TEST_ATTACK_MAX_LEVEL: Dictionary = {
	"Knight": 4,
	"Mage": 4,
	"Barbarian": 4,
	"Archer": 4,
	"Ranger": 4,
	"DemonKing": 3,
}
const TEST_ATTACK_SHIP_LEVEL: int = 3
const TEST_SPEED_PRESETS: Array[float] = [0.5, 1.0, 2.0, 4.0]
const TEST_SPEED_STEP: float = 0.25
const TEST_SPEED_MIN: float = 0.25
const TEST_SPEED_MAX: float = 8.0


func _core_layout() -> Array:
	return [
		{"grid": "main", "id": "town_hall", "pos": Vector2i(11, 10)},
		{"grid": "main", "id": "mine", "pos": Vector2i(4, 5)},
		{"grid": "main", "id": "sawmill", "pos": Vector2i(8, 5)},
		{"grid": "main", "id": "barn", "pos": Vector2i(15, 5)},
		{"grid": "main", "id": "storage", "pos": Vector2i(3, 12)},
		{"grid": "main", "id": "tombstone", "pos": Vector2i(8, 13)},
		{"grid": "main", "id": "archer_tower", "pos": Vector2i(15, 13)},
		{"grid": "main", "id": "turret", "pos": Vector2i(20, 10)},
		{"grid": "main", "id": "mage_tower", "pos": Vector2i(20, 15)},
		{"grid": "port", "id": "port", "pos": Vector2i(2, 0)},
		{"grid": "port", "id": "port", "pos": Vector2i(8, 0)},
		{"grid": "port", "id": "port", "pos": Vector2i(14, 0)},
	]


func _ready() -> void:
	_create_panel()
	call_deferred("_populate_spawn_list")
	call_deferred("_set_status", "Scene ready. F1 panel, 1 build random village.")


func _exit_tree() -> void:
	Engine.time_scale = 1.0


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

	var max_label := Label.new()
	max_label.text = "Max Village by Town Hall"
	max_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(max_label)

	var max_row := HBoxContainer.new()
	max_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	max_row.add_theme_constant_override("separation", 6)
	vbox.add_child(max_row)
	for th_level in range(1, 5):
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


func _add_attack_loadout_controls(vbox: VBoxContainer) -> void:
	var attack_label := Label.new()
	attack_label.text = "Test Attack Loadout"
	attack_label.add_theme_font_size_override("font_size", 17)
	vbox.add_child(attack_label)

	var attack_box := VBoxContainer.new()
	attack_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	attack_box.add_theme_constant_override("separation", 5)
	vbox.add_child(attack_box)

	for troop_name in TEST_ATTACK_TROOPS:
		_attack_counts[troop_name] = 0
		_attack_levels[troop_name] = int(TEST_ATTACK_MAX_LEVEL.get(troop_name, 4))
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 4)
		attack_box.add_child(row)

		var name_label := Label.new()
		name_label.text = troop_name
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

	var presets := HBoxContainer.new()
	presets.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	presets.add_theme_constant_override("separation", 6)
	vbox.add_child(presets)
	presets.add_child(_small_button("Clear", clear_test_attack_loadout))
	presets.add_child(_small_button("Mixed x1", mixed_test_attack_loadout))
	presets.add_child(_small_button("Start", start_test_attack))


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


func _populate_spawn_list() -> void:
	if not _spawn_list:
		return
	var bs: Node = _building_system_for_grid("main")
	if not bs:
		call_deferred("_populate_spawn_list")
		return
	var ids: Array = bs.building_defs.keys()
	ids.sort()
	for child in _spawn_list.get_children():
		child.queue_free()
	for building_id in ids:
		var def: Dictionary = bs.building_defs.get(building_id, {})
		if def.get("no_shop", false):
			continue
		if String(building_id) == "flag":
			continue
		_add_spawn_row(String(building_id), def)
	_add_ship_spawn_row()


func _add_spawn_row(building_id: String, def: Dictionary) -> void:
	var box := VBoxContainer.new()
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

	for level in range(1, 4):
		var btn := Button.new()
		btn.text = str(level)
		btn.custom_minimum_size = Vector2(42, 38)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 16)
		btn.pressed.connect(Callable(self, "spawn_ship_level").bind(level))
		levels.add_child(btn)


func spawn_ship_level(target_level: int) -> void:
	var spawned: bool = await spawn_building_level("port", target_level)
	if spawned:
		_set_status("Spawned Ship level %d with a Port." % target_level)


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
		var bs := _building_system_for_grid(String(item.grid))
		if not bs:
			continue
		var building_id := String(item.id)
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


func build_max_village_for_town_hall(th_level: int) -> void:
	th_level = clampi(th_level, 1, 4)
	_build_generation += 1
	var generation := _build_generation
	reset_sandbox(false)
	await get_tree().process_frame
	if generation != _build_generation:
		return

	var spawned_count: int = 0
	randomize()
	for building_id in MAX_VILLAGE_BUILD_ORDER:
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


func _change_attack_count(troop_name: String, delta: int) -> void:
	var current: int = int(_attack_counts.get(troop_name, 0))
	_attack_counts[troop_name] = clampi(current + delta, 0, 45)
	_refresh_attack_row(troop_name)


func _change_attack_level(troop_name: String, delta: int) -> void:
	var max_level: int = int(TEST_ATTACK_MAX_LEVEL.get(troop_name, 4))
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
	for troop_name in TEST_ATTACK_TROOPS:
		_attack_counts[troop_name] = 0
		_refresh_attack_row(troop_name)
	_set_status("Attack loadout cleared.")


func mixed_test_attack_loadout() -> void:
	for troop_name in TEST_ATTACK_TROOPS:
		_attack_counts[troop_name] = 1
		_refresh_attack_row(troop_name)
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
	_apply_test_troop_levels()
	attack.enter_attack_mode(fleet)
	var total_troops: int = 0
	for ship in fleet:
		for troop_name in ship.get("troops", []):
			if troop_name != "_SLOT_FILLER_":
				total_troops += 1
	_set_status("Attack ready: %d troops on %d ships. Click ship water." % [total_troops, fleet.size()])


func _build_test_attack_fleet() -> Array:
	var attack := get_node_or_null("../AttackSystem")
	var max_ships: int = int(attack.max_ships) if attack and ("max_ships" in attack) else 5
	var ship_capacity: int = TEST_ATTACK_SHIP_LEVEL * 3
	var fleet: Array = []
	var current_ship: Dictionary = {"level": TEST_ATTACK_SHIP_LEVEL, "troops": []}
	var used_slots: int = 0

	for troop_name in TEST_ATTACK_TROOPS:
		var count: int = int(_attack_counts.get(troop_name, 0))
		var level: int = int(_attack_levels.get(troop_name, 1))
		var slot_cost: int = _attack_troop_slot_cost(troop_name)
		for _i in range(count):
			if used_slots + slot_cost > ship_capacity:
				fleet.append(current_ship)
				if fleet.size() >= max_ships:
					return fleet
				current_ship = {"level": TEST_ATTACK_SHIP_LEVEL, "troops": []}
				used_slots = 0
			var troops: Array = current_ship["troops"]
			troops.append(_attack_troop_entry(troop_name, level))
			for _slot in range(slot_cost - 1):
				troops.append("_SLOT_FILLER_")
			used_slots += slot_cost

	if not current_ship.get("troops", []).is_empty() and fleet.size() < max_ships:
		fleet.append(current_ship)
	return fleet


func _attack_troop_entry(troop_name: String, level: int) -> String:
	return "%s:L%d" % [troop_name, level]


func _attack_troop_slot_cost(troop_name: String) -> int:
	return 2 if troop_name == "DemonKing" else 1


func _apply_test_troop_levels() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not ("troop_levels" in bs):
			continue
		for troop_name in TEST_ATTACK_TROOPS:
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
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if bs and bs.has_method("_destroy_all_buildings"):
			bs._destroy_all_buildings()
	var attack := get_node_or_null("../AttackSystem")
	if attack and attack.has_method("exit_attack_mode"):
		attack.exit_attack_mode()
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
	if building_id == "port":
		return _building_system_for_grid("port")
	return _building_system_for_grid("main")


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


func _max_building_count_for_th(building_id: String, th_level: int) -> int:
	if building_id == "town_hall":
		return 1
	var limits: Array = TEST_TH_MAX_COUNT.get(building_id, [])
	if limits.is_empty():
		return 0
	var idx: int = clampi(th_level - 1, 0, limits.size() - 1)
	return int(limits[idx])


func _target_building_level_for_th(building_id: String, def: Dictionary, th_level: int) -> int:
	if building_id == "town_hall":
		return clampi(th_level, 1, _max_level_for_def(def))
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
	var troops: Array = ["Knight", "Mage", "Archer", "Barbarian", "Ranger", "DemonKing", "_SLOT_FILLER_"]
	var capacity: int = ship_level * 3
	node.set_meta("has_ship", true)
	node.set_meta("ship_level", ship_level)
	node.set_meta("ship_troops", troops.slice(0, mini(capacity, troops.size())))
	node.set_meta("ship_troops_template", node.get_meta("ship_troops"))
	if bs and bs.has_method("_spawn_port_ship"):
		var old_ship_node: Node = node.get_meta("ship_node", null)
		if is_instance_valid(old_ship_node):
			old_ship_node.queue_free()
		if node.has_meta("ship_node"):
			node.remove_meta("ship_node")
		bs._spawn_port_ship(b)


func _set_status(text: String) -> void:
	if _status:
		_status.text = text
	print("[TestHarness] ", text)
