## BSProduction — resource production and collection subsystem
## Extracted from building_system.gd to keep BuildingSystem focused on placement/grid logic.
## Implements: per-second resource accumulation, collect-icon HUD, flying-coin animation,
## server sync on collection, and resource-counter tween.
##
## Usage:
##   var _production := BSProduction.new().init(self)
##   # call from _process / timer:
##   _production._tick_production()
##   _production._update_collect_icons()

class_name BSProduction extends RefCounted

# ── Icon texture paths ─────────────────────────────────────────
const COLLECT_ICON_TEXTURES: Dictionary = {
	"ore":  "res://Model/Resources/stone_bar.png",
	"wood": "res://Model/Resources/wood_bar.png",
	"gold": "res://Model/Resources/gold_bar.png",
}

const COLLECTION_FEEDBACK_COLORS: Dictionary = {
	"gold": Color(0.90, 0.75, 0.20),
	"wood": Color(0.45, 0.70, 0.30),
	"ore": Color(0.60, 0.65, 0.70),
}
const COLLECTION_FEEDBACK_SIZE := Vector2(180.0, 52.0)
const COLLECTION_FEEDBACK_RISE := 62.0
const COLLECTION_FEEDBACK_DURATION := 1.05

# ── Back-reference to BuildingSystem ──────────────────────────
## The Node3D that owns this helper (a BuildingSystem instance).
var bs: Node3D
var _collection_icons_suppressed: bool = false

## Initialise with the owning BuildingSystem node.
## Returns self so the caller can chain: BSProduction.new().init(self)
func init(building_system: Node3D) -> BSProduction:
	bs = building_system
	return self

func _load_collect_texture(res_type: String) -> Texture2D:
	var tex_path: String = COLLECT_ICON_TEXTURES.get(res_type, COLLECT_ICON_TEXTURES["gold"])
	if ResourceLoader.exists(tex_path):
		var imported_tex := ResourceLoader.load(tex_path) as Texture2D
		if imported_tex:
			return imported_tex

	# React imports these same PNGs from web/src. Godot can pack them as raw
	# files without .import metadata, so ResourceLoader.exists() may be false.
	var image := Image.new()
	if image.load(tex_path) == OK:
		return ImageTexture.create_from_image(image)
	return null

func _read_react_resource_target(res_type: String, fallback: Vector2) -> Vector2:
	if not OS.has_feature("web"):
		return fallback
	var safe_res_type := res_type.replace("\\", "").replace("'", "")
	var js := """
(function(){
  try {
    if (window.__clashGetResourceIconPosition) {
      return window.__clashGetResourceIconPosition('%s', 'godot') || '';
    }
    if (window.__clashPublishResourceIconPositions) {
      window.__clashPublishResourceIconPositions();
    }
    var p = window.godotResourceIconPositions && window.godotResourceIconPositions['%s'];
    return p ? JSON.stringify(p) : '';
  } catch (e) {
    return '';
  }
})()
""" % [safe_res_type, safe_res_type]
	var js_target = JavaScriptBridge.eval(js)
	if js_target is String and js_target != "":
		var parsed = JSON.parse_string(js_target)
		if parsed is Dictionary and parsed.has("x") and parsed.has("y"):
			return Vector2(float(parsed.get("x", fallback.x)), float(parsed.get("y", fallback.y)))
	return fallback

# ── Production tick ────────────────────────────────────────────

## Advance stored resources for every production building by one second's worth
## of output.  Call once per second (e.g. from a 1-second Timer signal).
func _tick_production() -> void:
	var any_ready := false
	for b in bs.placed_buildings:
		var def: Dictionary = bs.building_defs.get(b.id, {})
		if not def.has("produces"):
			continue
		var lvl: int        = b.get("level", 1)
		var rate_arr: Array = def.get("produce_rate", [0])
		var max_arr: Array  = def.get("produce_max", [100])
		var rate_idx: int   = clampi(lvl - 1, 0, rate_arr.size() - 1)
		var max_idx: int    = clampi(lvl - 1, 0, max_arr.size() - 1)
		var resource_type: String = String(def.get("produces", ""))
		var prosperity_applies: bool = resource_type == "gold" or resource_type == "wood" or resource_type == "ore"
		var prosperity_pct: int = bs._get_altar_skill_bonus_pct("prosperity") if prosperity_applies and bs and bs.has_method("_get_altar_skill_bonus_pct") else 0
		var rate_per_sec: float = (float(rate_arr[rate_idx]) * (1.0 + float(prosperity_pct) / 100.0)) / 60.0
		var max_stored: float   = max_arr[max_idx]
		var stored: float       = b.get("stored", 0.0)
		stored = minf(stored + rate_per_sec, max_stored)
		b["stored"] = stored
		if stored >= 1.0:
			any_ready = true

# ── Collect-icon HUD ───────────────────────────────────────────

## Project a collect-icon above each production building that has resource >= 1.
## Call every frame (from _process) after _tick_production has run.
func _update_collect_icons() -> void:
	if _collection_icons_suppressed:
		_hide_collection_icons_without_freeing()
		return
	var cam := BaseTroop._get_camera_cached()
	if not cam:
		return
	for b in bs.placed_buildings:
		var def: Dictionary = bs.building_defs.get(b.id, {})
		if not def.has("produces"):
			continue
		var stored: float = b.get("stored", 0.0)
		var node := b.get("node") as Node3D
		if not is_instance_valid(node):
			continue
		var icon := b.get("_collect_icon") as Control
		if stored >= 1.0:
			if not icon:
				icon = _create_collect_icon(b, node, def)
				b["_collect_icon"] = icon
			icon.mouse_filter = Control.MOUSE_FILTER_STOP
			icon.visible = true
			# Check if storage is full — tint icon red
			var _res_type: String = def.get("produces", "gold")
			var _current: int = int(bs.resources.get(_res_type, 0))
			var _caps: Dictionary = bs._get_resource_caps()
			var _cap: int = int(_caps.get(_res_type, 99999))
			var _full: bool = _current >= _cap
			if icon.get_child_count() > 0:
				var _bg: Panel = icon.get_child(0) as Panel
				if _bg:
					var _st: StyleBoxFlat = _bg.get_theme_stylebox("panel") as StyleBoxFlat
					if _st:
						if _full:
							_st.border_color = Color(0.9, 0.15, 0.15)
							_st.bg_color = Color(1.0, 0.85, 0.85, 0.95)
						else:
							_st.bg_color = Color(1.0, 1.0, 1.0, 0.95)
							if _res_type == "gold": _st.border_color = Color(0.9, 0.75, 0.2)
							elif _res_type == "wood": _st.border_color = Color(0.45, 0.7, 0.3)
							elif _res_type == "ore": _st.border_color = Color(0.6, 0.65, 0.7)
			var base_pos: Vector3   = node.global_position
			var def_height: float   = def.get("height", 0.4)
			var target_3d: Vector3  = base_pos + Vector3(0, def_height + 0.1, 0)
			if cam.is_position_behind(target_3d):
				icon.visible = false
			else:
				var pos2d: Vector2   = cam.unproject_position(target_3d)
				var anim_scale: float = icon.get_meta("anim_scale", 1.0)
				icon.scale           = Vector2.ONE * anim_scale
				var scaled_size: Vector2 = icon.size * icon.scale
				icon.position        = pos2d - scaled_size / 2.0
		else:
			if icon and is_instance_valid(icon):
				icon.visible = false

## Build the TextureButton collect-icon and add it to world_ui_canvas.
func _create_collect_icon(b: Dictionary, building_node: Node3D, def: Dictionary) -> Control:
	var btn := TextureButton.new()
	btn.custom_minimum_size = Vector2(56, 56)
	btn.size                = Vector2(56, 56)
	btn.mouse_filter        = Control.MOUSE_FILTER_STOP

	# Circular background panel
	var bg := Panel.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color                  = Color(1.0, 1.0, 1.0, 0.95)
	style.corner_radius_top_left    = 28
	style.corner_radius_top_right   = 28
	style.corner_radius_bottom_left = 28
	style.corner_radius_bottom_right = 28
	style.border_width_left   = 3
	style.border_width_top    = 3
	style.border_width_right  = 3
	style.border_width_bottom = 3
	var res_type: String = def.get("produces", "gold")
	if res_type == "gold":
		style.border_color = Color(0.9, 0.75, 0.2)
	elif res_type == "wood":
		style.border_color = Color(0.45, 0.7, 0.3)
	elif res_type == "ore":
		style.border_color = Color(0.6, 0.65, 0.7)
	else:
		style.border_color = Color(0.5, 0.5, 0.5)
	style.shadow_color  = Color(0, 0, 0, 0.2)
	style.shadow_size   = 4
	style.shadow_offset = Vector2(0, 3)
	bg.add_theme_stylebox_override("panel", style)
	btn.add_child(bg)

	# Resource icon inside the button
	var tex_rect := TextureRect.new()
	tex_rect.expand_mode  = TextureRect.EXPAND_IGNORE_SIZE
	tex_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tex_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	tex_rect.offset_left   = 10
	tex_rect.offset_top    = 10
	tex_rect.offset_right  = -10
	tex_rect.offset_bottom = -10
	tex_rect.mouse_filter  = Control.MOUSE_FILTER_IGNORE
	var tex := _load_collect_texture(res_type)
	if tex:
		tex_rect.texture = tex
	btn.add_child(tex_rect)

	btn.pressed.connect(func(): _click_collect_icon(btn, b, res_type))

	if bs.world_ui_canvas:
		bs.world_ui_canvas.add_child(btn)
	else:
		push_warning("BSProduction: world_ui_canvas not valid — collect icon has no parent")

	# Pop-in animation
	btn.pivot_offset = Vector2(28, 28)
	btn.set_meta("anim_scale", 0.0)
	var tw := btn.create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_method(func(v: float): btn.set_meta("anim_scale", v), 0.0, 1.0, 0.4)
	return btn

# ── Collect interaction ────────────────────────────────────────

## Handle a tap/click on a collect icon: hide it, fire the flying animation,
## then sync resources with the server.
func _click_collect_icon(btn: Control, b: Dictionary, res_type: String) -> void:
	if _collection_icons_suppressed or not is_instance_valid(btn) or not btn.visible:
		return
	if bool(b.get("_collecting", false)):
		return
	# Block collection if storage is full
	var current: int = int(bs.resources.get(res_type, 0))
	var caps: Dictionary = bs._get_resource_caps()
	var cap: int = int(caps.get(res_type, 99999))
	if current >= cap:
		bs._show_error("Storage full! Upgrade Storage or Town Hall.")
		return
	var start_pos: Vector2 = btn.global_position + btn.size / 2.0
	btn.visible = false
	btn.set_meta("anim_scale", 0.0)
	_collect_and_animate(b, res_type, start_pos)


func _play_collect_sfx(res_type: String) -> void:
	var audio := bs.get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_resource_claim"):
		audio.play_resource_claim(res_type)


## Spawn multiple flying resource icons that travel from the building toward the
## matching HUD counter label.
func _spawn_collection_flying_icon(start_pos: Vector2, res_type: String) -> void:
	var tex := _load_collect_texture(res_type)
	if not tex:
		return

	var screen_w: float   = bs.get_viewport().get_visible_rect().size.x
	var target_pos := Vector2(screen_w - 360.0, 40.0)
	if res_type == "wood":
		target_pos = Vector2(screen_w - 220.0, 40.0)
	elif res_type == "ore":
		target_pos = Vector2(screen_w - 80.0, 40.0)

	# On web: read the real React HUD icon position published by ResourceBar.jsx.
	# ResourceBar converts CSS icon centers into Godot canvas coordinates, so
	# mobile DPR/canvas scaling and responsive HUD shifts still land icon-to-icon.
	if OS.has_feature("web"):
		target_pos = _read_react_resource_target(res_type, target_pos)
	elif is_instance_valid(bs.gold_label) and bs.gold_label.is_visible_in_tree():
		# Desktop/editor: use Godot's own HUD labels if they're visible.
		if res_type == "gold" and is_instance_valid(bs.gold_label):
			target_pos = bs.gold_label.get_global_rect().get_center()
		elif res_type == "wood" and is_instance_valid(bs.wood_label):
			target_pos = bs.wood_label.get_global_rect().get_center()
		elif res_type == "ore" and is_instance_valid(bs.ore_label):
			target_pos = bs.ore_label.get_global_rect().get_center()

	var amount := 10
	for i in range(amount):
		var flying := TextureRect.new()
		flying.texture      = tex
		flying.expand_mode  = TextureRect.EXPAND_IGNORE_SIZE
		flying.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		flying.size         = Vector2(56, 56)
		flying.pivot_offset = Vector2(28, 28)
		flying.global_position = start_pos - flying.size / 2.0
		flying.scale        = Vector2.ZERO
		flying.mouse_filter = Control.MOUSE_FILTER_IGNORE

		if bs.world_ui_canvas:
			bs.world_ui_canvas.add_child(flying)
		else:
			bs.add_child(flying)

		var tw  := flying.create_tween()
		var delay: float         = i * 0.04
		var random_offset        := Vector2(randf_range(-90, 90), randf_range(-50, -110))
		var peak_pos: Vector2    = start_pos + random_offset
		var pop_dur: float       = 0.25 + randf() * 0.1

		tw.parallel().tween_property(flying, "global_position", peak_pos, pop_dur) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).set_delay(delay)
		tw.parallel().tween_property(flying, "scale", Vector2(1.5, 1.5), pop_dur * 0.5) \
			.set_delay(delay)
		tw.parallel().tween_property(flying, "scale", Vector2(1.0, 1.0), pop_dur * 0.5) \
			.set_delay(delay + pop_dur * 0.5)

		var fly_dur: float = 0.5 + randf() * 0.2
		tw.chain().parallel().tween_property(flying, "global_position", target_pos, fly_dur) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.parallel().tween_property(flying, "scale", Vector2(1.0, 1.0), fly_dur)
		tw.parallel().tween_property(flying, "modulate:a", 0.0, fly_dur * 0.2) \
			.set_delay(fly_dur * 0.8)
		tw.chain().tween_callback(flying.queue_free)


func _format_collection_amount(amount: int) -> String:
	var digits := str(maxi(amount, 0))
	var formatted := ""
	while digits.length() > 3:
		formatted = " " + digits.right(3) + formatted
		digits = digits.left(digits.length() - 3)
	return digits + formatted


func _collection_feedback_position(b: Dictionary) -> Vector2:
	var icon := b.get("_collect_icon") as Control
	if is_instance_valid(icon):
		return icon.global_position + icon.size * 0.5
	var node := b.get("node") as Node3D
	var cam := BaseTroop._get_camera_cached()
	if is_instance_valid(node) and is_instance_valid(cam):
		var def: Dictionary = bs.building_defs.get(b.get("id", ""), {})
		var world_pos := node.global_position + Vector3(0.0, float(def.get("height", 0.35)) + 0.16, 0.0)
		if not cam.is_position_behind(world_pos):
			return cam.unproject_position(world_pos)
	return bs.get_viewport().get_visible_rect().size * 0.5


## Show the amount credited by a collection. The label lives in screen space
## so it remains legible at every camera zoom.
func _spawn_collection_amount_feedback(start_pos: Vector2, res_type: String, amount: int) -> Label:
	if amount <= 0:
		return null
	var label := Label.new()
	label.name = "CollectionAmountFeedback_%s" % res_type.capitalize()
	label.text = "+%s" % _format_collection_amount(amount)
	label.size = COLLECTION_FEEDBACK_SIZE
	label.pivot_offset = COLLECTION_FEEDBACK_SIZE * 0.5
	label.position = start_pos - Vector2(COLLECTION_FEEDBACK_SIZE.x * 0.5, COLLECTION_FEEDBACK_SIZE.y + 12.0)
	label.scale = Vector2.ONE * 0.72
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 30)
	label.add_theme_color_override("font_color", COLLECTION_FEEDBACK_COLORS.get(res_type, Color.WHITE))
	label.add_theme_color_override("font_outline_color", Color(0.12, 0.08, 0.04, 0.96))
	label.add_theme_constant_override("outline_size", 8)
	label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.45))
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 3)
	label.z_index = 120

	if bs.world_ui_canvas:
		bs.world_ui_canvas.add_child(label)
	else:
		bs.add_child(label)

	var start := label.position
	var rise_target := start - Vector2(0.0, COLLECTION_FEEDBACK_RISE)
	var tween := label.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "position", start - Vector2(0.0, 14.0), 0.18) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "scale", Vector2.ONE * 1.12, 0.18) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.set_parallel(false)
	tween.tween_property(label, "scale", Vector2.ONE, 0.10) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.set_parallel(true)
	tween.tween_property(label, "position", rise_target, COLLECTION_FEEDBACK_DURATION - 0.28) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate:a", 0.0, 0.38) \
		.set_delay(COLLECTION_FEEDBACK_DURATION - 0.66).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.set_parallel(false)
	tween.tween_callback(label.queue_free)
	return label

## Deduct stored amount from the building, optionally sync with server, then
## tween the on-screen resource counter up to the new total.
func _collect_and_animate(b: Dictionary, res_type: String, feedback_pos: Vector2 = Vector2.INF) -> void:
	if bool(b.get("_collecting", false)):
		return
	var server_id: int  = b.get("server_id", -1)
	var local_amount: int = int(b.get("stored", 0.0))
	if local_amount <= 0:
		return
	b["_collecting"] = true
	b["stored"] = 0.0
	if not feedback_pos.is_finite():
		feedback_pos = _collection_feedback_position(b)

	var old_val: int    = int(bs.resources.get(res_type, 0))
	var target_val: int = old_val + local_amount
	var caps: Dictionary = bs._get_resource_caps()
	var cap: int = int(caps.get(res_type, target_val))
	var preview_amount := maxi(0, mini(local_amount, cap - old_val))

	# Collection feedback must never wait for the network. The local production
	# snapshot is deterministic enough for an immediate preview; the successful
	# server response below remains authoritative and can correct the label.
	_play_collect_sfx(res_type)
	_spawn_collection_flying_icon(feedback_pos, res_type)
	var amount_feedback := _spawn_collection_amount_feedback(feedback_pos, res_type, preview_amount)

	var net = bs._net
	if net and net.has_token():
		var result = await net.collect_resources(server_id)
		if result.has("error"):
			var restored_stored := float(b.get("stored", 0.0)) + float(local_amount)
			var def: Dictionary = bs.building_defs.get(b.get("id", ""), {})
			var max_values: Array = def.get("produce_max", [])
			if not max_values.is_empty():
				var level_index := clampi(int(b.get("level", 1)) - 1, 0, max_values.size() - 1)
				restored_stored = minf(restored_stored, float(max_values[level_index]))
			b["stored"] = restored_stored
			b["_collecting"] = false
			var icon := b.get("_collect_icon") as Control
			if is_instance_valid(icon):
				icon.mouse_filter = Control.MOUSE_FILTER_IGNORE if _collection_icons_suppressed else Control.MOUSE_FILTER_STOP
				icon.visible = not _collection_icons_suppressed
				icon.set_meta("anim_scale", 1.0)
			if bs.has_method("_show_error"):
				bs._show_error(str(result.error))
			return
		if result.has("resources"):
			target_val = int(result.resources.get(res_type, target_val))
			for k in ["gold", "wood", "ore"]:
				if k != res_type and result.resources.has(k):
					bs.resources[k] = result.resources[k]
	else:
		target_val = old_val + local_amount

	var credited_amount := maxi(0, target_val - old_val)
	if credited_amount <= 0:
		credited_amount = local_amount
	b["_collecting"] = false
	if is_instance_valid(amount_feedback) and credited_amount != preview_amount:
		amount_feedback.text = "+%s" % _format_collection_amount(credited_amount)

	var tw := bs.create_tween().set_trans(Tween.TRANS_LINEAR).set_ease(Tween.EASE_IN_OUT)
	tw.tween_method(
		func(v: int) -> void:
			bs.resources[res_type] = v
			bs._update_resource_ui()
			var bridge = bs._bridge
			if bridge:
				bridge.send_to_react("resources", bs.resources),
		old_val, target_val, 1.2
	)

# ── Cleanup ────────────────────────────────────────────────────

## Animate a server-authoritative resource collection performed by an AI agent.
## This mirrors a local click without sending another collect request.
func _animate_agent_collection(b: Dictionary, result: Dictionary) -> void:
	if result.has("error"):
		return
	var def: Dictionary = bs.building_defs.get(b.get("id", ""), {})
	var res_type: String = String(result.get("resource", def.get("produces", "gold")))
	var icon: Control = b.get("_collect_icon")
	var start_pos: Vector2 = Vector2.ZERO
	if is_instance_valid(icon):
		start_pos = icon.global_position + icon.size / 2.0
		icon.visible = false
		icon.set_meta("anim_scale", 0.0)
	else:
		var node := b.get("node") as Node3D
		var cam := BaseTroop._get_camera_cached()
		if is_instance_valid(node) and cam and not cam.is_position_behind(node.global_position):
			start_pos = cam.unproject_position(node.global_position)
		else:
			start_pos = bs.get_viewport().get_visible_rect().size / 2.0
	_play_collect_sfx(res_type)
	_spawn_collection_flying_icon(start_pos, res_type)
	b["stored"] = 0.0

	var old_val: int = int(bs.resources.get(res_type, 0))
	var resources_after: Dictionary = result.get("resources", {})
	var target_val: int = int(resources_after.get(res_type, old_val + int(result.get("collected", 0))))
	var credited_amount := maxi(0, target_val - old_val)
	if credited_amount <= 0:
		credited_amount = maxi(0, int(result.get("collected", 0)))
	_spawn_collection_amount_feedback(start_pos, res_type, credited_amount)
	for k in ["gold", "wood", "ore"]:
		if k != res_type and resources_after.has(k):
			bs.resources[k] = resources_after[k]

	var tw := bs.create_tween().set_trans(Tween.TRANS_LINEAR).set_ease(Tween.EASE_IN_OUT)
	tw.tween_method(
		func(v: int) -> void:
			bs.resources[res_type] = v
			bs._update_resource_ui()
			var bridge = bs._bridge
			if bridge:
				bridge.send_to_react("resources", bs.resources),
		old_val, target_val, 1.2
	)


## Remove and free all visible collect icons (e.g. when entering attack mode).
func _hide_all_collect_icons() -> void:
	for b in bs.placed_buildings:
		var icon = b.get("_collect_icon")
		if icon and is_instance_valid(icon):
			icon.visible = false
			icon.queue_free()
		b["_collect_icon"] = null


## Temporarily remove collection controls from both rendering and hit testing.
## Existing buttons are retained so ending a move does not recreate their UI.
func set_collection_icons_suppressed(suppressed: bool) -> void:
	_collection_icons_suppressed = suppressed
	if suppressed:
		_hide_collection_icons_without_freeing()
		return
	for b in bs.placed_buildings:
		var icon := b.get("_collect_icon") as Control
		if is_instance_valid(icon):
			icon.mouse_filter = Control.MOUSE_FILTER_STOP
	_update_collect_icons()


func _hide_collection_icons_without_freeing() -> void:
	for b in bs.placed_buildings:
		var icon := b.get("_collect_icon") as Control
		if is_instance_valid(icon):
			icon.visible = false
			icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
