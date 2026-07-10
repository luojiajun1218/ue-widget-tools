# Project UI Context

Use this before designing or redesigning UI in any project. The point is to infer the project's existing UI language before inventing a new screen. A design that does not cite project UI evidence is not ready for DSL.

## Universal Search Order

1. Look for written UI guidance first:
   - Search docs, design notes, local specs, README files, source comments, and tool handoff files.
   - Search filenames containing `ui`, `widget`, `hud`, `menu`, `style`, `design`, `theme`, `brand`, `guide`, `spec`, `visual`, `interface`.
   - Search text for `UI`, `UMG`, `Widget`, `HUD`, `Menu`, `Style`, `Design`, `Theme`, `Palette`, `Typography`, `visual`, `interface`, `style guide`.
2. If written guidance exists, summarize it into a compact design-language brief before drafting UI.
3. If no written guidance exists, sample existing UI implementation and assets:
   - existing Widget Blueprints or UI prefabs/screens
   - reusable UI components and control widgets
   - UI art folders, icon folders, material folders, font folders
   - menus, HUDs, inventory/shop/character/settings screens
   - screenshots, PSD/export slices, render targets, UI texture atlases, style materials
4. Prefer references related to the target screen's domain. For a settings screen, inspect settings/menu/system screens first, then shared controls, then adjacent full-screen UI.
5. Use bridge/widget inspection when available:
   - inspect the target widget
   - inspect 2-4 visually related widgets
   - preserve useful naming, hierarchy, component patterns, and reusable controls
6. For binary assets that cannot be inspected visually or textually, use filenames, folder grouping, dimensions if available, and asset roles as weak evidence. Do not invent exact colors, layout, or imagery from binary names alone.

## Evidence Note

Before DSL, write a concise note:

- `project_sources`: UI docs, widget assets, component assets, art folders, screenshots, or source files inspected.
- `style_guide_status`: found written guide, inferred from assets, or insufficient evidence.
- `observed_language`: concrete observations such as layout archetypes, panel shapes, hover/selected states, icon language, typography, materials, spacing density, color roles, animation/material motifs, and naming conventions.
- `adopt`: what the new design borrows from the project.
- `avoid`: what would clash with the project or look generic.
- `unknowns`: what could not be verified because assets are binary, tooling cannot preview them, or screenshots are unavailable.

Do not proceed with visual design if `project_sources` is empty. If evidence is weak, say so and design conservatively from the strongest available project references.

## Design-Language Brief

Convert the evidence note into a design-language brief before drafting:

- `composition_rules`: how this project tends to structure screens.
- `surface_rules`: frame, card, panel, divider, background, and overlay treatment.
- `control_rules`: buttons, sliders, toggles, selects, tabs, focus, hover, and selected states.
- `type_rules`: title/body/caption scale and text density.
- `color_rules`: background, surface, accent, warning, disabled, and text roles.
- `asset_rules`: icons, materials, images, render targets, and reusable component assets to prefer.

The later visual direction must explicitly say how it follows this brief and where it intentionally diverges.

## Current Repository Hints

These paths are examples for this repository only. Do not copy this section into other projects as the generic rule.

- `Content/MistyPlanet/UI/`
- `Content/MistyPlanet/UI/PendantUI/`
- `Content/MistyPlanet/UI/CHARACTER/`
- `Content/MistyPlanet/UI/CRAFTING/`
- `Content/MistyPlanet/UI/MapUI/`
- `Content/MistyPlanet/UI/Store/`
- `Content/Gameplay/GeneralUIPack/Widgets/`
- `Content/Gameplay/GeneralUIPack/Widgets/Component/`
- `Content/Gameplay/GeneralUIPack/Arts/`
