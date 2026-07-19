shader_type spatial;
render_mode unshaded, depth_draw_never;

uniform vec4 fill_color : source_color = vec4(0.8, 0.1, 0.1, 0.35);

void fragment() {
	ALBEDO = fill_color.rgb;
	ALPHA = fill_color.a;
}
