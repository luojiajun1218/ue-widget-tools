import { describe, expect, it, vi } from "vitest";

import { toolInputSchemas } from "../schemas.js";
import { dispatchTool, mcpTools } from "../tools.js";

const figmaMenuNode = {
  type: "FRAME",
  name: "MenuScreen",
  absoluteBoundingBox: { width: 1280, height: 720 },
  layoutMode: "VERTICAL",
  children: [
    {
      type: "FRAME",
      name: "Panel/MenuPanel",
      layoutMode: "VERTICAL",
      children: [
        { type: "TEXT", name: "Text/TitleText", characters: "MAIN MENU" },
        {
          type: "FRAME",
          name: "Button/StartButton",
          children: [{ type: "TEXT", name: "StartButtonLabel", characters: "Start" }]
        }
      ]
    }
  ]
};

describe("Figma widget MCP tools", () => {
  it("exports Figma-to-UMG tools instead of DSL/HTML review tools", () => {
    const names = mcpTools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "ue.ui.compile_figma_widget",
        "ue.ui.review_figma_widget",
        "ue.ui.apply_figma_widget"
      ])
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        "ue.ui.compile_widget_dsl",
        "ue.ui.review_widget_dsl",
        "ue.ui.apply_widget_dsl"
      ])
    );
  });

  it("accepts Figma apply input with bindings and defaults", () => {
    const result = toolInputSchemas["ue.ui.apply_figma_widget"].safeParse({
      assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
      node: figmaMenuNode,
      bindings: {
        buttons: [{ widget: "StartButton", function: "HandleStartClicked" }]
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

  it("reviews Figma locally without generating HTML or calling the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.review_figma_widget",
      {
        profile: "menu",
        node: figmaMenuNode
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).not.toHaveBeenCalled();
    const [content] = result.content;
    expect(content.type).toBe("text");
    if (content.type === "text") {
      const payload = JSON.parse(content.text);
      expect(payload.html).toBeUndefined();
      expect(payload.reviewQuality).toBeUndefined();
      expect(payload.layout.root.name).toBe("MenuScreen");
      expect(payload.diagnostics).toEqual([]);
      expect(payload.quality.ok).toBe(true);
    }
  });

  it("applies reviewed Figma layout, bindings, and finalizes through the bridge", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({ ok: true }),
      sendCommand: vi.fn().mockResolvedValue({ ok: true })
    };

    const result = await dispatchTool(
      "ue.ui.apply_figma_widget",
      {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        node: figmaMenuNode,
        transactionId: "apply-figma-test",
        bindings: {
          buttons: [{ widget: "StartButton", function: "HandleStartClicked" }]
        }
      },
      client
    );

    expect(result.isError).toBeUndefined();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, {
      command: "applyWidgetLayout",
      transactionId: "apply-figma-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        layout: expect.objectContaining({
          root: expect.objectContaining({ name: "MenuScreen" })
        })
      }
    });
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, {
      command: "bindButtonClickedToFunction",
      transactionId: "apply-figma-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        buttonName: "StartButton",
        functionName: "HandleStartClicked"
      }
    });
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, {
      command: "finalizeWidget",
      transactionId: "apply-figma-test",
      payload: {
        assetPath: "/Game/MistyPlanet/UI/WBP_Menu",
        compile: true,
        save: true,
        inspect: true
      }
    });
  });
});
