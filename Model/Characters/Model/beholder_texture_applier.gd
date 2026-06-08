@tool
extends Node3D

const DEFAULT_MATERIAL: Material = preload("res://Model/Characters/Model/Beholder_DefaultMaterial.tres")

var _material: Material = DEFAULT_MATERIAL

@export var material: Material:
	get:
		return _material
	set(value):
		_material = value
		if is_inside_tree():
			call_deferred("_apply_material")


func _ready() -> void:
	call_deferred("_apply_material")


func _notification(what: int) -> void:
	if what == NOTIFICATION_CHILD_ORDER_CHANGED:
		call_deferred("_apply_material")


func _apply_material() -> void:
	if _material == null:
		return
	_assign_material_recursive(self, _material)


func _assign_material_recursive(node: Node, target_material: Material) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		mesh_instance.material_override = target_material
		if mesh_instance.mesh != null:
			for surface_index in range(mesh_instance.mesh.get_surface_count()):
				mesh_instance.set_surface_override_material(surface_index, target_material)

	for child in node.get_children():
		_assign_material_recursive(child, target_material)
