shader_type spatial;

render_mode blend_mix, depth_draw_never, cull_disabled;

uniform sampler2D wave_texture : repeat_enable, filter_linear_mipmap;
uniform vec4 WATER_COL : source_color = vec4(0.32, 0.68, 0.98, 1.0);
uniform vec4 WATER2_COL : source_color = vec4(0.18, 0.54, 0.9, 1.0);
uniform vec4 FOAM_COL : source_color = vec4(0.88, 0.98, 1.0, 1.0);
uniform vec2 tile = vec2(34.0, 34.0);
uniform float height = 0.04;
uniform float wave_speed = 0.72;
uniform float water_alpha = 0.96;

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
	float foam = smoothstep(0.73, 0.93, analytic_cross) * smoothstep(0.08, 0.28, wave_line);
	vec3 deep_color = WATER2_COL.rgb * vec3(0.72, 0.90, 1.10);
	vec3 water_color = mix(deep_color, WATER_COL.rgb, 0.30 + broad_wave * 0.48);
	ALBEDO = mix(water_color, FOAM_COL.rgb, foam * 0.72);
	ROUGHNESS = mix(0.46, 0.68, foam);
	ALPHA = max(water_alpha, foam * 0.56);
}
