extends CanvasLayer

# ============================================================
#  Build UI — реальні FBX-моделі, надійне розміщення
# ============================================================

const BUILDINGS = [
	{
		"name": "Барак",
		"icon": "⚔️",
		"desc": "Тренує воїнів",
		"model_path": "res://Objects/Barracks-dvlksXgxWc/Barracks_SecondAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 40.0,
	},
	{
		"name": "Порт",
		"icon": "⚓",
		"desc": "Торгівля та флот",
		"model_path": "res://Objects/Port/Port_FirstAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 50.0,
	},
	{
		"name": "Ферма",
		"icon": "🌾",
		"desc": "Виробляє їжу",
		"model_path": "res://Objects/Farm/Farm_SecondAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 45.0,
	},
	{
		"name": "Вежа",
		"icon": "🗼",
		"desc": "Захисна вежа",
		"model_path": "res://Objects/Watch Tower/WatchTower_FirstAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 30.0,
	},
	{
		"name": "Шахта",
		"icon": "⛏️",
		"desc": "Видобуває ресурси",
		"model_path": "res://Objects/Mine/Mine.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 35.0,
	},
]

# --- Preloaded packed scenes (loaded in _ready) ---
var _packed_scenes: Array[PackedScene] = []

# --- State ---
var _panel_open       : bool = false
var _placing          : bool = false
var _selected_index   : int  = -1
var _ghost_node       : Node3D = null
var _ghost_mat        : StandardMaterial3D = null
var _ghost_radius     : float = 0.0
var _placement_valid  : bool = true
var _placed_data      : Array = []   # [{pos, radius}] of placed buildings

# --- Click detection ---
var _prev_lmb: bool = false

# --- UI refs ---
var _panel        : PanelContainer
var _build_btn    : Button
var _cancel_btn   : Button
var _status_label : Label
var _feedback_lbl : Label
var _feedback_timer: float = 0.0


# ============================================================
func _ready() -> void:
	_preload_models()
	_build_ui()


func _preload_models() -> void:
	_packed_scenes.resize(BUILDINGS.size())
	for i in BUILDINGS.size():
		var path: String = BUILDINGS[i]["model_path"]
		if ResourceLoader.exists(path):
			_packed_scenes[i] = load(path) as PackedScene
			if _packed_scenes[i]:
				print("✅ Завантажено: " + BUILDINGS[i]["name"])
			else:
				push_error("❌ Не вдалось завантажити (cast fail): " + path)
		else:
			push_error("❌ Файл не знайдено: " + path)


# ============================================================
#  UI CONSTRUCTION
# ============================================================
func _build_ui() -> void:

	# ---- Status label ----
	_status_label = Label.new()
	_status_label.anchor_left   = 0.0
	_status_label.anchor_right  = 1.0
	_status_label.anchor_top    = 0.0
	_status_label.anchor_bottom = 0.0
	_status_label.offset_top    = 14
	_status_label.offset_bottom = 52
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.vertical_alignment   = VERTICAL_ALIGNMENT_CENTER
	_status_label.visible = false
	_status_label.add_theme_font_size_override("font_size", 20)
	_status_label.add_theme_color_override("font_color", Color(1, 0.95, 0.55))
	add_child(_status_label)

	# ---- Feedback label (flashes "Поставлено!") ----
	_feedback_lbl = Label.new()
	_feedback_lbl.anchor_left   = 0.0
	_feedback_lbl.anchor_right  = 1.0
	_feedback_lbl.anchor_top    = 0.5
	_feedback_lbl.anchor_bottom = 0.5
	_feedback_lbl.offset_top    = -30
	_feedback_lbl.offset_bottom =  30
	_feedback_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_feedback_lbl.visible = false
	_feedback_lbl.add_theme_font_size_override("font_size", 32)
	_feedback_lbl.add_theme_color_override("font_color", Color(0.3, 1.0, 0.4))
	add_child(_feedback_lbl)

	# ---- Bottom bar ----
	var bottom_bar := HBoxContainer.new()
	bottom_bar.anchor_left   = 0.5
	bottom_bar.anchor_right  = 0.5
	bottom_bar.anchor_top    = 1.0
	bottom_bar.anchor_bottom = 1.0
	bottom_bar.offset_left   = -190
	bottom_bar.offset_right  =  190
	bottom_bar.offset_top    = -80
	bottom_bar.offset_bottom = -14
	bottom_bar.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom_bar.add_theme_constant_override("separation", 12)
	add_child(bottom_bar)

	_build_btn = _make_button("🔨  Будівля", Color(0.95, 0.70, 0.15), Color(0.15, 0.08, 0.02))
	_build_btn.custom_minimum_size = Vector2(180, 56)
	_build_btn.pressed.connect(_on_build_pressed)
	bottom_bar.add_child(_build_btn)

	_cancel_btn = _make_button("✕  Скасувати", Color(0.80, 0.18, 0.10), Color(1, 1, 1))
	_cancel_btn.custom_minimum_size = Vector2(165, 56)
	_cancel_btn.visible = false
	_cancel_btn.pressed.connect(_cancel_placement)
	bottom_bar.add_child(_cancel_btn)

	# ---- Building panel ----
	_panel = PanelContainer.new()
	_panel.anchor_left   = 0.0
	_panel.anchor_right  = 1.0
	_panel.anchor_top    = 1.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left   =  30
	_panel.offset_right  = -30
	_panel.offset_top    = -300
	_panel.offset_bottom = -90
	_panel.visible = false

	var ps := StyleBoxFlat.new()
	ps.bg_color = Color(0.10, 0.08, 0.05, 0.93)
	ps.border_color = Color(0.95, 0.70, 0.15)
	ps.set_border_width_all(2)
	ps.corner_radius_top_left     = 16
	ps.corner_radius_top_right    = 16
	ps.corner_radius_bottom_left  = 8
	ps.corner_radius_bottom_right = 8
	_panel.add_theme_stylebox_override("panel", ps)
	add_child(_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 8)
	_panel.add_child(vbox)

	var title := Label.new()
	title.text = "⚒  Оберіть будівлю"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.custom_minimum_size.y = 40
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.95, 0.70, 0.15))
	vbox.add_child(title)

	var sep := HSeparator.new()
	sep.add_theme_color_override("color", Color(0.95, 0.70, 0.15, 0.5))
	vbox.add_child(sep)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size.y = 172
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.vertical_scroll_mode   = ScrollContainer.SCROLL_MODE_DISABLED
	vbox.add_child(scroll)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 14)
	scroll.add_child(hbox)

	for i in BUILDINGS.size():
		hbox.add_child(_make_card(i))


func _make_card(idx: int) -> Control:
	var b: Dictionary = BUILDINGS[idx]
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(128, 155)

	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.18, 0.14, 0.08, 1.0)
	style.border_color = Color(0.95, 0.70, 0.15)
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	card.add_theme_stylebox_override("panel", style)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", 5)
	card.add_child(vb)

	var icon_lbl := Label.new()
	icon_lbl.text = b["icon"]
	icon_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon_lbl.add_theme_font_size_override("font_size", 42)
	vb.add_child(icon_lbl)

	var name_lbl := Label.new()
	name_lbl.text = b["name"]
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.add_theme_font_size_override("font_size", 15)
	name_lbl.add_theme_color_override("font_color", Color(0.95, 0.85, 0.55))
	vb.add_child(name_lbl)

	var desc_lbl := Label.new()
	desc_lbl.text = b["desc"]
	desc_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD
	desc_lbl.add_theme_font_size_override("font_size", 11)
	desc_lbl.add_theme_color_override("font_color", Color(0.70, 0.70, 0.70))
	vb.add_child(desc_lbl)

	# Grey overlay if model failed to load
	if _packed_scenes.size() > idx and _packed_scenes[idx] == null:
		desc_lbl.text = "⚠ Помилка завантаження"
		desc_lbl.add_theme_color_override("font_color", Color(1, 0.4, 0.4))

	var btn := Button.new()
	btn.flat = true
	btn.anchor_left   = 0.0
	btn.anchor_right  = 1.0
	btn.anchor_top    = 0.0
	btn.anchor_bottom = 1.0
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	card.add_child(btn)
	btn.pressed.connect(_on_building_selected.bind(idx))
	return card


func _make_button(txt: String, bg: Color, fg: Color) -> Button:
	var btn := Button.new()
	btn.text = txt
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.set_corner_radius_all(12)
	style.set_content_margin_all(14)
	btn.add_theme_stylebox_override("normal", style)
	var hov := style.duplicate() as StyleBoxFlat
	hov.bg_color = bg.lightened(0.15)
	btn.add_theme_stylebox_override("hover", hov)
	var pr := style.duplicate() as StyleBoxFlat
	pr.bg_color = bg.darkened(0.15)
	btn.add_theme_stylebox_override("pressed", pr)
	btn.add_theme_color_override("font_color", fg)
	btn.add_theme_font_size_override("font_size", 18)
	return btn


# ============================================================
#  ACTIONS
# ============================================================
func _on_build_pressed() -> void:
	_panel_open = !_panel_open
	_panel.visible = _panel_open
	_build_btn.text = "✕  Закрити" if _panel_open else "🔨  Будівля"


func _on_building_selected(idx: int) -> void:
	if idx >= _packed_scenes.size() or _packed_scenes[idx] == null:
		push_error("Модель не завантажена для: " + BUILDINGS[idx]["name"])
		return
	_selected_index     = idx
	_panel.visible      = false
	_panel_open         = false
	_build_btn.text     = "🔨  Будівля"
	_build_btn.visible  = false
	_cancel_btn.visible = true
	_status_label.text    = "Клікни на острів щоб поставити «" + BUILDINGS[idx]["name"] + "»   |   ESC — скасувати"
	_status_label.visible = true
	_placing              = true
	_prev_lmb             = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	_create_ghost(idx)


func _cancel_placement() -> void:
	_placing              = false
	_selected_index       = -1
	_build_btn.visible    = true
	_cancel_btn.visible   = false
	_status_label.visible = false
	if _ghost_node:
		_ghost_node.queue_free()
		_ghost_node = null


# ============================================================
#  GHOST — реальна модель напівпрозора
# ============================================================
const RAY_LENGTH: float = 2000.0

func _create_ghost(idx: int) -> void:
	if _ghost_node:
		_ghost_node.queue_free()
		_ghost_node = null
	_ghost_mat = null
	if _packed_scenes[idx] == null:
		return
	_ghost_node = _packed_scenes[idx].instantiate() as Node3D
	_ghost_node.scale = BUILDINGS[idx]["scale"]

	# Single shared material — easy to update color each frame
	_ghost_mat = StandardMaterial3D.new()
	_ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ghost_mat.cull_mode    = BaseMaterial3D.CULL_DISABLED
	_ghost_mat.albedo_color = Color(0.7, 1.0, 0.7, 0.50)  # green = valid
	_apply_ghost_mat(_ghost_node, _ghost_mat)
	get_tree().current_scene.add_child(_ghost_node)
	_ghost_radius = float(BUILDINGS[idx]["radius"])


func _apply_ghost_mat(node: Node, mat: StandardMaterial3D) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		if mi.mesh:
			for s in mi.mesh.get_surface_count():
				mi.set_surface_override_material(s, mat)
	for ch in node.get_children():
		_apply_ghost_mat(ch, mat)


# ============================================================
#  PER-FRAME — рух ghost + детекція кліку
# ============================================================
func _process(delta: float) -> void:
	# Feedback flash timer
	if _feedback_timer > 0.0:
		_feedback_timer -= delta
		_feedback_lbl.modulate.a = clampf(_feedback_timer * 2.0, 0.0, 1.0)
		if _feedback_timer <= 0.0:
			_feedback_lbl.visible = false

	if not _placing:
		return

	var cam := _get_camera()
	if cam == null:
		return

	var mouse := get_viewport().get_mouse_position()

	# --- Move ghost + validity check ---
	if _ghost_node:
		var rc: Dictionary = _do_raycast(cam, mouse)
		if not rc.is_empty():
			var hit_pos: Vector3 = rc["position"]
			_ghost_node.global_position = hit_pos
			var on_grass   := _is_grass_hit(rc)
			var pos_free   := _is_ghost_free()
			_placement_valid = on_grass and pos_free
			# Ghost color feedback
			if _ghost_mat:
				if not on_grass:
					_ghost_mat.albedo_color = Color(0.55, 0.55, 0.55, 0.40)  # grey = not grass
				elif not pos_free:
					_ghost_mat.albedo_color = Color(1.0, 0.25, 0.25, 0.60)   # red  = too close
				else:
					_ghost_mat.albedo_color = Color(0.65, 1.0, 0.65, 0.50)   # green = ok
		else:
			_placement_valid = false
			if _ghost_mat:
				_ghost_mat.albedo_color = Color(0.55, 0.55, 0.55, 0.40)

	# --- Detect LEFT click ---
	var lmb := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	if lmb and not _prev_lmb:
		if not _is_mouse_over_ui(mouse):
			if _placement_valid:
				_do_place(cam, mouse)
			else:
				var rc2: Dictionary = _do_raycast(cam, mouse)
				if not _is_grass_hit(rc2):
					_flash_blocked("⛔ Будівлі можна ставити тільки на траві!")
				else:
					_flash_blocked("⛔ Занадто близько до іншої будівлі!")
	_prev_lmb = lmb

	# ESC key
	if Input.is_key_pressed(KEY_ESCAPE):
		_cancel_placement()


# --- Overlap check: circle-circle in XZ plane ---
func _is_ghost_free() -> bool:
	if _ghost_node == null:
		return true
	var gpos := _ghost_node.global_position
	for item in _placed_data:
		var ppos: Vector3 = item["pos"]
		var pr  : float   = item["radius"]
		var d := Vector2(gpos.x - ppos.x, gpos.z - ppos.z).length()
		if d < _ghost_radius + pr:
			return false
	return true






func _flash_blocked(msg: String) -> void:
	_feedback_lbl.text = msg
	_feedback_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	_feedback_lbl.modulate.a = 1.0
	_feedback_lbl.visible = true
	_feedback_timer = 1.2


func _is_mouse_over_ui(mouse: Vector2) -> bool:
	# Check if mouse is in the bottom button strip or in the panel
	var vp_size := get_viewport().get_visible_rect().size

	# Bottom strip (buttons area)
	if mouse.y > vp_size.y - 95:
		return true

	# Panel area (if visible)
	if _panel.visible and mouse.y > vp_size.y - 310:
		return true

	return false


# Повертає повний результат raycast (або порожній Dictionary якщо немає влучення)
func _do_raycast(cam: Camera3D, mouse: Vector2) -> Dictionary:
	var ray_origin := cam.project_ray_origin(mouse)
	var ray_dir    := cam.project_ray_normal(mouse)
	var ray_end    := ray_origin + ray_dir * RAY_LENGTH
	var space: PhysicsDirectSpaceState3D = get_tree().current_scene.get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(ray_origin, ray_end)
	query.collide_with_areas = false
	return space.intersect_ray(query)


# Перевіряємо чи влучили по траві (MainGrass або SmallGrass)
func _is_grass_hit(result: Dictionary) -> bool:
	if result.is_empty():
		return false
	var collider: Node = result["collider"]
	# CSG з use_collision=true створює дочірній StaticBody3D
	# тому батьківська нода — наш CSGPolygon3D
	var surf: Node = collider
	if collider.get_parent() != null and collider.get_parent() is CSGShape3D:
		surf = collider.get_parent()
	return surf.name == "MainGrass" or surf.name == "SmallGrass"


func _do_place(cam: Camera3D, mouse: Vector2) -> void:
	var result: Dictionary = _do_raycast(cam, mouse)
	if result.is_empty():
		push_warning("Ray did not hit surface")
		return
	var hit_pos: Vector3 = result["position"]

	var packed := _packed_scenes[_selected_index]
	if packed == null:
		return

	var building := packed.instantiate() as Node3D
	building.name = BUILDINGS[_selected_index]["name"]
	building.scale = BUILDINGS[_selected_index]["scale"]
	get_tree().current_scene.add_child(building)
	building.global_position = hit_pos

	# Record position for overlap check
	_placed_data.append({"pos": hit_pos, "radius": _ghost_radius})

	print("✅ Поставлено: " + BUILDINGS[_selected_index]["name"] + " → " + str(building.global_position))

	# Flash feedback
	_feedback_lbl.text = "✅ " + BUILDINGS[_selected_index]["name"] + " поставлено!"
	_feedback_lbl.modulate.a = 1.0
	_feedback_lbl.visible = true
	_feedback_timer = 1.5

	# Refresh ghost for next placement
	_create_ghost(_selected_index)


func _get_camera() -> Camera3D:
	var root := get_tree().current_scene
	var rig  := root.find_child("CameraRig", true, false)
	if rig:
		return rig.find_child("Camera3D", true, false) as Camera3D
	return null
