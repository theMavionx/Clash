shader_type canvas_item;

// ── textures ──
uniform sampler2D waterNoise1 : repeat_enable, filter_linear;
uniform sampler2D waterNoise2 : repeat_enable, filter_linear;

// ── look ──
uniform vec4 waterColor : source_color = vec4(0.14, 0.42, 0.72, 1.0);
uniform float colorMix : hint_range(0.0, 1.0, 0.01) = 0.35;

// ── motion (kept gentle) ──
uniform float time_scale  : hint_range(0.0, 10.0, 0.1) = 2.0;
uniform float uv_scale    : hint_range(0.1, 30.0, 0.1) = 8.0;
uniform float distortion  : hint_range(0.0, 0.05, 0.001) = 0.008;

// ── waves ──
uniform float brightness : hint_range(0.0, 3.0, 0.05) = 0.7;
uniform float wave_low   : hint_range(0.0, 1.0, 0.05) = 0.55;
uniform float wave_high  : hint_range(0.0, 1.5, 0.05) = 0.9;

void fragment() {
	vec2 uv = UV * uv_scale;

	// organic sin / cos distortion (adapted from spatial shader)
	float dx = sin(TIME * time_scale + (uv.x + uv.y) * 25.0) * distortion;
	float dy = cos(TIME * time_scale + (uv.x - uv.y) * 25.0) * distortion;
	uv += vec2(dx, dy);

	// animated blend between two noise layers
	float blend = (sin(TIME * time_scale) + 1.0) * 0.5;
	vec3 n = mix(
		texture(waterNoise1, uv).rgb,
		texture(waterNoise2, uv).rgb,
		blend
	);

	// bright wave highlights
	float wave = smoothstep(wave_low, wave_high, n.r);
	vec3 color = waterColor.rgb + wave * vec3(brightness);

	COLOR = mix(vec4(color, 1.0), waterColor, colorMix);
}
