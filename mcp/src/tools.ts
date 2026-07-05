import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { BridgeClient } from "./bridgeClient.js";
import { generateWidgetCpp } from "./cppGenerator.js";
import { writeWidgetCpp } from "./cppWriter.js";
import { buildProjectCpp } from "./projectBuilder.js";
import { closeEditor, openEditor, rebuildCppWithEditorRestart } from "./ueLifecycle.js";
import { validateWidgetLayoutQuality } from "./layoutQuality.js";
import {
  bridgeCommandNames,
  isToolName,
  parseToolInput,
  type BuildCppInput,
  type CloseEditorInput,
  type GenerateWidgetCppInput,
  type OpenEditorInput,
  type RebuildCppWithEditorRestartInput,
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
        : name === "ue.ui.generate_widget_cpp"
          ? generateWidgetCpp(input as GenerateWidgetCppInput)
          : name === "ue.ui.validate_widget_layout"
            ? validateWidgetLayoutQuality(input as ValidateWidgetLayoutInput)
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
