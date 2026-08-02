shader_type spatial;
render_mode unshaded, blend_mix, cull_disabled, depth_draw_never;

uniform vec4 hot_color : source_color = vec4(1.0, 0.34, 0.025, 1.0);
uniform vec4 warm_color : source_color = vec4(0.72, 0.025, 0.002, 1.0);
uniform float stream_start : hint_range(0.0, 1.0) = 0.0;
uniform float stream_end : hint_range(0.0, 1.0) = 1.0;
uniform float opacity : hint_range(0.0, 1.0) = 0.14;

float hash21(vec2 point) {
	return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float value_noise(vec2 point) {
	vec2 cell = floor(point);
	vec2 local = fract(point);
	local = local * local * (3.0 - 2.0 * local);
	float a = hash21(cell);
	float b = hash21(cell + vec2(1.0, 0.0));
	float c = hash21(cell + vec2(0.0, 1.0));
	float d = hash21(cell + vec2(1.0, 1.0));
	return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

void fragment() {
	float along = UV.y;
	float lateral = abs(UV.x * 2.0 - 1.0);
	float moving_noise = value_noise(vec2(UV.x * 5.0, along * 9.0 - TIME * 4.2));
	float fine_noise = value_noise(vec2(UV.x * 11.0 + 3.7, along * 18.0 - TIME * 7.0));
	float start_mask = smoothstep(stream_start, stream_start + 0.035, along);
	float end_mask = 1.0 - smoothstep(stream_end - 0.012, stream_end, along);
	float edge_limit = mix(0.54, 0.91, moving_noise);
	float edge_mask = 1.0 - smoothstep(edge_limit, min(edge_limit + 0.16, 1.0), lateral);
	float body = smoothstep(0.34, 0.76, moving_noise * 0.62 + fine_noise * 0.38);
	float distance_heat = smoothstep(0.10, 0.88, along);
	vec3 flame_color = mix(hot_color.rgb, warm_color.rgb, distance_heat * 0.82);
	float alpha = opacity * start_mask * end_mask * edge_mask * (0.24 + body * 0.76);
	ALBEDO = flame_color;
	EMISSION = vec3(0.0);
	ALPHA = alpha;
}
