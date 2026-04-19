shader_type spatial;
render_mode unshaded, blend_mix, depth_test_disabled, cull_disabled;

// Shared HP-bar shader used by BaseTroop and BuildingSystem.
// `bar_size` is a uniform — default value is irrelevant, call sites set it.
// Consolidated here so only one shader variant compiles on the GPU.
uniform vec4 albedo : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec2 bar_size = vec2(0.12, 0.012);

void fragment() {
	vec2 pos = (UV - 0.5) * bar_size;
	float r = bar_size.y * 0.45;
	vec2 q = abs(pos) - bar_size * 0.5 + r;
	float d = length(max(q, 0.0)) - r;
	float aa = fwidth(d);
	ALBEDO = albedo.rgb;
	ALPHA = albedo.a * (1.0 - smoothstep(-aa, aa, d));
}
