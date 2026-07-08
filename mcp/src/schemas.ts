import { z } from "zod";

export const UI_ASSET_PATH_PREFIX = "/Game/MistyPlanet/UI/";
export const GAME_ASSET_PATH_PREFIX = "/Game/";

export const uiAssetPathSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith(UI_ASSET_PATH_PREFIX), {
    message: `UI asset paths must start with ${UI_ASSET_PATH_PREFIX}`
  });

export const gameAssetPathSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith(GAME_ASSET_PATH_PREFIX) && !value.includes(".."), {
    message: `Blueprint asset paths must start with ${GAME_ASSET_PATH_PREFIX} and must not contain '..'`
  });

const transactionIdSchema = z.string().min(1).optional();
const cppIdentifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
  message: "Expected a valid C++ identifier"
});

export const projectStatusSchema = z.object({}).strict();

export const inspectWidgetTreeSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    transactionId: transactionIdSchema
  })
  .strict();

export const createWidgetBlueprintSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    parentClass: z.string().min(1).optional(),
    transactionId: transactionIdSchema
  })
  .strict();

export const setWidgetParentClassSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    parentClass: z.string().min(1),
    transactionId: transactionIdSchema
  })
  .strict();

export const applyWidgetLayoutSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    layout: z.record(z.unknown()),
    transactionId: transactionIdSchema
  })
  .strict();

export const validateWidgetLayoutSchema = z
  .object({
    layout: z.record(z.unknown()),
    profile: z.enum(["settings", "hud", "menu", "generic"]).default("generic"),
    viewport: z
      .object({
        width: z.number().positive(),
        height: z.number().positive()
      })
      .default({ width: 1280, height: 720 })
  })
  .strict();

export const compileWidgetDesignSchema = z
  .object({
    design: z
      .object({
        name: z.string().min(1),
        viewport: z
          .object({
            width: z.number().positive(),
            height: z.number().positive()
          })
          .optional(),
        theme: z
          .object({
            colors: z.record(z.string()).optional(),
            spacing: z.number().positive().optional()
          })
          .passthrough()
          .optional(),
        root: z.record(z.unknown())
      })
      .passthrough()
  })
  .strict();

export const compileWidgetDslSchema = z
  .object({
    source: z.string().min(1)
  })
  .strict();

export const reviewWidgetDslSchema = z
  .object({
    source: z.string().min(1),
    profile: z.enum(["settings", "hud", "menu", "generic"]).default("generic")
  })
  .strict();

const widgetDslBindingSchema = z
  .object({
    widget: z.string().min(1),
    function: z.string().min(1)
  })
  .strict();

export const applyWidgetDslSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    source: z.string().min(1),
    profile: z.enum(["settings", "hud", "menu", "generic"]).default("generic"),
    compile: z.boolean().default(true),
    save: z.boolean().default(true),
    inspect: z.boolean().default(true),
    transactionId: transactionIdSchema,
    bindings: z
      .object({
        buttons: z.array(widgetDslBindingSchema).default([]),
        sliders: z.array(widgetDslBindingSchema).default([]),
        checkboxes: z.array(widgetDslBindingSchema).default([]),
        comboboxes: z.array(widgetDslBindingSchema).default([])
      })
      .strict()
      .default({})
  })
  .strict();

export const bindButtonClickedToFunctionSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    buttonName: z.string().min(1),
    functionName: z.string().min(1),
    transactionId: transactionIdSchema
  })
  .strict();

export const bindSliderValueChangedToFunctionSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    sliderName: z.string().min(1),
    functionName: z.string().min(1),
    transactionId: transactionIdSchema
  })
  .strict();

export const bindCheckboxChangedToFunctionSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    checkboxName: z.string().min(1),
    functionName: z.string().min(1),
    transactionId: transactionIdSchema
  })
  .strict();

export const bindComboboxSelectionChangedToFunctionSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    comboboxName: z.string().min(1),
    functionName: z.string().min(1),
    transactionId: transactionIdSchema
  })
  .strict();

export const compileWidgetSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    transactionId: transactionIdSchema
  })
  .strict();

export const finalizeWidgetSchema = z
  .object({
    assetPath: uiAssetPathSchema,
    compile: z.boolean().default(true),
    save: z.boolean().default(true),
    inspect: z.boolean().default(true),
    transactionId: transactionIdSchema
  })
  .strict();

export const buildCppSchema = z
  .object({
    projectRoot: z.string().min(1).default("../.."),
    engineRoot: z.string().min(1).default("C:/Program Files/Epic Games/UE_5.7"),
    target: z.string().min(1).default("MistyPlanetEditor"),
    platform: z.string().min(1).default("Win64"),
    configuration: z.string().min(1).default("Development"),
    waitMutex: z.boolean().default(true),
    noHotReload: z.boolean().default(true)
  })
  .strict();

export const closeEditorSchema = z
  .object({
    force: z.boolean().default(true),
    timeoutMs: z.number().int().positive().default(30000)
  })
  .strict();

export const openEditorSchema = z
  .object({
    projectRoot: z.string().min(1).default("../.."),
    engineRoot: z.string().min(1).default("C:/Program Files/Epic Games/UE_5.7"),
    extraArgs: z.array(z.string()).default([])
  })
  .strict();

export const rebuildCppWithEditorRestartSchema = buildCppSchema
  .extend({
    closeEditor: z.boolean().default(true),
    openEditor: z.boolean().default(true),
    forceClose: z.boolean().default(true),
    reopenOnFailure: z.boolean().default(false)
  })
  .strict();

export const inspectBlueprintSchema = z
  .object({
    assetPath: gameAssetPathSchema,
    includeGraphSummary: z.boolean().default(true),
    includeClassDefaults: z.boolean().default(false),
    transactionId: transactionIdSchema
  })
  .strict();

export const cppWidgetFunctionSchema = z
  .object({
    name: cppIdentifierSchema
  })
  .strict();

export const cppWidgetBindingSchema = z
  .object({
    type: cppIdentifierSchema,
    name: cppIdentifierSchema
  })
  .strict();

export const generateWidgetCppSchema = z
  .object({
    className: cppIdentifierSchema,
    apiMacro: cppIdentifierSchema.default("MISTYPLANET_API"),
    category: z.string().min(1),
    functions: z.array(cppWidgetFunctionSchema).default([]),
    bindings: z.array(cppWidgetBindingSchema).default([])
  })
  .strict();

export const writeWidgetCppSchema = generateWidgetCppSchema
  .extend({
    headerPath: z.string().min(1).optional(),
    cppPath: z.string().min(1).optional()
  })
  .strict();

export type GenerateWidgetCppInput = z.input<typeof generateWidgetCppSchema>;
export type ParsedGenerateWidgetCppInput = z.output<typeof generateWidgetCppSchema>;
export type WriteWidgetCppInput = z.input<typeof writeWidgetCppSchema>;
export type ParsedWriteWidgetCppInput = z.output<typeof writeWidgetCppSchema>;
export type BuildCppInput = z.input<typeof buildCppSchema>;
export type CloseEditorInput = z.input<typeof closeEditorSchema>;
export type OpenEditorInput = z.input<typeof openEditorSchema>;
export type RebuildCppWithEditorRestartInput = z.input<typeof rebuildCppWithEditorRestartSchema>;
export type ValidateWidgetLayoutInput = z.input<typeof validateWidgetLayoutSchema>;
export type CompileWidgetDesignInput = z.input<typeof compileWidgetDesignSchema>;
export type CompileWidgetDslInput = z.input<typeof compileWidgetDslSchema>;
export type ReviewWidgetDslInput = z.input<typeof reviewWidgetDslSchema>;
export type ApplyWidgetDslInput = z.output<typeof applyWidgetDslSchema>;

export const toolInputSchemas = {
  "ue.project.status": projectStatusSchema,
  "ue.ui.inspect_widget_tree": inspectWidgetTreeSchema,
  "ue.ui.create_widget_blueprint": createWidgetBlueprintSchema,
  "ue.ui.set_widget_parent_class": setWidgetParentClassSchema,
  "ue.ui.apply_widget_layout": applyWidgetLayoutSchema,
  "ue.ui.validate_widget_layout": validateWidgetLayoutSchema,
  "ue.ui.compile_widget_design": compileWidgetDesignSchema,
  "ue.ui.compile_widget_dsl": compileWidgetDslSchema,
  "ue.ui.review_widget_dsl": reviewWidgetDslSchema,
  "ue.ui.apply_widget_dsl": applyWidgetDslSchema,
  "ue.ui.bind_button_clicked_to_function": bindButtonClickedToFunctionSchema,
  "ue.ui.bind_slider_value_changed_to_function": bindSliderValueChangedToFunctionSchema,
  "ue.ui.bind_checkbox_changed_to_function": bindCheckboxChangedToFunctionSchema,
  "ue.ui.bind_combobox_selection_changed_to_function": bindComboboxSelectionChangedToFunctionSchema,
  "ue.ui.compile_widget": compileWidgetSchema,
  "ue.ui.finalize_widget": finalizeWidgetSchema,
  "ue.ui.generate_widget_cpp": generateWidgetCppSchema,
  "ue.ui.write_widget_cpp": writeWidgetCppSchema,
  "ue.project.build_cpp": buildCppSchema,
  "ue.project.close_editor": closeEditorSchema,
  "ue.project.open_editor": openEditorSchema,
  "ue.project.rebuild_cpp_with_editor_restart": rebuildCppWithEditorRestartSchema,
  "ue.blueprint.inspect": inspectBlueprintSchema
} as const;

export type ToolName = keyof typeof toolInputSchemas;

export const bridgeCommandNames = {
  "ue.ui.inspect_widget_tree": "inspectWidgetTree",
  "ue.ui.create_widget_blueprint": "createWidgetBlueprint",
  "ue.ui.set_widget_parent_class": "setWidgetParentClass",
  "ue.ui.apply_widget_layout": "applyWidgetLayout",
  "ue.ui.bind_button_clicked_to_function": "bindButtonClickedToFunction",
  "ue.ui.bind_slider_value_changed_to_function": "bindSliderValueChangedToFunction",
  "ue.ui.bind_checkbox_changed_to_function": "bindCheckBoxChangedToFunction",
  "ue.ui.bind_combobox_selection_changed_to_function": "bindComboBoxSelectionChangedToFunction",
  "ue.ui.compile_widget": "compileWidget",
  "ue.ui.finalize_widget": "finalizeWidget",
  "ue.blueprint.inspect": "inspectBlueprint"
} as const satisfies Partial<Record<ToolName, string>>;

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(toolInputSchemas, name);
}

export function parseToolInput(name: ToolName, input: unknown): Record<string, unknown> {
  return toolInputSchemas[name].parse(input ?? {}) as Record<string, unknown>;
}
