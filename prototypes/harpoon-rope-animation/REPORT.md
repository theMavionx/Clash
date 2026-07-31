<!--
PROTOTYPE - NOT FOR PRODUCTION
Question: Can the lower linkage be removed while adding clean circular yaw, launch, rope, and retract animation?
Date: 2026-07-31
-->

## Prototype Report: Clean Harpoon + Rope + Yaw

### Hypothesis

Нижня декоративна мотузка, котушка та кронштейн не потрібні для основної
анімації. Їх можна прибрати, а всю верхню гарпунну установку згрупувати під
одним центральним yaw-pivot, щоб вона оберталася навколо круглої основи разом
із гарпуном, точкою виходу мотузки та напрямком пострілу.

### Approach

- Оригінальний `harpoon_turret.glb` збережено без змін. Його SHA-256:
  `313B7989B03E98D708546077198E467E83057EAA232E95CE850EC42D7D23E3F1`.
- У Blender 5.1.1 окремо підсвічено три групи: механізм для видалення,
  нерухома основа та верхня установка, що обертається.
- Видалено 9 mesh-вузлів: верхнє кільце linkage, вертикальну тягу, нижню
  котушку, ручку та кронштейн.
- Шість mesh-вузлів круглої основи залишено статичними. Решта верхньої
  установки згрупована під `TurretYawPivot`.
- `HarpoonProjectile`, `RopeMuzzle`, `RopeHook` і `LaunchTarget` зроблено
  дочірніми до yaw-системи, тому постріл і мотузка автоматично повертаються
  разом із баштою.
- Godot-анімація проходить 60° дугу від `−32°` до `+28°`, фіксує напрямок,
  запускає гарпун на 6 м, тримає мотузку, повертає гарпун і обертається назад.
- Після clean-rig повторно створено LOD та виконано однаковий детермінований
  30 FPS Movie Maker run для original і LOD.

### Result

Гіпотезу підтверджено. Нижній механізм повністю прибраний без отворів у корпусі
або втрати основної форми. Силует став чистішим, а верхня установка вільно
обертається навколо центральної осі pedestal.

На кожному кадрі:

- нерухома основа залишається на місці;
- верхня установка, гарпун, muzzle і target direction мають однаковий yaw;
- projectile рухається вздовж уже повернутого напряму;
- процедурна мотузка не відривається від башти або хвоста гарпуна;
- після retract гарпун повертається до muzzle до початку зворотного yaw.

### Metrics

- Raw source: 45 mesh objects, 14,665 vertices, 17,242 triangles.
- Removed linkage: 9 meshes, 4,750 triangles.
- Clean original: 36 meshes, 12,492 triangles.
- Clean reduction from raw source: 27.549%.
- Clean rigged GLB: 1,842,860 bytes versus 2,086,864-byte source.
- Clean LOD: 8,814 triangles.
- LOD reduction from clean original: 29.443%.
- Total LOD reduction from raw source: 48.881%.
- Clean LOD GLB: 1,736,452 bytes.
- Yaw range: `−32°…+28°` (60° demonstrated sweep).
- Aim yaw monotonic: pass.
- Return yaw monotonic: pass.
- Maximum static base drift: 0.0 m.
- Launch distance: 6.0 m.
- Maximum rope length: 6.002400 m.
- Maximum rope endpoint error: original 0.0 m; LOD 0.000000119 m.
- Original: 144/144 PNG movie frames decoded, 143 telemetry samples.
- LOD: 144/144 PNG movie frames decoded, 143 telemetry samples.
- Keyframes: 18/18 for each variant.
- External verification: 288/288 PNG frames and 286/286 telemetry rows valid.
- Observed phases: `READY`, `AIMING`, `LOCKED`, `FIRING`, `ROPE TAUT`,
  `REELING IN`, `RETURNING`, `RESET`.
- Original render averages: CPU 0.57 ms/frame, GPU 5.62 ms/frame.
- LOD render averages: CPU 0.48 ms/frame, GPU 3.87 ms/frame.
- Original-vs-LOD comparison across 18 keyframes: 31.165 dB average PSNR,
  maximum mean absolute channel error 0.818/255.
- Visual iteration count: 1 mesh-selection pass, 1 original yaw pass,
  1 LOD yaw pass.

Render timing is a focused prototype measurement, not a production benchmark
for many simultaneous turrets.

### Screenshot Index

1. `screenshots/07_linkage_and_yaw_parts.png` — orange removed linkage,
   blue static base, gray rotating assembly.
2. `screenshots/08_clean_yaw_rigged_preview.png` — clean rig rotated and fired.
3. `screenshots/09_clean_yaw_optimized_model.png` — clean LOD render.
4. `screenshots/yaw_frames/00_yaw_start.png` — start at `−32°`.
5. `screenshots/yaw_frames/04_yaw_locked.png` — locked at `+28°`.
6. `screenshots/yaw_frames/08_full_extension.png` — rotated 6 m shot.
7. `screenshots/yaw_frames/12_retract_50.png` — mid-retract.
8. `screenshots/yaw_frames/15_yaw_return_50.png` — return yaw.
9. `screenshots/yaw_frames/17_settled.png` — home state.
10. `screenshots/10_clean_yaw_original_vs_lod_full_extension.png` —
    original/LOD comparison.

### Recommendation: PROCEED

Це кращий напрямок за початкову версію. Видалення нижнього linkage звільняє
силует, прибирає 27.5% геометрії та робить yaw логічним. Центральний pivot
працює правильно, основа не рухається, а постріл і мотузка успадковують
обертання без спеціальних компенсацій. Clean LOD підходить для звичайної
ігрової камери; clean original варто залишити для close-up/UI.

### If Proceeding

- Написати production controller з нуля в `TestMain.tscn`; prototype script
  не підключати до production.
- Отримувати yaw із реальної позиції цілі та обмежувати швидкість обертання,
  наприклад 90–140°/s залежно від балансу башти.
- Дозволяти постріл лише після aim tolerance, наприклад `≤2°`.
- Скасовувати або перенаводити projectile, якщо ціль померла чи зникла.
- Підключити impact, damage telemetry, target death/cleanup, recoil, VFX і звук.
- Для багатьох мотузок замінити 24 окремі MeshInstance3D на один procedural
  mesh або batched implementation.
- Перевірити 360° yaw на реальній базі з сусідніми будівлями, щоб гарпун або
  балони не проходили крізь оточення.

### Lessons Learned

- Нижній linkage був не лише візуально зайвим: він містив 4,750 трикутників,
  включно з дуже щільною декоративною котушкою.
- Найстабільніша схема — статична base group плюс один `TurretYawPivot`, під
  яким уже знаходяться projectile та attachment points.
- Projectile треба рухати в local space yaw-pivot. Global-space рух ламав би
  напрям пострілу після повороту.
- Перевірка `static_base_drift == 0`, monotonic yaw і rope endpoint error
  доповнює скріншоти та ловить помилки hierarchy, які важко побачити оком.
