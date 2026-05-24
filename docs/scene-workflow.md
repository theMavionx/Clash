# Scene Workflow

This project uses two Godot scenes with different development responsibilities.

## Production Scene

Path: `res://scenes/Main.tscn`

This is the main production scene. The website game build is expected to come from this scene. Only verified, working features should be added here.

## Test Scene

Path: `res://scenes/TestMain.tscn`

This is the sandbox and test harness scene. New buildings, troops, systems, debug buttons, random village generation, and experimental features should be added here first. This scene is not considered a production build.

## Promotion Flow

1. Implement or prototype new features in `TestMain.tscn`.
2. After the user tests and approves them, port only the approved gameplay changes into `Main.tscn`.
3. Only after `Main.tscn` is approved, run the web export and deploy flow.

Do not move experimental test-only helpers from `TestMain.tscn` into `Main.tscn` unless the user explicitly requests it.
