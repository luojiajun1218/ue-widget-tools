import { describe, expect, it, vi } from "vitest";

import { dispatchTool } from "../tools.js";

describe("MCP tool dispatch", () => {
  it("forwards finalizeWidget to the bridge", async () => {
    const client = { getStatus: vi.fn().mockResolvedValue({ ok: true }), sendCommand: vi.fn().mockResolvedValue({ ok: true, command: "finalizeWidget" }) };
    const result = await dispatchTool("ue.ui.finalize_widget", { assetPath: "/Game/MistyPlanet/UI/WBP_Setting", compile: true, save: true, inspect: true, transactionId: "finalize-test" }, client);

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "finalizeWidget", transactionId: "finalize-test",
      payload: { assetPath: "/Game/MistyPlanet/UI/WBP_Setting", compile: true, save: true, inspect: true }
    });
  });

  it("forwards checkbox binding using the UE plugin command spelling", async () => {
    const client = { getStatus: vi.fn().mockResolvedValue({ ok: true }), sendCommand: vi.fn().mockResolvedValue({ ok: true }) };
    const result = await dispatchTool("ue.ui.bind_checkbox_changed_to_function", {
      assetPath: "/Game/MistyPlanet/UI/WBP_Setting", checkboxName: "FullscreenCheckBox", functionName: "HandleFullscreenChanged"
    }, client);

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "bindCheckBoxChangedToFunction", transactionId: undefined,
      payload: { assetPath: "/Game/MistyPlanet/UI/WBP_Setting", checkboxName: "FullscreenCheckBox", functionName: "HandleFullscreenChanged" }
    });
  });

  it("forwards read-only blueprint inspection to the bridge", async () => {
    const client = { getStatus: vi.fn().mockResolvedValue({ ok: true }), sendCommand: vi.fn().mockResolvedValue({ ok: true }) };
    const result = await dispatchTool("ue.blueprint.inspect", {
      assetPath: "/Game/MistyPlanet/Blueprints/Weapon/WeaponBase/BP_GunBase", includeGraphSummary: true, includeClassDefaults: false, transactionId: "inspect-bp-test"
    }, client);

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "inspectBlueprint", transactionId: "inspect-bp-test",
      payload: { assetPath: "/Game/MistyPlanet/Blueprints/Weapon/WeaponBase/BP_GunBase", includeGraphSummary: true, includeClassDefaults: false }
    });
  });

  it("forwards combobox binding using the UE plugin command spelling", async () => {
    const client = { getStatus: vi.fn().mockResolvedValue({ ok: true }), sendCommand: vi.fn().mockResolvedValue({ ok: true }) };
    const result = await dispatchTool("ue.ui.bind_combobox_selection_changed_to_function", {
      assetPath: "/Game/MistyPlanet/UI/WBP_Setting", comboboxName: "ResolutionComboBox", functionName: "HandleResolutionChanged"
    }, client);

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenCalledWith({
      command: "bindComboBoxSelectionChangedToFunction", transactionId: undefined,
      payload: { assetPath: "/Game/MistyPlanet/UI/WBP_Setting", comboboxName: "ResolutionComboBox", functionName: "HandleResolutionChanged" }
    });
  });

  it("compiles widget design locally without calling the bridge", async () => {
    const client = { getStatus: vi.fn().mockResolvedValue({ ok: true }), sendCommand: vi.fn().mockResolvedValue({ ok: true }) };
    const result = await dispatchTool("ue.ui.compile_widget_design", {
      design: { name: "MenuPrototype", root: { type: "screen", name: "MenuScreen", children: [{ type: "button", name: "StartButton", text: "Start", variant: "primary" }] } }
    }, client);

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(result.content[0]?.type).toBe("text");
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") expect(content.text).toContain("StartButton");
  });
});
