shader_type canvas_item;

// Soft animated shoreline foam around islands.
uniform vec4 foam_color : source_color = vec4(0.85, 0.95, 1.0, 0.3);
uniform float edge_width : hint_range(0.005, 0.06, 0.001) = 0.035;
uniform float softness   : hint_range(0.0, 1.0, 0.05) = 0.15;
uniform float pulse_speed  : hint_range(0.0, 4.0, 0.1) = 1.2;
uniform float pulse_amount : hint_range(0.0, 0.5, 0.01) = 0.12;
uniform bool paused = false;
uniform float frozen_time = 0.0;

void fragment() {
	float t = paused ? frozen_time : TIME;
	float a = texture(TEXTURE, UV).a;

	// Find minimum neighbor alpha — low value means we are near an edge
	float min_a = 1.0;
	for (int i = 0; i < 12; i++) {
		float ang = float(i) * 0.5236;
		vec2 off = vec2(cos(ang), sin(ang)) * edge_width;
		min_a = min(min_a, texture(TEXTURE, UV + off).a);
	}

	// Soft edge mask with wide gradient
	float edge = a * (1.0 - smoothstep(softness, 0.85, min_a));

	// Dual-wave animation for organic surf feel
	float w1 = sin(t * pulse_speed + UV.x * 8.0 + UV.y * 6.0);
	float w2 = sin(t * pulse_speed * 0.6 - UV.x * 5.0 + UV.y * 11.0);
	float wave = (w1 + w2 * 0.5) * pulse_amount;

	float fa = foam_color.a * edge * (1.0 + wave);
	COLOR = vec4(foam_color.rgb, clamp(fa, 0.0, 0.4));
}
