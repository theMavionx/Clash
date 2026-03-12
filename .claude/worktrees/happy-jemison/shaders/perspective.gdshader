shader_type canvas_item;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform float tilt : hint_range(0.0, 0.4) = 0.18;
uniform float vertical_shift : hint_range(-0.2, 0.2) = -0.05;

void fragment() {
	vec2 uv = SCREEN_UV;

	// Perspective warp: top of screen narrower, bottom wider
	// Simulates camera looking down at ~30 degree angle
	float scale_x = mix(1.0 - tilt, 1.0 + tilt, uv.y);
	uv.x = 0.5 + (uv.x - 0.5) / scale_x;

	// Slight vertical shift to push horizon up
	uv.y = uv.y + vertical_shift * (1.0 - uv.y);

	// Clamp - use edge color for out-of-bounds
	uv = clamp(uv, vec2(0.001), vec2(0.999));

	COLOR = texture(screen_texture, uv);
}
