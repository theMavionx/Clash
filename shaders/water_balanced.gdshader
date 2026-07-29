shader_type spatial;

render_mode blend_mix, depth_draw_never, cull_disabled;

uniform sampler2D wave_texture : repeat_enable, filter_linear_mipmap;
uniform sampler2D depth_texture : hint_depth_texture, repeat_disable, filter_nearest;
uniform vec4 WATER_COL : source_color = vec4(0.32, 0.68, 0.98, 1.0);
uniform vec4 WATER2_COL : source_color = vec4(0.18, 0.54, 0.9, 1.0);
uniform vec4 FOAM_COL : source_color = vec4(0.88, 0.98, 1.0, 1.0);
uniform vec2 tile = vec2(34.0, 34.0);
uniform float height = 0.045;
uniform float wave_speed = 0.72;
uniform float shore_fade_distance = 0.65;
uniform float shallow_alpha = 0.16;
uniform float deep_alpha = 0.98;

void vertex() {
	float phase_a = (UV.x * 3.2 + UV.y * 1.4) * TAU + TIME * wave_speed * 0.58;
	float phase_b = (-UV.x * 1.6 + UV.y * 4.1) * TAU - TIME * wave_speed * 0.43;
	VERTEX.y += (sin(phase_a) * 0.65 + sin(phase_b) * 0.35) * height;
}

void fragment() {
	vec2 base_uv = UV * tile;
	vec2 wave_uv = base_uv * vec2(0.16, 0.13) + vec2(TIME * 0.019, TIME * 0.009);
	float wave_line = texture(wave_texture, wave_uv).r;
	float analytic_cross = sin((base_uv.x * 0.15 + base_uv.y * 0.22) + TIME * 0.72) * 0.5 + 0.5;
	float broad_wave = smoothstep(0.018, 0.19, wave_line);
	float crossing_wave = smoothstep(0.68, 0.92, analytic_cross);
	vec3 deep_color = WATER2_COL.rgb * vec3(0.72, 0.90, 1.10);
	vec3 water_color = mix(deep_color, WATER_COL.rgb, 0.30 + broad_wave * 0.48);
	water_color += crossing_wave * vec3(0.018, 0.045, 0.072);
	float foam = smoothstep(0.23, 0.42, wave_line + crossing_wave * 0.18) * 0.72;
	ALBEDO = mix(water_color, FOAM_COL.rgb, foam);
	ROUGHNESS = mix(0.46, 0.68, foam);

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
	ALPHA = max(mix(shallow_alpha, deep_alpha, deep_water), foam * 0.56);
}
