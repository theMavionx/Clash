shader_type spatial;

group_uniforms BaseProperties;
uniform vec4 color: source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform sampler2D base_texture: source_color, filter_linear_mipmap;
uniform float specular_strength: hint_range(0.0, 1.0) = 0.3;
uniform float specular_size: hint_range(0.0, 1.0) = 0.5;
uniform float fresnel_strength: hint_range(0.0, 1.0) = 0.2;
uniform float fresnel_width: hint_range(0.0, 5.0) = 2.0;
group_uniforms;

group_uniforms CelShading;
uniform int shade_levels: hint_range(2, 8) = 3;
uniform float shadow_threshold: hint_range(0.0, 1.0) = 0.5;
uniform vec4 shadow_color: source_color = vec4(0.6, 0.6, 0.7, 1.0);
group_uniforms;

group_uniforms Tiling;
uniform vec2 uv_scale = vec2(1, 1);
uniform vec2 uv_offset = vec2(0, 0);
group_uniforms;

void vertex() {
	UV = UV * uv_scale + uv_offset;
}

void fragment() {
	ALBEDO = color.rgb * texture(base_texture, UV).rgb;
	SPECULAR = 0.0;
	ROUGHNESS = 1.0;
}

void light() {
	// Cel-shaded diffuse
	float NdotL = dot(NORMAL, LIGHT);
	float intensity = clamp(NdotL * ATTENUATION, 0.0, 1.0);
	float levels = float(shade_levels);
	float stepped = floor(intensity * levels) / levels;
	vec3 shaded = mix(ALBEDO * shadow_color.rgb, ALBEDO, stepped);
	DIFFUSE_LIGHT += shaded * LIGHT_COLOR;

	// Specular highlight (hard edge)
	vec3 half_dir = normalize(VIEW + LIGHT);
	float NdotH = dot(NORMAL, half_dir);
	float spec = smoothstep(1.0 - specular_size * 0.1, 1.0 - specular_size * 0.1 + 0.01, NdotH);
	SPECULAR_LIGHT += spec * specular_strength * LIGHT_COLOR * ATTENUATION;

	// Fresnel rim
	float NdotV = dot(NORMAL, VIEW);
	float rim = pow(1.0 - clamp(NdotV, 0.0, 1.0), fresnel_width);
	float rim_stepped = step(0.5, rim);
	DIFFUSE_LIGHT += rim_stepped * fresnel_strength * LIGHT_COLOR * ATTENUATION;
}
