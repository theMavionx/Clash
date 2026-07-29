shader_type spatial;

render_mode blend_mix, depth_draw_never, cull_disabled;

uniform sampler2D wave_texture_a : repeat_enable, filter_linear_mipmap;
uniform sampler2D wave_texture_b : repeat_enable, filter_linear_mipmap;
uniform sampler2D depth_texture : hint_depth_texture, repeat_disable, filter_nearest;
uniform vec4 WATER_COL : source_color = vec4(0.1, 0.45, 0.85, 1.0);
uniform vec4 WATER2_COL : source_color = vec4(0.08, 0.4, 0.75, 1.0);
uniform vec4 FOAM_COL : source_color = vec4(0.75, 0.92, 0.95, 1.0);
uniform float distortion_speed = 1.2;
uniform vec2 tile = vec2(40.0, 40.0);
uniform float height = 0.05;
uniform vec2 wave_size = vec2(3.0, 3.0);
uniform float wave_speed = 0.8;
uniform float shore_fade_distance = 0.65;
uniform float shallow_alpha = 0.16;
uniform float deep_alpha = 0.98;
uniform bool paused = false;
uniform float frozen_time = 0.0;
uniform bool use_depth_fade = true;

void vertex() {
	float t = paused ? frozen_time : TIME;
	vec2 scaled_uv = UV * wave_size;
	float phase_a = (scaled_uv.x * 1.35 + scaled_uv.y * 0.55) * TAU + t * wave_speed * 0.58;
	float phase_b = (-scaled_uv.x * 0.48 + scaled_uv.y * 1.72) * TAU - t * wave_speed * 0.43;
	float wave_a = sin(phase_a);
	float wave_b = sin(phase_b);
	VERTEX.y += (wave_a * 0.62 + wave_b * 0.38) * height;
}

void fragment() {
	float t = paused ? frozen_time : TIME;
	vec2 base_uv = UV * tile;
	vec2 uv_a = base_uv * vec2(0.16, 0.13) + vec2(t * 0.019, t * 0.009) * distortion_speed;
	vec2 rotated_uv = vec2(
		base_uv.x * 0.23 + base_uv.y * 0.17,
		-base_uv.x * 0.14 + base_uv.y * 0.28
	);
	vec2 uv_b = rotated_uv + vec2(-t * 0.013, t * 0.016) * distortion_speed;
	float line_a = texture(wave_texture_a, uv_a).r;
	float line_b = texture(wave_texture_b, uv_b).r;

	float broad_wave = smoothstep(0.018, 0.19, line_a);
	float crossing_wave = smoothstep(0.045, 0.24, line_b);
	vec3 deep_color = WATER2_COL.rgb * vec3(0.72, 0.90, 1.10);
	vec3 water_color = mix(deep_color, WATER_COL.rgb, 0.30 + broad_wave * 0.48);
	water_color += crossing_wave * vec3(0.018, 0.045, 0.072);

	float crest_energy = line_a * 0.62 + line_b * 0.92;
	float foam = smoothstep(0.21, 0.43, crest_energy) * 0.72;
	ALBEDO = mix(water_color, FOAM_COL.rgb, foam);
	ROUGHNESS = mix(0.46, 0.68, foam);

	if (!use_depth_fade) {
		ALPHA = max(deep_alpha, foam * 0.56);
	} else {
		float scene_depth_raw = texture(depth_texture, SCREEN_UV).r;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
		vec3 scene_ndc = vec3(SCREEN_UV, scene_depth_raw) * 2.0 - 1.0;
#else
		vec3 scene_ndc = vec3(SCREEN_UV * 2.0 - 1.0, scene_depth_raw);
#endif
		vec4 scene_view = INV_PROJECTION_MATRIX * vec4(scene_ndc, 1.0);
		scene_view.xyz /= scene_view.w;
		float depth_gap = max((-scene_view.z) - (-VERTEX.z), 0.0);
		float deep_water = smoothstep(0.0, max(shore_fade_distance, 0.001), depth_gap);
		float water_alpha = mix(shallow_alpha, deep_alpha, deep_water);
		ALPHA = max(water_alpha, foam * 0.56);
	}
}
