extends CanvasLayer

# ============================================================
#  Build UI — real FBX models, reliable placement
# ============================================================

const BUILDINGS = [
	{
		"name": "Barracks",
		"icon": "⚔️",
		"desc": "Trains warriors",
		"model_path": "res://Objects/Barracks-dvlksXgxWc/Barracks_SecondAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 40.0,
	},
	{
		"name": "Farm",
		"icon": "🌾",
		"desc": "Produces food",
		"model_path": "res://Objects/Farm/Farm_SecondAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 45.0,
	},
	{
		"name": "Watch Tower",
		"icon": "🗼",
		"desc": "Defensive tower",
		"model_path": "res://Objects/Watch Tower/WatchTower_FirstAge_Level2.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 30.0,
	},
	{
		"name": "Archery Tower",
		"icon": "🏹",
		"desc": "Ranged defence",
		"model_path": "res://Objects/Archery Towers/Archery_FirstAge_Level3.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 32.0,
	},
	{
		"name": "Stone Tower",
		"icon": "🏰",
		"desc": "Heavy fortification",
		"model_path": "res://Objects/Stone Tower/WatchTower_SecondAge_Level1.fbx",
		"scale": Vector3(30, 30, 30),
		"radius": 35.0,
	},
]

# ============================================================
#  TUTORIAL STEPS
# ============================================================
const TUTORIAL_STEPS = [
	{
		"title": "👋  Welcome, Commander!",
		"body":  "Your island awaits. Let's build your first settlement together!\n\nFirst, let's construct a Barracks — the heart of your army.",
		"btn":   "Let's go! →"
	},
	{
		"title": "🔨  Open the Build Menu",
		"body":  "Press the [Build] button at the bottom of the screen to open the building panel.\n\nYou'll see all available structures you can place on the island.",
		"btn":   "Got it →"
	},
	{
		"title": "⚔️  Select the Barracks",
		"body":  "Click on the Barracks card.\nThe Barracks trains warriors who will defend your territory and attack enemies.\n\nAfter selecting, your cursor will show a preview of the building.",
		"btn":   "Understood →"
	},
	{
		"title": "📍  Place the Barracks",
		"body":  "Move your mouse over the green grass on the island.\n\n✅ Green preview = valid spot\n🔴 Red preview = too close to another building\n⬜ Grey preview = not on grass\n\nLeft-click to place the Barracks!",
		"btn":   "Let's build! →"
	},
	{
		"title": "🎉  Well done, Commander!",
		"body":  "Your Barracks is built! Warriors will now be trained here.\n\nYou can place more buildings using the Build button anytime.\n\nGood luck with your conquest!",
		"btn":   "Start Playing!"
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

# --- Rotation ---
var _ghost_yaw : float = 0.0   # accumulated Y rotation in degrees (multiples of 90)

# --- Click / key detection ---
var _prev_lmb   : bool = false
var _prev_r_key : bool = false
var _prev_q_key : bool = false

# --- Zone indicators (CoC-style) ---
const OBJECT_ZONE_RADIUS : float = 18.0   # clearance ring radius around any scene object
var _zone_indicators     : Array[Node3D] = []
var _ghost_zone          : MeshInstance3D = null
var _ghost_zone_mat      : StandardMaterial3D = null

# --- UI refs ---
var _panel        : PanelContainer
var _build_btn    : Button
var _cancel_btn   : Button
var _world_btn    : Button
var _status_label : Label
var _feedback_lbl : Label
var _feedback_timer: float = 0.0
var _fade_rect    : ColorRect

# --- Tutorial ---
var _tutorial_step    : int = 0
var _tutorial_overlay : Control
var _tut_title_lbl    : Label
var _tut_body_lbl     : Label
var _tut_btn          : Button
var _tut_skip_btn     : Button


# ============================================================
func _ready() -> void:
	_preload_models()
	_build_ui()
	_build_tutorial()
	_show_tutorial_step(0)


func _preload_models() -> void:
	_packed_scenes.resize(BUILDINGS.size())
	for i in BUILDINGS.size():
		var path: String = BUILDINGS[i]["model_path"]
		if ResourceLoader.exists(path):
			_packed_scenes[i] = load(path) as PackedScene
			if _packed_scenes[i]:
				print("✅ Loaded: " + BUILDINGS[i]["name"])
			else:
				push_error("❌ Failed to load (cast fail): " + path)
		else:
			push_error("❌ File not found: " + path)


# ============================================================
#  TUTORIAL SYSTEM
# ============================================================
func _build_tutorial() -> void:
	# Dark overlay backdrop
	_tutorial_overlay = Control.new()
	_tutorial_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_tutorial_overlay)

	# Dimmed background
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0, 0, 0, 0.45)
	_tutorial_overlay.add_child(bg)

	# Card container — centred
	var card := PanelContainer.new()
	card.anchor_left   = 0.5
	card.anchor_right  = 0.5
	card.anchor_top    = 0.5
	card.anchor_bottom = 0.5
	card.offset_left   = -300
	card.offset_right  =  300
	card.offset_top    = -200
	card.offset_bottom =  200

	var card_style := StyleBoxFlat.new()
	card_style.bg_color = Color(0.08, 0.06, 0.04, 0.97)
	card_style.border_color = Color(0.95, 0.70, 0.15)
	card_style.set_border_width_all(3)
	card_style.set_corner_radius_all(18)
	card_style.content_margin_left   = 30
	card_style.content_margin_right  = 30
	card_style.content_margin_top    = 24
	card_style.content_margin_bottom = 24
	card.add_theme_stylebox_override("panel", card_style)
	_tutorial_overlay.add_child(card)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 18)
	card.add_child(vb)

	# Step indicator dots row
	var dots_row := HBoxContainer.new()
	dots_row.alignment = BoxContainer.ALIGNMENT_CENTER
	dots_row.add_theme_constant_override("separation", 8)
	vb.add_child(dots_row)
	dots_row.name = "DotsRow"

	# Title
	_tut_title_lbl = Label.new()
	_tut_title_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tut_title_lbl.add_theme_font_size_override("font_size", 24)
	_tut_title_lbl.add_theme_color_override("font_color", Color(0.95, 0.75, 0.20))
	vb.add_child(_tut_title_lbl)

	# Body
	_tut_body_lbl = Label.new()
	_tut_body_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tut_body_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD
	_tut_body_lbl.add_theme_font_size_override("font_size", 15)
	_tut_body_lbl.add_theme_color_override("font_color", Color(0.88, 0.88, 0.88))
	_tut_body_lbl.custom_minimum_size = Vector2(540, 100)
	vb.add_child(_tut_body_lbl)

	# Buttons row
	var btn_row := HBoxContainer.new()
	btn_row.alignment = BoxContainer.ALIGNMENT_CENTER
	btn_row.add_theme_constant_override("separation", 16)
	vb.add_child(btn_row)

	_tut_skip_btn = _make_button("Skip tutorial", Color(0.30, 0.30, 0.30), Color(0.75, 0.75, 0.75))
	_tut_skip_btn.custom_minimum_size = Vector2(160, 46)
	_tut_skip_btn.add_theme_font_size_override("font_size", 14)
	_tut_skip_btn.pressed.connect(_skip_tutorial)
	btn_row.add_child(_tut_skip_btn)

	_tut_btn = _make_button("Next →", Color(0.95, 0.70, 0.15), Color(0.12, 0.07, 0.02))
	_tut_btn.custom_minimum_size = Vector2(180, 46)
	_tut_btn.pressed.connect(_next_tutorial_step)
	btn_row.add_child(_tut_btn)

	_tutorial_overlay.visible = false


func _show_tutorial_step(step: int) -> void:
	if step >= TUTORIAL_STEPS.size():
		_end_tutorial()
		return
	_tutorial_step = step
	var s: Dictionary = TUTORIAL_STEPS[step]
	_tut_title_lbl.text = s["title"]
	_tut_body_lbl.text  = s["body"]
	_tut_btn.text       = s["btn"]

	# Rebuild progress dots
	var dots_row: HBoxContainer = _tutorial_overlay.find_child("DotsRow", true, false)
	if dots_row:
		for ch in dots_row.get_children():
			ch.queue_free()
		for i in TUTORIAL_STEPS.size():
			var dot := Label.new()
			dot.text = "●" if i == step else "○"
			dot.add_theme_font_size_override("font_size", 14)
			var col := Color(0.95, 0.70, 0.15) if i == step else Color(0.45, 0.45, 0.45)
			dot.add_theme_color_override("font_color", col)
			dots_row.add_child(dot)

	_tut_skip_btn.visible = step < TUTORIAL_STEPS.size() - 1
	_tutorial_overlay.visible = true


func _next_tutorial_step() -> void:
	_show_tutorial_step(_tutorial_step + 1)


func _skip_tutorial() -> void:
	_end_tutorial()


func _end_tutorial() -> void:
	_tutorial_overlay.visible = false


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

	# ---- Feedback label (flashes "Placed!") ----
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

	# ---- World Map button (top-right corner) ----
	_world_btn = _make_button("🌍  World", Color(0.18, 0.42, 0.80), Color(0.92, 0.96, 1.0))
	_world_btn.custom_minimum_size = Vector2(148, 50)
	_world_btn.anchor_left   = 1.0
	_world_btn.anchor_right  = 1.0
	_world_btn.anchor_top    = 0.0
	_world_btn.anchor_bottom = 0.0
	_world_btn.offset_left   = -162
	_world_btn.offset_right  = -10
	_world_btn.offset_top    =  10
	_world_btn.offset_bottom =  60
	_world_btn.pressed.connect(_open_world_map)
	add_child(_world_btn)

	# ---- Full-screen fade overlay (for transitions) ----
	_fade_rect = ColorRect.new()
	_fade_rect.color = Color(0, 0, 0, 0)
	_fade_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fade_rect)

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

	_build_btn = _make_button("🔨  Build", Color(0.95, 0.70, 0.15), Color(0.15, 0.08, 0.02))
	_build_btn.custom_minimum_size = Vector2(180, 56)
	_build_btn.pressed.connect(_on_build_pressed)
	bottom_bar.add_child(_build_btn)

	_cancel_btn = _make_button("✕  Cancel", Color(0.80, 0.18, 0.10), Color(1, 1, 1))
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
	title.text = "⚒  Choose a Building"
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
		desc_lbl.text = "⚠ Loading error"
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
	_build_btn.text = "✕  Close" if _panel_open else "🔨  Build"


func _on_building_selected(idx: int) -> void:
	if idx >= _packed_scenes.size() or _packed_scenes[idx] == null:
		push_error("Model not loaded for: " + BUILDINGS[idx]["name"])
		return
	_selected_index     = idx
	_panel.visible      = false
	_panel_open         = false
	_build_btn.text     = "🔨  Build"
	_build_btn.visible  = false
	_cancel_btn.visible = true
	_ghost_yaw            = 0.0
	_status_label.text    = "Click to place «" + BUILDINGS[idx]["name"] + "»   |   R/Q — rotate   |   ESC — cancel"
	_status_label.visible = true
	_placing              = true
	_prev_lmb             = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	_create_ghost(idx)
	_create_zone_indicators()
	_create_ghost_zone()


func _cancel_placement() -> void:
	_placing              = false
	_selected_index       = -1
	_ghost_yaw            = 0.0
	_build_btn.visible    = true
	_cancel_btn.visible   = false
	_status_label.visible = false
	if _ghost_node:
		_ghost_node.queue_free()
		_ghost_node = null
	_clear_zone_indicators()


# ============================================================
#  GHOST — semi-transparent real model
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

	_ghost_mat = StandardMaterial3D.new()
	_ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ghost_mat.cull_mode    = BaseMaterial3D.CULL_DISABLED
	_ghost_mat.albedo_color = Color(0.7, 1.0, 0.7, 0.50)
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
#  PER-FRAME — ghost movement + click detection
# ============================================================
func _process(delta: float) -> void:
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

	# --- Update ghost zone position/color/rotation ---
	if _ghost_zone and is_instance_valid(_ghost_zone) and _ghost_node:
		_ghost_zone.global_position = _ghost_node.global_position + Vector3(0, 0.3, 0)
		_ghost_zone.rotation_degrees.y = _ghost_yaw
		if _ghost_zone_mat:
			if _placement_valid:
				_ghost_zone_mat.albedo_color = Color(0.2, 1.0, 0.2, 0.30)
				_ghost_zone_mat.emission     = Color(0.0, 0.8, 0.0)
			else:
				_ghost_zone_mat.albedo_color = Color(1.0, 0.15, 0.15, 0.35)
				_ghost_zone_mat.emission     = Color(0.9, 0.0, 0.0)

	# --- R / Q keys: rotate 90° ---
	var r_key := Input.is_key_pressed(KEY_R)
	var q_key := Input.is_key_pressed(KEY_Q)
	if r_key and not _prev_r_key:
		_ghost_yaw += 90.0
		if _ghost_yaw >= 360.0:
			_ghost_yaw -= 360.0
	if q_key and not _prev_q_key:
		_ghost_yaw -= 90.0
		if _ghost_yaw < 0.0:
			_ghost_yaw += 360.0
	_prev_r_key = r_key
	_prev_q_key = q_key

	if _ghost_node:
		var rc: Dictionary = _do_raycast(cam, mouse)
		if not rc.is_empty():
			var hit_pos: Vector3 = rc["position"]
			_ghost_node.global_position = hit_pos
			# Apply current rotation
			_ghost_node.rotation_degrees.y = _ghost_yaw
			var on_grass   := _is_grass_hit(rc)
			var pos_free   := _is_ghost_free()
			_placement_valid = on_grass and pos_free
			if _ghost_mat:
				if not on_grass:
					_ghost_mat.albedo_color = Color(0.55, 0.55, 0.55, 0.40)
				elif not pos_free:
					_ghost_mat.albedo_color = Color(1.0, 0.25, 0.25, 0.60)
				else:
					_ghost_mat.albedo_color = Color(0.65, 1.0, 0.65, 0.50)
		else:
			_placement_valid = false
			if _ghost_mat:
				_ghost_mat.albedo_color = Color(0.55, 0.55, 0.55, 0.40)
			# Still apply rotation even off-surface
			_ghost_node.rotation_degrees.y = _ghost_yaw

	var lmb := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	if lmb and not _prev_lmb:
		if not _is_mouse_over_ui(mouse):
			if _placement_valid:
				_do_place(cam, mouse)
			else:
				var rc2: Dictionary = _do_raycast(cam, mouse)
				if not _is_grass_hit(rc2):
					_flash_blocked("⛔ Buildings can only be placed on grass!")
				else:
					_flash_blocked("⛔ Too close to another building!")
	_prev_lmb = lmb

	if Input.is_key_pressed(KEY_ESCAPE):
		_cancel_placement()


# ============================================================
#  ZONE INDICATOR HELPERS
# ============================================================
func _make_zone_disc(radius: float, color: Color, emission: Color) -> MeshInstance3D:
	var disc := MeshInstance3D.new()
	var mesh := PlaneMesh.new()
	# Square footprint sized to the building's radius
	mesh.size = Vector2(radius * 2.0, radius * 2.0)
	mesh.subdivide_width  = 0
	mesh.subdivide_depth  = 0
	disc.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.transparency    = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode    = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color    = color
	mat.emission_enabled = true
	mat.emission        = emission
	mat.emission_energy_multiplier = 0.6
	mat.cull_mode       = BaseMaterial3D.CULL_DISABLED
	disc.set_surface_override_material(0, mat)
	return disc


func _create_ghost_zone() -> void:
	if _ghost_zone and is_instance_valid(_ghost_zone):
		_ghost_zone.queue_free()
		_ghost_zone = null
	_ghost_zone_mat = null
	if _ghost_radius <= 0.0:
		return
	_ghost_zone = _make_zone_disc(_ghost_radius, Color(0.2, 1.0, 0.2, 0.30), Color(0.0, 0.8, 0.0))
	_ghost_zone_mat = _ghost_zone.get_surface_override_material(0) as StandardMaterial3D
	get_tree().current_scene.add_child(_ghost_zone)


func _create_zone_indicators() -> void:
	# Remove old indicators first
	for ind in _zone_indicators:
		if is_instance_valid(ind):
			ind.queue_free()
	_zone_indicators.clear()

	# Only create discs for buildings the player placed themselves
	var root := get_tree().current_scene
	for item in _placed_data:
		var ppos: Vector3 = item["pos"]
		var pr  : float   = item["radius"]
		var disc := _make_zone_disc(
			pr,
			Color(1.0, 0.72, 0.10, 0.22),
			Color(1.0, 0.55, 0.0)
		)
		disc.global_position = Vector3(ppos.x, ppos.y + 0.4, ppos.z)
		root.add_child(disc)
		_zone_indicators.append(disc)


func _clear_zone_indicators() -> void:
	for ind in _zone_indicators:
		if is_instance_valid(ind):
			ind.queue_free()
	_zone_indicators.clear()
	if _ghost_zone and is_instance_valid(_ghost_zone):
		_ghost_zone.queue_free()
		_ghost_zone = null
	_ghost_zone_mat = null


# --- Overlap check: manual circle + physics sphere sweep ---
func _is_ghost_free() -> bool:
	if _ghost_node == null:
		return true
	var gpos := _ghost_node.global_position

	# 1) Fast manual check against our own placed-building records
	for item in _placed_data:
		var ppos: Vector3 = item["pos"]
		var pr  : float   = item["radius"]
		var d := Vector2(gpos.x - ppos.x, gpos.z - ppos.z).length()
		if d < _ghost_radius + pr:
			return false

	# 2) Scene-tree XZ distance scan — no physics needed.
	#    Walk direct children of the scene root; skip terrain/camera/UI/ghost.
	var root := get_tree().current_scene
	# Clearance = ghost radius + object zone radius (matches visual disc overlap)
	var clearance := _ghost_radius + OBJECT_ZONE_RADIUS

	for child in root.get_children():
		# Skip the ghost and its zone disc
		if child == _ghost_node or child == _ghost_zone:
			continue
		# Skip zone indicator discs themselves
		if _zone_indicators.has(child):
			continue
		# Skip terrain (any CSG shape = island floor/water/grass/dirt)
		if child is CSGShape3D:
			continue
		# Skip non-spatial nodes (camera rig, lights, env, canvas etc.)
		if not (child is Node3D):
			continue
		if child.name == "CameraRig" or child.name == "SunLight" \
				or child.name == "WorldEnvironment" or child.name == "BuildUI":
			continue
		# It is a placed 3-D object — check XZ distance
		var cpos: Vector3 = (child as Node3D).global_position
		var dist := Vector2(gpos.x - cpos.x, gpos.z - cpos.z).length()
		if dist < clearance:
			return false

	return true


func _flash_blocked(msg: String) -> void:
	_feedback_lbl.text = msg
	_feedback_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	_feedback_lbl.modulate.a = 1.0
	_feedback_lbl.visible = true
	_feedback_timer = 1.2


func _is_mouse_over_ui(mouse: Vector2) -> bool:
	var vp_size := get_viewport().get_visible_rect().size
	if mouse.y > vp_size.y - 95:
		return true
	if _panel.visible and mouse.y > vp_size.y - 310:
		return true
	return false


func _do_raycast(cam: Camera3D, mouse: Vector2) -> Dictionary:
	var ray_origin := cam.project_ray_origin(mouse)
	var ray_dir    := cam.project_ray_normal(mouse)
	var ray_end    := ray_origin + ray_dir * RAY_LENGTH
	var space: PhysicsDirectSpaceState3D = get_tree().current_scene.get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(ray_origin, ray_end)
	query.collide_with_areas = false
	return space.intersect_ray(query)


func _is_grass_hit(result: Dictionary) -> bool:
	if result.is_empty():
		return false
	var collider: Node = result["collider"]
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
	building.rotation_degrees.y = _ghost_yaw
	get_tree().current_scene.add_child(building)
	building.global_position = hit_pos

	_placed_data.append({"pos": hit_pos, "radius": _ghost_radius})

	print("✅ Placed: " + BUILDINGS[_selected_index]["name"] + " → " + str(building.global_position))

	_feedback_lbl.text = "✅ " + BUILDINGS[_selected_index]["name"] + " placed!"
	_feedback_lbl.modulate.a = 1.0
	_feedback_lbl.visible = true
	_feedback_timer = 1.5

	_create_ghost(_selected_index)
	_create_zone_indicators()
	_create_ghost_zone()


func _get_camera() -> Camera3D:
	var root := get_tree().current_scene
	var rig  := root.find_child("CameraRig", true, false)
	if rig:
		return rig.find_child("Camera3D", true, false) as Camera3D
	return null


# ============================================================
#  WORLD MAP TRANSITION
# ============================================================
func _open_world_map() -> void:
	# Disable world button to prevent double-press
	if _world_btn:
		_world_btn.disabled = true
	# Cancel any active placement first
	if _placing:
		_cancel_placement()
	# Fade to black
	if _fade_rect:
		_fade_rect.mouse_filter = Control.MOUSE_FILTER_STOP
		var tw := create_tween()
		tw.tween_property(_fade_rect, "color:a", 1.0, 0.45)
		await tw.finished
	get_tree().change_scene_to_file("res://WorldMap.tscn")
