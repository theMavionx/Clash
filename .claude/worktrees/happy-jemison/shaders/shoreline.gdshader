shader_type canvas_item;

uniform float halo_radius : hint_range(10.0, 150.0) = 50.0;
uniform vec3 color_shallow : source_color = vec3(0.15, 0.75, 0.65);
uniform vec3 color_deep : source_color = vec3(0.05, 0.25, 0.35);
uniform float alpha_max : hint_range(0.0, 1.0) = 0.55;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);

	// Island pixel — draw normally
	if (tex.a > 0.5) {
		COLOR = tex;
		return;
	}

	// Search 12 directions x 5 distances for nearest opaque pixel
	vec2 texel = TEXTURE_PIXEL_SIZE;
	float closest = 1.0;

	for (int i = 0; i < 12; i++) {
		float angle = 6.2832 * float(i) / 12.0;
		vec2 dir = vec2(cos(angle), sin(angle));
		for (int d = 1; d <= 5; d++) {
			float nd = float(d) / 5.0;
			vec2 offset = dir * halo_radius * texel * nd;
			if (texture(TEXTURE, UV + offset).a > 0.5) {
				closest = min(closest, nd);
				break;
			}
		}
	}

	if (closest < 1.0) {
		// Gradient: turquoise near shore -> deeper blue further out
		float fade = closest * closest;
		vec3 halo_color = mix(color_shallow, color_deep, fade);
		COLOR = vec4(halo_color, alpha_max * (1.0 - fade));
	} else {
		COLOR = vec4(0.0);
	}
}
