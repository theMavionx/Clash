shader_type spatial;
render_mode cull_back, depth_draw_opaque;

// Polyart MaskTint port. The base albedo is multi-region greyscale-ish; the
// three mask textures (R/G/B channels each → 9 total regions) carry weights
// that fade in the 9 corresponding colors. Defaults below are the Purple
// scheme from PAMaskTint03.mat.

uniform sampler2D albedo : source_color, filter_nearest;
uniform sampler2D emission_tex : source_color, filter_nearest;
uniform sampler2D mask01 : filter_nearest;
uniform sampler2D mask02 : filter_nearest;
uniform sampler2D mask03 : filter_nearest;

uniform vec4 color01 : source_color = vec4(0.3729707,  0.15806337, 0.9056604, 1.0);
uniform vec4 color02 : source_color = vec4(0.53992397, 0.132921,   0.9716981, 1.0);
uniform vec4 color03 : source_color = vec4(0.253366,   0.05673728, 0.7075472, 1.0);
uniform vec4 color04 : source_color = vec4(0.6216712,  0.27634388, 0.8490566, 1.0);
uniform vec4 color05 : source_color = vec4(0.4045035,  0.21106264, 0.8773585, 1.0);
uniform vec4 color06 : source_color = vec4(0.44014102, 0.2770114,  0.7830189, 1.0);
uniform vec4 color07 : source_color = vec4(0.60382915, 0.16509432, 1.0,       1.0);
uniform vec4 color08 : source_color = vec4(0.35849056, 0.35849056, 0.35849056, 1.0);
uniform vec4 color09 : source_color = vec4(0.5243206,  0.46755964, 0.745283,  1.0);

uniform float color_power : hint_range(0.0, 10.0) = 1.0;
uniform vec3 emission_strength : source_color = vec3(0.749, 0.749, 0.749);

void fragment() {
	vec4 base = texture(albedo, UV);
	vec4 m1 = texture(mask01, UV);
	vec4 m2 = texture(mask02, UV);
	vec4 m3 = texture(mask03, UV);

	// Per region: min(mask_channel_value, region_color) * power.
	// min() preserves mask intensity as a ceiling so dark mask = dim color.
	vec3 blend = vec3(0.0);
	blend += min(vec3(m1.r), color01.rgb) * color_power;
	blend += min(vec3(m1.g), color02.rgb) * color_power;
	blend += min(vec3(m1.b), color03.rgb) * color_power;
	blend += min(vec3(m2.r), color04.rgb) * color_power;
	blend += min(vec3(m2.g), color05.rgb) * color_power;
	blend += min(vec3(m2.b), color06.rgb) * color_power;
	blend += min(vec3(m3.r), color07.rgb) * color_power;
	blend += min(vec3(m3.g), color08.rgb) * color_power;
	blend += min(vec3(m3.b), color09.rgb) * color_power;

	// Lerp from raw albedo (where masks are zero) to tinted (where masks are bright).
	float mask_sum = m1.r + m1.g + m1.b + m2.r + m2.g + m2.b + m3.r + m3.g + m3.b;
	vec3 tinted = clamp(base.rgb * blend, vec3(0.0), vec3(1.0));
	ALBEDO = mix(base.rgb, tinted, clamp(mask_sum, 0.0, 1.0));

	vec3 em = texture(emission_tex, UV).rgb;
	EMISSION = em * emission_strength;
}
