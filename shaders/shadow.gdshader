shader_type canvas_item;

uniform vec4 color : source_color = vec4(0.0, 0.0, 0.05, 0.18);
uniform float blur_size : hint_range(0.0, 0.2) = 0.025;
uniform float alpha_cutoff : hint_range(0.0, 1.0) = 0.1;

void fragment() {
	float alpha = 0.0;
	float total = 0.0;
	int steps = 16;

	for (int i = 0; i < steps; i++) {
		float angle = float(i) * 6.28318 / float(steps);
		for (float r = 0.25; r <= 1.0; r += 0.25) {
			vec2 offset = vec2(cos(angle), sin(angle)) * blur_size * r;
			float a = texture(TEXTURE, UV + offset).a;
			alpha += step(alpha_cutoff, a);
			total += 1.0;
		}
	}

	alpha /= total;
	alpha = smoothstep(0.0, 0.5, alpha);
	COLOR = vec4(color.rgb, alpha * color.a);
}
