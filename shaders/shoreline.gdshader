shader_type canvas_item;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);

	// Subtle shoreline tint on edge pixels
	float edge = smoothstep(0.05, 0.3, tex.a);
	vec3 shore_col = mix(vec3(0.15, 0.65, 0.6), tex.rgb, edge);

	COLOR = vec4(shore_col, tex.a);
}
