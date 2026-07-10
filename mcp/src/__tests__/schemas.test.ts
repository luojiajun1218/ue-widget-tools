import { describe, expect, it } from "vitest";
import { toolInputSchemas } from "../schemas.js";
import { mcpTools } from "../tools.js";

describe("Misty UI MCP schemas", () => {
  it("rejects UI asset paths outside /Game/MistyPlanet/UI/", () => {
    const result = toolInputSchemas["ue.ui.inspect_widget_tree"].safeParse({
      assetPath: "/Game/MistyPlanet/Characters/WBP_Inventory"
    });

    expect(result.success).toBe(false);
  });

  it("accepts inspectWidgetTree input with a valid UI asset path", () => {
    const result = toolInputSchemas["ue.ui.inspect_widget_tree"].safeParse({
      assetPath: "/Game/MistyPlanet/UI/WBP_CharacterUI"
    });

    expect(result.success).toBe(true);
  });

  it("does not export unknown tool names", () => {
    const names = mcpTools.map((tool) => tool.name);

    expect(names).not.toContain("ue.ui.delete_asset");
  });

  it("exports production settings UI workflow tools", () => {
    const names = mcpTools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "ue.ui.set_widget_parent_class",
        "ue.ui.bind_slider_value_changed_to_function",
        "ue.ui.bind_checkbox_changed_to_function",
        "ue.ui.bind_combobox_selection_changed_to_function",
        "ue.ui.write_widget_cpp",
        "ue.ui.finalize_widget",
        "ue.ui.validate_widget_layout",
        "ue.ui.compile_widget_design",
        "ue.ui.compile_figma_widget",
        "ue.ui.review_figma_widget",
        "ue.ui.apply_figma_widget",
        "ue.project.build_cpp",
        "ue.project.close_editor",
        "ue.project.open_editor",
        "ue.project.rebuild_cpp_with_editor_restart",
        "ue.blueprint.inspect"
      ])
    );
  });

  it("accepts read-only blueprint inspection outside the UI folder", () => {
    const result = toolInputSchemas["ue.blueprint.inspect"].safeParse({
      assetPath: "/Game/MistyPlanet/Blueprints/Weapon/WeaponBase/BP_GunBase"
    });

    expect(result.success).toBe(true);
  });

  it("rejects blueprint inspection paths outside /Game/ or with traversal", () => {
    expect(
      toolInputSchemas["ue.blueprint.inspect"].safeParse({
        assetPath: "/Script/MistyPlanet.BP_GunBase"
      }).success
    ).toBe(false);
    expect(
      toolInputSchemas["ue.blueprint.inspect"].safeParse({
        assetPath: "/Game/MistyPlanet/../Config/DefaultEngine"
      }).success
    ).toBe(false);
  });

  it("accepts finalize widget input with compile, save, and inspect flags", () => {
    const result = toolInputSchemas["ue.ui.finalize_widget"].safeParse({
      assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
      compile: true,
      save: true,
      inspect: true,
      transactionId: "finalize-test"
    });

    expect(result.success).toBe(true);
  });

  it("accepts project C++ build input", () => {
    const result = toolInputSchemas["ue.project.build_cpp"].safeParse({
      target: "MistyPlanetEditor",
      configuration: "Development",
      platform: "Win64",
      waitMutex: true,
      noHotReload: true
    });

    expect(result.success).toBe(true);
  });

  it("accepts editor lifecycle inputs", () => {
    expect(toolInputSchemas["ue.project.close_editor"].safeParse({}).success).toBe(true);
    expect(toolInputSchemas["ue.project.open_editor"].safeParse({}).success).toBe(true);
    expect(toolInputSchemas["ue.project.rebuild_cpp_with_editor_restart"].safeParse({}).success).toBe(true);
  });

  it("accepts setting control event binding inputs", () => {
    expect(
      toolInputSchemas["ue.ui.bind_slider_value_changed_to_function"].safeParse({
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        sliderName: "VolumeSlider",
        functionName: "HandleVolumeChanged"
      }).success
    ).toBe(true);
    expect(
      toolInputSchemas["ue.ui.bind_checkbox_changed_to_function"].safeParse({
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        checkboxName: "FullscreenCheckBox",
        functionName: "HandleFullscreenChanged"
      }).success
    ).toBe(true);
    expect(
      toolInputSchemas["ue.ui.bind_combobox_selection_changed_to_function"].safeParse({
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        comboboxName: "ResolutionComboBox",
        functionName: "HandleResolutionChanged"
      }).success
    ).toBe(true);
  });

  it("accepts a rich WBP_Setting applyWidgetLayout payload", () => {
    const payload = {
      assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
      layout: {
        root: {
          type: "CanvasPanel",
          name: "SettingsScreen",
          children: [
            {
              type: "Border",
              name: "SettingsFrame",
              backgroundColor: "#101D28F2",
              padding: [28, 24, 28, 24],
              slot: {
                anchors: { minimum: [0, 0], maximum: [1, 1] },
                alignment: [0, 0],
                size: [0, 0],
                zOrder: 1
              }
            }
          ]
        }
      }
    };

    const result = toolInputSchemas["ue.ui.apply_widget_layout"].safeParse(payload);

    expect(result.success).toBe(true);
  });

  it("accepts widget layout quality validation input", () => {
    const result = toolInputSchemas["ue.ui.validate_widget_layout"].safeParse({
      profile: "settings",
      viewport: { width: 1280, height: 720 },
      layout: {
        root: {
          type: "CanvasPanel",
          name: "Root"
        }
      }
    });

    expect(result.success).toBe(true);
  });

  it("accepts structured widget design compilation input", () => {
    const result = toolInputSchemas["ue.ui.compile_widget_design"].safeParse({
      design: {
        name: "MenuPrototype",
        root: {
          type: "screen",
          name: "MenuScreen",
          children: [
            { type: "button", name: "StartButton", text: "Start", variant: "primary" }
          ]
        }
      }
    });

    expect(result.success).toBe(true);
  });

  it("accepts Figma widget compilation input", () => {
    const result = toolInputSchemas["ue.ui.compile_figma_widget"].safeParse({
      node: { type: "FRAME", name: "MenuScreen" }
    });

    expect(result.success).toBe(true);
  });

  it("accepts Figma widget review input with quality profile", () => {
    const result = toolInputSchemas["ue.ui.review_figma_widget"].safeParse({
      node: { type: "FRAME", name: "MenuScreen" },
      profile: "menu"
    });

    expect(result.success).toBe(true);
  });

  it("accepts Figma widget apply input with defaults and event bindings", () => {
    const result = toolInputSchemas["ue.ui.apply_figma_widget"].safeParse({
      assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
      node: { type: "FRAME", name: "MenuScreen" },
      bindings: {
        buttons: [{ widget: "ApplyButton", function: "HandleApplyClicked" }],
        sliders: [{ widget: "VolumeSlider", function: "HandleVolumeChanged" }],
        checkboxes: [{ widget: "FullscreenCheckBox", function: "HandleFullscreenChanged" }],
        comboboxes: [{ widget: "ResolutionComboBox", function: "HandleResolutionChanged" }]
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profile).toBe("generic");
      expect(result.data.compile).toBe(true);
      expect(result.data.save).toBe(true);
      expect(result.data.inspect).toBe(true);
    }
  });
});
