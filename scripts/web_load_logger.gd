class_name WebLoadLogger
extends Object

static func report(phase: String, meta: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		return
	var payload := meta.duplicate()
	payload["ticks_ms"] = Time.get_ticks_msec()
	JavaScriptBridge.eval(
		"if(window.godotLoadingProgress) window.godotLoadingProgress(%d, %s, %s);" %
		[0, JSON.stringify(phase), JSON.stringify(payload)]
	)
