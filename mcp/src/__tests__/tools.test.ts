import { describe, expect, it, vi } from "vitest";

import { dispatchTool } from "../tools.js";

describe("MCP tool dispatch", () => {
  it("forwards finalizeWidget to the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true, command: "finalizeWidget" })
    };

    const result = await dispatchTool(
      "ue.ui.finalize_widget",
      {
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        compile: true,
        save: true,
        inspect: true,
        transactionId: "finalize-test"
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "finalizeWidget",
      transactionId: "finalize-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        compile: true,
        save: true,
        inspect: true
      }
    });
  });

  it("forwards checkbox binding using the UE plugin command spelling", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true, command: "bindCheckBoxChangedToFunction" })
    };

    const result = await dispatchTool(
      "ue.ui.bind_checkbox_changed_to_function",
      {
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        checkboxName: "FullscreenCheckBox",
        functionName: "HandleFullscreenChanged"
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "bindCheckBoxChangedToFunction",
      transactionId: undefined,
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        checkboxName: "FullscreenCheckBox",
        functionName: "HandleFullscreenChanged"
      }
    });
  });

  it("forwards read-only blueprint inspection to the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true, command: "inspectBlueprint" })
    };

    const result = await dispatchTool(
      "ue.blueprint.inspect",
      {
        assetPath: "/Game/MistyPlanet/Blueprints/Weapon/WeaponBase/BP_GunBase",
        includeGraphSummary: true,
        includeClassDefaults: false,
        transactionId: "inspect-bp-test"
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "inspectBlueprint",
      transactionId: "inspect-bp-test",
      payload: {
        assetPath: "/Game/MistyPlanet/Blueprints/Weapon/WeaponBase/BP_GunBase",
        includeGraphSummary: true,
        includeClassDefaults: false
      }
    });
  });

  it("forwards combobox binding using the UE plugin command spelling", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true, command: "bindComboBoxSelectionChangedToFunction" })
    };

    const result = await dispatchTool(
      "ue.ui.bind_combobox_selection_changed_to_function",
      {
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        comboboxName: "ResolutionComboBox",
        functionName: "HandleResolutionChanged"
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "bindComboBoxSelectionChangedToFunction",
      transactionId: undefined,
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Setting",
        comboboxName: "ResolutionComboBox",
        functionName: "HandleResolutionChanged"
      }
    });
  });

  it("compiles widget design locally without calling the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.compile_widget_design",
      {
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
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(result.content[0]?.type).toBe("text");
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") {
      expect(content.text).toContain("StartButton");
    }
  });

  it("compiles UMG-like widget DSL locally without calling the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.compile_widget_dsl",
      {
        source: '<Canvas name="MenuScreen"><Button name="StartButton" text="Start" variant="primary" /></Canvas>'
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(result.content[0]?.type).toBe("text");
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") {
      expect(content.text).toContain("StartButton");
      expect(content.text).toContain("layout");
    }
  });

  it("reviews UMG-like widget DSL locally with layout quality without calling the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.review_widget_dsl",
      {
        profile: "menu",
        source: '<Canvas name="MenuScreen" width={1280} height={720}><Button name="StartButton" text="Start" variant="primary" /></Canvas>'
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") {
      const payload = JSON.parse(content.text);
      expect(payload.layout.root.name).toBe("MenuScreen");
      expect(payload.html).toContain("StartButton");
      expect(payload.html).toContain('<main class="widget-review-shell" data-preview-mode="fixed">');
      expect(payload.html).toContain("widget-viewport-frame");
      expect(payload.html).toContain("--widget-preview-scale");
      expect(payload.html).not.toContain('<main class="screen"');
      expect(payload.quality.ok).toBe(true);
      expect(payload.reviewQuality.ok).toBe(true);
      expect(payload.diagnostics).toEqual([]);
    }
  });

  it("reviews fullscreen widget DSL without injecting a fixed design viewport", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.review_widget_dsl",
      {
        profile: "settings",
        source: '<Widget name="FullscreenSettings"><Canvas name="SettingsScreen"><Border name="SettingsRoot" fill backgroundColor="panel"><Text name="TitleText" text="设置" variant="title" /></Border></Canvas></Widget>'
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") {
      const payload = JSON.parse(content.text);
      expect(payload.design.viewport).toBeUndefined();
      expect(payload.html).toContain('data-preview-mode="fullscreen"');
      expect(payload.html).toContain("fullscreen / fill-parent");
      expect(payload.quality.ok).toBe(true);
      expect(payload.reviewQuality.ok).toBe(true);
    }
  });

  it("applies reviewed widget DSL, bindings, and finalizes through the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.apply_widget_dsl",
      {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        source: '<Canvas name="MenuScreen"><Button name="StartButton" text="Start" variant="primary" /></Canvas>',
        transactionId: "apply-dsl-test",
        bindings: {
          buttons: [{ widget: "StartButton", function: "HandleStartClicked" }]
        }
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, {
      command: "applyWidgetLayout",
      transactionId: "apply-dsl-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        layout: expect.objectContaining({
          root: expect.objectContaining({ name: "MenuScreen" })
        })
      }
    });
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, {
      command: "bindButtonClickedToFunction",
      transactionId: "apply-dsl-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        buttonName: "StartButton",
        functionName: "HandleStartClicked"
      }
    });
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, {
      command: "finalizeWidget",
      transactionId: "apply-dsl-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        compile: true,
        save: true,
        inspect: true
      }
    });
  });

  it("blocks widget DSL apply when local review reports diagnostics", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.apply_widget_dsl",
      {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        source: '<Canvas name="MenuScreen"><Button name="StartButton" text="Start" unknownAttr="x" /></Canvas>'
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") {
      const payload = JSON.parse(content.text);
      expect(payload.blocked).toBe(true);
      expect(payload.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_ATTRIBUTE" })])
      );
    }
  });
});
