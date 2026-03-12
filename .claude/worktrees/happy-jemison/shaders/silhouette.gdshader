shader_type canvas_item;

// Solid-color silhouette with lightweight blur and optional pulse.
// blur_size > 0 → soft alpha falloff (9-tap). pulse_speed > 0 → animated.
uniform vec4 color : source_color = vec4(0.2, 0.8, 0.7, 0.2);
uniform float pulse_speed  : hint_range(0.0, 5.0) = 0.0;
uniform float pulse_amount : hint_range(0.0, 0.3) = 0.0;
uniform float blur_size    : hint_range(0.0, 0.1, 0.001) = 0.0;

void fragment() {
	float a;
	if (blur_size > 0.001) {
		// 9-tap weighted disc blur (center + 8 ring)
		a = texture(TEXTURE, UV).a * 2.0;
		float tw = 2.0;
		for (int i = 0; i < 8; i++) {
			float ang = float(i) * 0.7854;
			vec2 off = vec2(cos(ang), sin(ang)) * blur_size;
			a += texture(TEXTURE, UV + off).a;
			tw += 1.0;
		}
		a /= tw;
	} else {
		a = texture(TEXTURE, UV).a;
	}
	float pulse = sin(TIME * pulse_speed + UV.x * 12.0 + UV.y * 10.0) * pulse_amount;
	COLOR = vec4(color.rgb, clamp(color.a * a + pulse * a, 0.0, 1.0));
}
