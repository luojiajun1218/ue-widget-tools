# UE Widget Tools

Local automation tools for creating, inspecting, validating, and wiring Unreal Engine UMG Widget Blueprints from Codex-compatible MCP tooling.

This repository contains:

- `mcp/` - TypeScript MCP server exposing UE widget tools.
- `unreal-plugin/WidgetBridge/` - UE 5.7 editor plugin that receives bridge commands and edits Widget Blueprints.
- `skills/ue-widget-developer/` - Codex skill instructions for using the bridge safely.
- `fixtures/` - sample layout payloads used by tests and examples.

## What It Does

- Create and inspect Widget Blueprints.
- Apply declarative UMG layout specs.
- Validate layout quality before writing assets.
- Generate UI C++ helper classes.
- Bind common UI events to Blueprint-callable functions.
- Close UE, build C++, and reopen UE from MCP tools.
- Read Blueprint metadata for context.

## Project Defaults

The current code is extracted from a UE 5.7 project and still contains project-specific defaults such as:

- UI asset prefix: `/Game/MistyPlanet/UI/`
- C++ target: `MistyPlanetEditor`
- `.uproject` name: `MistyPlanet.uproject`
- generated code folders under `Source/MistyPlanet/...`
- default API macro: `MISTYPLANET_API`

Before using this with another project, update those defaults in:

- `mcp/src/schemas.ts`
- `mcp/src/projectBuilder.ts`
- `mcp/src/ueLifecycle.ts`
- `mcp/src/cppWriter.ts`
- `unreal-plugin/WidgetBridge/Source/WidgetBridge/Private/*`
- `skills/ue-widget-developer/`

## MCP Development

```powershell
cd mcp
npm install
npm test
npm run build
```

## Unreal Plugin Install

Copy `unreal-plugin/WidgetBridge` into your UE project `Plugins/` directory, then build the editor target.

The plugin starts a local HTTP bridge on `http://127.0.0.1:17857`.

## Safety

This tool intentionally keeps write tools scoped to UI assets. Review and adjust the allowed asset path prefixes before using it in another project.
