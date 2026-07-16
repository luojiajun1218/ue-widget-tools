import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { BridgeClient } from "./bridgeClient.js";
import { generateWidgetCpp } from "./cppGenerator.js";
import { writeWidgetCpp } from "./cppWriter.js";
import { compileWidgetDesign, type CompileWidgetDesignInput as DesignCompilerInput } from "./designCompiler.js";
import { compileWidgetDsl } from "./widgetDsl.js";
import { renderWidgetPreview } from "./widgetPreview.js";
import { buildProjectCpp } from "./projectBuilder.js";
import { closeEditor, openEditor, rebuildCppWithEditorRestart } from "./ueLifecycle.js";
import { validateWidgetLayoutQuality } from "./layoutQuality.js";
import { validateWidgetReview } from "./widgetReviewQuality.js";
import { settingsCalibrationStyleContract } from "./settingsCalibrationContract.js";
import {
  bridgeCommandNames,
  isToolName,
  parseToolInput,
  type BuildCppInput,
  type ApplyWidgetDslInput,
  type CloseEditorInput,
  type CompileWidgetDslInput,
  type GenerateWidgetCppInput,
  type OpenEditorInput,
  type RebuildCppWithEditorRestartInput,
  type ReviewWidgetDslInput,
  type ValidateWidgetLayoutInput,
  type WriteWidgetCppInput,
  type ToolName
} from "./schemas.js";

type JsonSchema = Tool["inputSchema"];

interface BridgeLike {
  getStatus(): Promise<unknown>;
  sendCommand(request: {
    command: string;
    transactionId?: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

const emptyObjectSchema: JsonSchema = {
  type: "object",
  properties: {},
  required: []
};

const assetPathProperty = {
  type: "string",
  description: "Widget Blueprint asset path under /Game/MistyPlanet/UI/."
};

const transactionIdProperty = {
  type: "string",
  description: "Optional caller-supplied transaction id for bridge diagnostics."
};

const cppIdentifierProperty = {
  type: "string",
  pattern: "^[A-Za-z_][A-Za-z0-9_]*$"
};

function objectSchema(
  properties: NonNullable<JsonSchema["properties"]>,
  required: string[]
): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

export const mcpTools: Tool[] = [
  {
    name: "ue.project.status",
    description: "Check whether the local WidgetBridge is reachable.",
    inputSchema: emptyObjectSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.inspect_widget_tree",
    description: "Inspect a Widget Blueprint tree under /Game/MistyPlanet/UI/.",
    inputSchema: objectSchema(
      { assetPath: assetPathProperty, transactionId: transactionIdProperty },
      ["assetPath"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.create_widget_blueprint",
    description: "Create a Widget Blueprint under /Game/MistyPlanet/UI/.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        parentClass: { type: "string" },
        transactionId: transactionIdProperty
      },
      ["assetPath"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.set_widget_parent_class",
    description: "Set a Widget Blueprint parent class to a compiled UUserWidget subclass.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        parentClass: { type: "string" },
        transactionId: transactionIdProperty
      },
      ["assetPath", "parentClass"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.apply_widget_layout",
    description: "Apply a layout payload to a Widget Blueprint under /Game/MistyPlanet/UI/.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        layout: { type: "object", additionalProperties: true },
        transactionId: transactionIdProperty
      },
      ["assetPath", "layout"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.validate_widget_layout",
    description:
      "Validate a Widget layout spec for production UI quality before writing it to Unreal.",
    inputSchema: objectSchema(
      {
        layout: { type: "object", additionalProperties: true },
        profile: { type: "string", enum: ["settings", "hud", "menu", "generic"] },
        viewport: {
          type: "object",
          properties: {
            width: { type: "number" },
            height: { type: "number" }
          },
          additionalProperties: false
        }
      },
      ["layout"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.compile_widget_design",
    description:
      "Compile structured Widget Design IR into UMG layout spec, HTML preview, and loss report without modifying Unreal assets.",
    inputSchema: objectSchema(
      {
        design: { type: "object", additionalProperties: true }
      },
      ["design"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.compile_widget_dsl",
    description:
      "Compile UMG-like Widget TSX/DSL source into Widget Design IR, UMG layout spec, HTML preview, and diagnostics without modifying Unreal assets.",
    inputSchema: objectSchema(
      {
        source: {
          type: "string",
          description: "UMG-like Widget DSL source, using components such as Canvas, Border, Tabs, Tab, SettingRow, Slider, Toggle, and Select."
        }
      },
      ["source"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.review_widget_dsl",
    description:
      "Compile UMG-like Widget TSX/DSL source and return design IR, UMG layout, web review HTML, diagnostics, loss report, and layout quality without modifying Unreal assets.",
    inputSchema: objectSchema(
      {
        source: {
          type: "string",
          description: "UMG-like Widget DSL source to review."
        },
        profile: {
          type: "string",
          enum: ["settings", "hud", "menu", "generic"],
          description: "Layout quality profile to validate against."
        }
      },
      ["source"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.apply_widget_dsl",
    description:
      "Compile, review, apply, bind events, and finalize a Widget Blueprint from UMG-like Widget TSX/DSL source.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        source: {
          type: "string",
          description: "UMG-like Widget DSL source to compile and apply."
        },
        profile: {
          type: "string",
          enum: ["settings", "hud", "menu", "generic"],
          description: "Layout quality profile to validate against."
        },
        compile: { type: "boolean", description: "Compile the Widget Blueprint before saving." },
        save: { type: "boolean", description: "Save the Widget Blueprint package." },
        inspect: { type: "boolean", description: "Return the WidgetTree after finalizing." },
        transactionId: transactionIdProperty,
        bindings: {
          type: "object",
          properties: {
            buttons: {
              type: "array",
              items: {
                type: "object",
                properties: { widget: { type: "string" }, function: { type: "string" } },
                required: ["widget", "function"],
                additionalProperties: false
              }
            },
            sliders: {
              type: "array",
              items: {
                type: "object",
                properties: { widget: { type: "string" }, function: { type: "string" } },
                required: ["widget", "function"],
                additionalProperties: false
              }
            },
            checkboxes: {
              type: "array",
              items: {
                type: "object",
                properties: { widget: { type: "string" }, function: { type: "string" } },
                required: ["widget", "function"],
                additionalProperties: false
              }
            },
            comboboxes: {
              type: "array",
              items: {
                type: "object",
                properties: { widget: { type: "string" }, function: { type: "string" } },
                required: ["widget", "function"],
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      },
      ["assetPath", "source"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.bind_button_clicked_to_function",
    description: "Bind a UButton OnClicked event to a widget function.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        buttonName: { type: "string" },
        functionName: { type: "string" },
        transactionId: transactionIdProperty
      },
      ["assetPath", "buttonName", "functionName"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.bind_slider_value_changed_to_function",
    description: "Bind a USlider OnValueChanged event to a widget function accepting a float.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        sliderName: { type: "string" },
        functionName: { type: "string" },
        transactionId: transactionIdProperty
      },
      ["assetPath", "sliderName", "functionName"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.bind_checkbox_changed_to_function",
    description: "Bind a UCheckBox changed event to a widget function accepting bool or ECheckBoxState.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        checkboxName: { type: "string" },
        functionName: { type: "string" },
        transactionId: transactionIdProperty
      },
      ["assetPath", "checkboxName", "functionName"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.bind_combobox_selection_changed_to_function",
    description: "Bind a UComboBoxString selection changed event to a widget function accepting FString payloads.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        comboboxName: { type: "string" },
        functionName: { type: "string" },
        transactionId: transactionIdProperty
      },
      ["assetPath", "comboboxName", "functionName"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.compile_widget",
    description: "Compile a Widget Blueprint under /Game/MistyPlanet/UI/.",
    inputSchema: objectSchema(
      { assetPath: assetPathProperty, transactionId: transactionIdProperty },
      ["assetPath"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.finalize_widget",
    description: "Compile, save, and optionally inspect a Widget Blueprint after UI edits.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        compile: { type: "boolean", description: "Compile the Widget Blueprint before saving." },
        save: { type: "boolean", description: "Save the Widget Blueprint package." },
        inspect: { type: "boolean", description: "Return the WidgetTree after finalizing." },
        transactionId: transactionIdProperty
      },
      ["assetPath"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.get_style_contract",
    description:
      "Return the native UMG style/fidelity contract for the approved Misty calibration settings screen without modifying assets.",
    inputSchema: objectSchema(
      {
        id: { type: "string", enum: ["misty-calibration"], description: "Named visual contract." }
      },
      []
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.capture_widget_preview",
    description:
      "Render a UI Widget Blueprint into a deterministic 1920x1080 PNG under Saved/WidgetBridge/Previews without modifying the asset.",
    inputSchema: objectSchema(
      {
        assetPath: assetPathProperty,
        captureId: {
          type: "string",
          pattern: "^[A-Za-z0-9_-]{1,96}$",
          description: "Safe output filename stem; the PNG is written beneath Saved/WidgetBridge/Previews."
        },
        transactionId: transactionIdProperty
      },
      ["assetPath", "captureId"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.compare_ui_images",
    description:
      "Compare a project-local reference PNG with a captured Saved/WidgetBridge/Previews PNG and write a difference heatmap under Saved/WidgetBridge/Previews.",
    inputSchema: objectSchema(
      {
        referencePath: { type: "string", description: "Reference PNG inside the current project directory." },
        candidatePath: { type: "string", description: "Captured PNG inside Saved/WidgetBridge/Previews." },
        comparisonId: {
          type: "string",
          pattern: "^[A-Za-z0-9_-]{1,96}$",
          description: "Safe heatmap filename stem."
        },
        pixelThreshold: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Per-channel difference threshold; defaults to 12."
        },
        transactionId: transactionIdProperty
      },
      ["referencePath", "candidatePath", "comparisonId"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.import_ui_png",
    description:
      "Import a project-local PNG into /Game/MistyPlanet/UI/ as a Texture2D for an approved UMG visual reference or brush.",
    inputSchema: objectSchema(
      {
        assetPath: {
          type: "string",
          description: "Texture asset path under /Game/MistyPlanet/UI/."
        },
        sourceFilePath: {
          type: "string",
          description: "PNG inside .codex-local, .superpowers, or Content/MistyPlanet/UI/SourceArt."
        },
        replaceExisting: { type: "boolean", description: "Replace an existing UI texture at the destination." },
        transactionId: transactionIdProperty
      },
      ["assetPath", "sourceFilePath"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.ui.generate_widget_cpp",
    description: "Generate pure UUserWidget subclass C++ header and source text without writing files.",
    inputSchema: objectSchema(
      {
        className: cppIdentifierProperty,
        apiMacro: cppIdentifierProperty,
        category: { type: "string", minLength: 1 },
        functions: {
          type: "array",
          items: {
            type: "object",
            properties: { name: cppIdentifierProperty },
            required: ["name"],
            additionalProperties: false
          }
        },
        bindings: {
          type: "array",
          items: {
            type: "object",
            properties: { type: cppIdentifierProperty, name: cppIdentifierProperty },
            required: ["type", "name"],
            additionalProperties: false
          }
        }
      },
      ["className", "category"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "ue.ui.write_widget_cpp",
    description:
      "Generate and write UUserWidget subclass C++ files under Source/MistyPlanet/Public/UI/Generated and Private/UI/Generated.",
    inputSchema: objectSchema(
      {
        className: cppIdentifierProperty,
        apiMacro: cppIdentifierProperty,
        category: { type: "string", minLength: 1 },
        functions: {
          type: "array",
          items: {
            type: "object",
            properties: { name: cppIdentifierProperty },
            required: ["name"],
            additionalProperties: false
          }
        },
        bindings: {
          type: "array",
          items: {
            type: "object",
            properties: { type: cppIdentifierProperty, name: cppIdentifierProperty },
            required: ["type", "name"],
            additionalProperties: false
          }
        },
        headerPath: { type: "string" },
        cppPath: { type: "string" }
      },
      ["className", "category"]
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.project.build_cpp",
    description: "Run Unreal Build Tool for MistyPlanetEditor C++ from the MCP process.",
    inputSchema: objectSchema(
      {
        projectRoot: { type: "string" },
        engineRoot: { type: "string" },
        target: { type: "string" },
        platform: { type: "string" },
        configuration: { type: "string" },
        waitMutex: { type: "boolean" },
        noHotReload: { type: "boolean" }
      },
      []
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.project.close_editor",
    description: "Close running UnrealEditor.exe processes so editor DLLs can be rebuilt.",
    inputSchema: objectSchema(
      {
        force: { type: "boolean", description: "Force-close UnrealEditor.exe." },
        timeoutMs: { type: "number", description: "Maximum milliseconds to wait for taskkill." }
      },
      []
    ),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  },
  {
    name: "ue.project.open_editor",
    description: "Open MistyPlanet.uproject in UnrealEditor.exe.",
    inputSchema: objectSchema(
      {
        projectRoot: { type: "string" },
        engineRoot: { type: "string" },
        extraArgs: { type: "array", items: { type: "string" } }
      },
      []
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: "ue.project.rebuild_cpp_with_editor_restart",
    description: "Close UE, run MistyPlanetEditor C++ build, then reopen UE.",
    inputSchema: objectSchema(
      {
        projectRoot: { type: "string" },
        engineRoot: { type: "string" },
        target: { type: "string" },
        platform: { type: "string" },
        configuration: { type: "string" },
        waitMutex: { type: "boolean" },
        noHotReload: { type: "boolean" },
        closeEditor: { type: "boolean" },
        openEditor: { type: "boolean" },
        forceClose: { type: "boolean" },
        reopenOnFailure: { type: "boolean" }
      },
      []
    ),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  },
  {
    name: "ue.blueprint.inspect",
    description:
      "Read summary information from a Blueprint asset under /Game/, including parent class, functions, variables, components, and graphs.",
    inputSchema: objectSchema(
      {
        assetPath: {
          type: "string",
          description: "Blueprint asset path under /Game/."
        },
        includeGraphSummary: { type: "boolean" },
        includeClassDefaults: { type: "boolean" },
        transactionId: transactionIdProperty
      },
      ["assetPath"]
    ),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }
];

export async function dispatchTool(
  name: string,
  args: unknown,
  client: BridgeLike = new BridgeClient()
): Promise<CallToolResult> {
  if (!isToolName(name)) {
    return errorResult(`Unknown tool: ${name}`);
  }

  try {
    const input = parseToolInput(name, args);
    const result =
      name === "ue.project.status"
        ? await client.getStatus()
        : name === "ue.ui.get_style_contract"
          ? settingsCalibrationStyleContract
        : name === "ue.ui.generate_widget_cpp"
          ? generateWidgetCpp(input as GenerateWidgetCppInput)
          : name === "ue.ui.validate_widget_layout"
            ? validateWidgetLayoutQuality(input as ValidateWidgetLayoutInput)
            : name === "ue.ui.compile_widget_design"
              ? compileWidgetDesign(input as unknown as DesignCompilerInput)
            : name === "ue.ui.compile_widget_dsl"
              ? compileWidgetDslAndDesign(input as CompileWidgetDslInput)
            : name === "ue.ui.review_widget_dsl"
              ? reviewWidgetDsl(input as ReviewWidgetDslInput)
              : name === "ue.ui.apply_widget_dsl"
                ? await applyWidgetDsl(input as ApplyWidgetDslInput, client)
          : name === "ue.ui.write_widget_cpp"
            ? writeWidgetCpp(input as WriteWidgetCppInput)
          : name === "ue.project.build_cpp"
            ? await buildProjectCpp(input as BuildCppInput)
            : name === "ue.project.close_editor"
              ? await closeEditor(input as CloseEditorInput)
              : name === "ue.project.open_editor"
                ? await openEditor(input as OpenEditorInput)
                : name === "ue.project.rebuild_cpp_with_editor_restart"
                  ? await rebuildCppWithEditorRestart(input as RebuildCppWithEditorRestartInput)
        : await dispatchBridgeCommand(name, input, client);

    return textResult(result);
  } catch (error) {
    return errorResult(formatError(error));
  }
}

function compileWidgetDslAndDesign(input: CompileWidgetDslInput): unknown {
  const dslResult = compileWidgetDsl(input);
  const compiled = compileWidgetDesign({ design: dslResult.design });

  return {
    design: dslResult.design,
    layout: compiled.layout,
    html: renderWidgetPreview({ design: dslResult.design }),
    diagnostics: dslResult.diagnostics,
    lossReport: compiled.lossReport
  };
}

function reviewWidgetDsl(input: ReviewWidgetDslInput): unknown {
  const compiled = compileWidgetDslAndDesign(input) as {
    design: ReturnType<typeof compileWidgetDsl>["design"];
    layout: ReturnType<typeof compileWidgetDesign>["layout"];
    html: string;
    diagnostics: ReturnType<typeof compileWidgetDsl>["diagnostics"];
    lossReport: ReturnType<typeof compileWidgetDesign>["lossReport"];
  };

  return {
    ...compiled,
    quality: validateWidgetLayoutQuality({
      layout: compiled.layout,
      profile: input.profile ?? "generic",
      viewport: compiled.design.viewport
    }),
    reviewQuality: validateWidgetReview({
      html: compiled.html,
      viewport: compiled.design.viewport
    })
  };
}

async function applyWidgetDsl(input: ApplyWidgetDslInput, client: BridgeLike): Promise<unknown> {
  const reviewed = reviewWidgetDsl(input) as {
    design: ReturnType<typeof compileWidgetDsl>["design"];
    layout: ReturnType<typeof compileWidgetDesign>["layout"];
    html: string;
    diagnostics: ReturnType<typeof compileWidgetDsl>["diagnostics"];
    lossReport: ReturnType<typeof compileWidgetDesign>["lossReport"];
    quality: ReturnType<typeof validateWidgetLayoutQuality>;
    reviewQuality: ReturnType<typeof validateWidgetReview>;
  };
  const qualityErrors = reviewed.quality.issues.filter((issue) => issue.severity === "error");
  const reviewErrors = reviewed.reviewQuality.issues.filter((issue) => issue.severity === "error");

  if (reviewed.diagnostics.length > 0 || reviewed.lossReport.length > 0 || qualityErrors.length > 0 || reviewErrors.length > 0) {
    return {
      blocked: true,
      ...reviewed,
      qualityErrors,
      reviewErrors
    };
  }

  const transactionId = input.transactionId;
  const applyLayout = await client.sendCommand({
    command: "applyWidgetLayout",
    transactionId,
    payload: {
      assetPath: input.assetPath,
      layout: reviewed.layout
    }
  });
  const bindingResults = [];

  for (const binding of input.bindings.buttons) {
    bindingResults.push(await sendBindingCommand(client, transactionId, "bindButtonClickedToFunction", input.assetPath, "buttonName", binding));
  }
  for (const binding of input.bindings.sliders) {
    bindingResults.push(await sendBindingCommand(client, transactionId, "bindSliderValueChangedToFunction", input.assetPath, "sliderName", binding));
  }
  for (const binding of input.bindings.checkboxes) {
    bindingResults.push(await sendBindingCommand(client, transactionId, "bindCheckBoxChangedToFunction", input.assetPath, "checkboxName", binding));
  }
  for (const binding of input.bindings.comboboxes) {
    bindingResults.push(await sendBindingCommand(client, transactionId, "bindComboBoxSelectionChangedToFunction", input.assetPath, "comboboxName", binding));
  }

  const finalize = await client.sendCommand({
    command: "finalizeWidget",
    transactionId,
    payload: {
      assetPath: input.assetPath,
      compile: input.compile,
      save: input.save,
      inspect: input.inspect
    }
  });

  return {
    blocked: false,
    ...reviewed,
    bridge: {
      applyLayout,
      bindings: bindingResults,
      finalize
    }
  };
}

function sendBindingCommand(
  client: BridgeLike,
  transactionId: string | undefined,
  command: string,
  assetPath: string,
  widgetKey: "buttonName" | "sliderName" | "checkboxName" | "comboboxName",
  binding: { widget: string; function: string }
): Promise<unknown> {
  return client.sendCommand({
    command,
    transactionId,
    payload: {
      assetPath,
      [widgetKey]: binding.widget,
      functionName: binding.function
    }
  });
}

async function dispatchBridgeCommand(
  name: keyof typeof bridgeCommandNames,
  input: Record<string, unknown>,
  client: BridgeLike
): Promise<unknown> {
  const { transactionId, ...payload } = input;

  return client.sendCommand({
    command: bridgeCommandNames[name],
    transactionId: typeof transactionId === "string" ? transactionId : undefined,
    payload
  });
}

function textResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  }

  return error instanceof Error ? error.message : String(error);
}
