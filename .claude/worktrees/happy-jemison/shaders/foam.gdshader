shader_type canvas_item;

// Animated shoreline foam — renders only near texture edges.
// Applied to a slightly scaled-up copy of the island sprite.
uniform vec4 foam_color : source_color = vec4(1.0, 1.0, 1.0, 0.7);
uniform float edge_width : hint_range(0.005, 0.06, 0.001) = 0.018;
uniform float softness   : hint_range(0.0, 1.0, 0.05) = 0.4;
uniform float pulse_speed  : hint_range(0.0, 4.0, 0.1) = 1.5;
uniform float pulse_amount : hint_range(0.0, 0.5, 0.01) = 0.2;

void fragment() {
	float a = texture(TEXTURE, UV).a;

	// Find minimum neighbor alpha — low value means we are near an edge
	float min_a = 1.0;
	for (int i = 0; i < 12; i++) {
		float ang = float(i) * 0.5236;
		vec2 off = vec2(cos(ang), sin(ang)) * edge_width;
		min_a = min(min_a, texture(TEXTURE, UV + off).a);
	}

	// Edge mask: strong where neighbors become transparent
	float edge = a * (1.0 - smoothstep(softness, 1.0, min_a));

	// Dual-wave animation for organic surf feel
	float w1 = sin(TIME * pulse_speed + UV.x * 10.0 + UV.y * 8.0);
	float w2 = sin(TIME * pulse_speed * 0.7 - UV.x * 7.0 + UV.y * 13.0);
	float wave = (w1 + w2 * 0.5) * pulse_amount;

	float fa = foam_color.a * edge * (1.0 + wave);
	COLOR = vec4(foam_color.rgb, clamp(fa, 0.0, 1.0));
}
