shader_type canvas_item;

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform float seed_val : hint_range(0.0, 100.0) = 0.0;
uniform float softness : hint_range(0.1, 1.0) = 0.4;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float total = 0.0;
	float amp = 0.5;
	float freq = 1.0;
	for (int i = 0; i < 5; i++) {
		total += noise(p * freq + seed_val) * amp;
		freq *= 2.0;
		amp *= 0.5;
	}
	return total;
}

void fragment() {
	vec2 uv = UV;

	// Soft circular edge
	vec2 centered = (uv - 0.5) * 2.0;
	float dist = length(centered);
	float edge = smoothstep(1.0, softness, dist);

	// Cloud shape from noise
	float n = fbm(uv * 3.5);
	float cloud = smoothstep(0.25, 0.55, n) * edge;

	// Slightly vary white for depth (not pure white)
	vec3 col = mix(vec3(0.92, 0.94, 0.96), vec3(1.0), n);

	COLOR = vec4(col, cloud * progress);
}
