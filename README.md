# UE Widget Tools

Codex-oriented tools for designing, reviewing, applying, and wiring Unreal Engine UMG Widget Blueprints.

This repository packages three pieces that work together:

- `mcp/` - a TypeScript MCP server with widget DSL compilation, HTML review, layout quality checks, C++ helper generation, event binding commands, and UE editor lifecycle helpers.
- `unreal-plugin/WidgetBridge/` - an Unreal Engine editor plugin that receives local bridge commands and mutates Widget Blueprints through guarded editor-side services.
- `skills/ue-widget-developer/` - a Codex skill that defines the workflow for project-aware UI design, Widget DSL review, bridge mutation, finalization, and visual verification.

## Why This Exists

UMG iteration can be slow when every layout change is made manually in the editor. These tools let an agent draft a declarative widget, render a browser review, run quality gates, then apply the layout and bindings through a local Unreal bridge.

The workflow is intentionally conservative:

- inspect existing widgets before edits
- infer the project's UI language before designing new screens
- review Widget DSL as HTML before touching Unreal assets
- keep fullscreen widgets fill-parent by default instead of targeting a fixed resolution
- validate layout quality and review quality before writes
- finalize and inspect Widget Blueprints after mutation

## Current Capabilities

- Compile a small Widget DSL into UMG layout payloads.
- Generate browser review HTML from the same DSL.
- Support fullscreen/fill-parent review semantics when root `Canvas` has no fixed viewport.
- Validate settings/menu layouts for paging, scrollability, styled containers, action rows, and responsive Canvas anchors.
- Generate C++ `UUserWidget` helper classes with `BindWidget` fields and Blueprint-callable handlers.
- Create/reparent Widget Blueprints, apply layouts, bind buttons/sliders/checkboxes/comboboxes, finalize, and inspect through the UE bridge.
- Inspect Blueprint metadata for read-only context.
- Close UE, build C++, and reopen UE for generated-code workflows.

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
