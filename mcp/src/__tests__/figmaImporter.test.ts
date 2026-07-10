import { describe, expect, it } from "vitest";

import { compileFigmaWidget } from "../figmaImporter.js";

describe("Figma widget importer", () => {
  it("compiles Figma frames and semantic layer names into Widget Design IR", () => {
    const result = compileFigmaWidget({
      node: {
        type: "FRAME",
        name: "SettingsScreen",
        absoluteBoundingBox: { width: 1280, height: 720 },
        layoutMode: "VERTICAL",
        itemSpacing: 18,
        children: [
          {
            type: "FRAME",
            name: "Panel/SettingsFrame",
            layoutMode: "VERTICAL",
            itemSpacing: 14,
            fills: [{ type: "SOLID", color: { r: 0.06, g: 0.1, b: 0.14 }, opacity: 0.9 }],
            children: [
              {
                type: "TEXT",
                name: "Text/TitleText",
                characters: "SETTINGS",
                style: { fontSize: 34 }
              },
              {
                type: "FRAME",
                name: "Button/ApplyButton",
                fills: [{ type: "SOLID", color: { r: 0.18, g: 0.49, b: 0.36 } }],
                children: [{ type: "TEXT", name: "ApplyButtonLabel", characters: "Apply" }]
              }
            ]
          }
        ]
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.design).toEqual(
      expect.objectContaining({
        name: "SettingsScreen",
        viewport: { width: 1280, height: 720 },
        root: expect.objectContaining({
          type: "screen",
          name: "SettingsScreen",
          children: [
            expect.objectContaining({
              type: "panel",
              name: "SettingsFrame",
              children: expect.arrayContaining([
                expect.objectContaining({ type: "text", name: "TitleText", text: "SETTINGS" }),
                expect.objectContaining({ type: "button", name: "ApplyButton", text: "Apply" })
              ])
            })
          ]
        })
      })
    );
  });

  it("reports unsupported Figma features instead of silently dropping them", () => {
    const result = compileFigmaWidget({
      node: {
        type: "FRAME",
        name: "MenuScreen",
        children: [
          {
            type: "VECTOR",
            name: "LogoVector"
          }
        ]
      }
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSUPPORTED_FIGMA_NODE",
          node: "LogoVector"
        })
      ])
    );
  });
});
