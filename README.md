# UE Widget Tools

Codex-oriented tools for designing, reviewing, applying, and wiring Unreal Engine UMG Widget Blueprints.

This repository packages three pieces that work together:

- `mcp/` - a TypeScript MCP server with widget DSL compilation, HTML review, layout quality checks, C++ helper generation, event binding commands, and UE editor lifecycle helpers.
- `unreal-plugin/WidgetBridge/` - an Unreal Engine editor plugin that receives local bridge commands and mutates Widget Blueprints through guarded editor-side services.
- `skills/ue-widget-developer/` - a Codex skill that defines the workflow for project-aware UI design, Widget DSL review, bridge mutation, finalization, and visual verification.

## Why This Exists

UMG iteration can be slow when every layout change is made manually in the editor. These tools use a design-to-widget pipeline: design a working web screen first, get it approved, map each element to native UMG, then apply layout and behavior through a local Unreal bridge.

The workflow is intentionally conservative:

- inspect existing widgets and infer the project's UI language before designing
- build and approve a working `frontend-design` web screen before touching Unreal assets
- capture the approved web default state, then create an explicit web-to-UMG mapping contract
- map with native UMG controls only; screenshots and full-screen `Image` layers are comparison references, never production UI
- align UMG layout and default state to the web baseline before binding behavior
- keep fullscreen widgets fill-parent by default instead of targeting a fixed resolution
- validate layout quality and review quality before writes
- finalize and inspect Widget Blueprints after mutation, then compare deterministic UMG captures against the web baseline

## Current Capabilities

- Compile a small Widget DSL into UMG layout payloads.
- Generate browser review HTML from the same DSL.
- Capture deterministic UMG previews and compare them with a local web reference, producing overlay and heatmap artifacts for review.
- Support fullscreen/fill-parent review semantics when root `Canvas` has no fixed viewport.
- Validate settings/menu layouts for paging, scrollability, styled containers, action rows, and responsive Canvas anchors.
- Apply stateful native Slate styling for buttons, sliders, checkboxes, and combo boxes, including solid-color brushes and slider bar/handle colors.
- Generate C++ `UUserWidget` helper classes with `BindWidget` fields and Blueprint-callable handlers.
- Create/reparent Widget Blueprints, apply layouts, bind buttons/sliders/checkboxes/comboboxes, finalize, and inspect through the UE bridge.
- Inspect Blueprint metadata for read-only context.
- Close UE, build C++, and reopen UE for generated-code workflows.

## Required Design-to-Widget Workflow

For new or redesigned UI, follow this sequence:

1. Inspect project UI context and write a visual direction.
2. Use `frontend-design` to create a working web screen at the target viewport.
3. Obtain explicit approval and save the web default-state baseline.
4. Write the web-to-UMG mapping contract for visible elements and interactive controls.
5. Apply a native UMG layout and compare it to the web baseline.
6. Only after visual alignment, generate UI-only C++ and bind control behavior.
7. Finalize, inspect WidgetTree/EventGraph, capture again, compare, and perform a separate read-only visual review.

Every visible control must be a real UMG widget, and every interactive control needs a handler path. A static-image implementation is not an acceptable UI solution.

## Project-Aware UI Design

The skill does not ask the agent to invent UI style from scratch. Before non-trivial UI work, it now requires:

1. Search for project UI/design/style guidance.
2. If no written guide exists, sample existing UI screens, reusable components, icons, fonts, materials, and art exports.
3. Write an evidence note and design-language brief.
4. Explain how the proposed UI fits that project language.
5. Reject stale templates and repeated layouts before drafting Widget DSL.

See:

- `skills/ue-widget-developer/references/project-ui-context.md`
- `skills/ue-widget-developer/references/visual-design-rubric.md`

## Repository Layout

```text
fixtures/                         Small example payloads and DSL snippets
mcp/                              TypeScript MCP server
skills/ue-widget-developer/       Codex skill and references
unreal-plugin/WidgetBridge/       Unreal editor plugin source
```

## MCP Development

```powershell
cd mcp
npm install
npm test
npm run build
npm audit
```

## Unreal Plugin Install

Copy `unreal-plugin/WidgetBridge` into a UE project `Plugins/` directory, then build the editor target.

The plugin starts a local HTTP bridge on:

```text
http://127.0.0.1:17857
```

## Codex Skill Install

Copy `skills/ue-widget-developer` into your Codex skills directory, then start a new Codex session so the skill list refreshes.

## Project Defaults To Review

This code was developed against a UE 5.7 project and still includes defaults that should be reviewed before reuse:

- UI asset path prefixes and write allowlists
- C++ target name and `.uproject` discovery
- generated code folder paths
- default module API macro
- local bridge port

Start with:

- `mcp/src/schemas.ts`
- `mcp/src/projectBuilder.ts`
- `mcp/src/ueLifecycle.ts`
- `mcp/src/cppWriter.ts`
- `unreal-plugin/WidgetBridge/Source/WidgetBridge/Private/`
- `skills/ue-widget-developer/`

## Safety

The bridge is local-only and intentionally scoped. Review path allowlists before using it in another project. Do not expose the bridge port beyond your local machine.

Generated artifacts such as `node_modules`, Unreal `Binaries`, `Intermediate`, `Saved`, logs, private specs, and local prototypes should not be committed.
