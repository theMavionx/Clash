shader_type spatial;
render_mode unshaded, cull_disabled;

uniform sampler2D noise1 : filter_linear_mipmap, repeat_enable;
uniform sampler2D noise2 : filter_linear_mipmap, repeat_enable;
uniform vec3 tint : source_color = vec3(0.65, 0.1, 1.0);
uniform float intensity : hint_range(0.5, 4.0) = 3.0;

void vertex() {
	// Cheap vertex wobble — no texture fetch, just sine waves
	float t = TIME * 4.0 + VERTEX.x * 20.0 + VERTEX.z * 15.0;
	VERTEX += NORMAL * sin(t) * 0.008;
}

void fragment() {
	float l1 = texture(noise1, UV + TIME * 0.15).r * sin(TIME * 6.0);
	float l2 = texture(noise2, UV - TIME * 0.12).r * cos(TIME * 6.0);
	float combined = l1 + l2;
	ALBEDO = vec3(combined) * tint * intensity;
	ALPHA = clamp(combined * 1.2 + 0.82, 0.0, 1.0);
}
