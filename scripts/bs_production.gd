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
	"ore":  "res://web/src/assets/resources/stone_bar.png",
	"wood": "res://web/src/assets/resources/wood_bar.png",
	"gold": "res://web/src/assets/resources/gold_bar.png",
}

# ── Back-reference to BuildingSystem ──────────────────────────
## The Node3D that owns this helper (a BuildingSystem instance).
var bs: Node3D

## Initialise with the owning BuildingSystem node.
## Returns self so the caller can chain: BSProduction.new().init(self)
func init(building_system: Node3D) -> BSProduction:
	bs = building_system
	return self

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
		var rate_per_sec: float = rate_arr[rate_idx] / 60.0
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
	var tex_path: String = COLLECT_ICON_TEXTURES.get(res_type, COLLECT_ICON_TEXTURES["gold"])
	var tex = load(tex_path)
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
	_spawn_collection_flying_icon(start_pos, res_type)
	_collect_and_animate(b, res_type)

## Spawn multiple flying resource icons that travel from the building toward the
## matching HUD counter label.
func _spawn_collection_flying_icon(start_pos: Vector2, res_type: String) -> void:
	var tex_path: String = COLLECT_ICON_TEXTURES.get(res_type, COLLECT_ICON_TEXTURES["gold"])
	var tex = load(tex_path)
	if not tex:
		return

	var screen_w: float   = bs.get_viewport().get_visible_rect().size.x
	var target_pos := Vector2(screen_w - 360.0, 40.0)
	if res_type == "wood":
		target_pos = Vector2(screen_w - 220.0, 40.0)
	elif res_type == "ore":
		target_pos = Vector2(screen_w - 80.0, 40.0)

	# Prefer the actual label position when it is visible on screen
	if not OS.has_feature("web") and is_instance_valid(bs.gold_label) and bs.gold_label.is_visible_in_tree():
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

## Deduct stored amount from the building, optionally sync with server, then
## tween the on-screen resource counter up to the new total.
func _collect_and_animate(b: Dictionary, res_type: String) -> void:
	var server_id: int  = b.get("server_id", -1)
	var local_amount: int = int(b.get("stored", 0.0))
	if local_amount <= 0:
		return
	b["stored"] = 0.0

	var old_val: int    = int(bs.resources.get(res_type, 0))
	var target_val: int = old_val + local_amount

	var net = bs._net
	if net and net.has_token():
		var result = await net.collect_resources(server_id)
		if result.has("error"):
			return
		if result.has("resources"):
			target_val = int(result.resources.get(res_type, target_val))
			for k in ["gold", "wood", "ore"]:
				if k != res_type and result.resources.has(k):
					bs.resources[k] = result.resources[k]
	else:
		target_val = old_val + local_amount

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

## Remove and free all visible collect icons (e.g. when entering attack mode).
func _hide_all_collect_icons() -> void:
	for b in bs.placed_buildings:
		var icon = b.get("_collect_icon")
		if icon and is_instance_valid(icon):
			icon.visible = false
			icon.queue_free()
		b["_collect_icon"] = null
