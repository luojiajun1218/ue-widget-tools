import { describe, expect, it } from "vitest";

import { validateWidgetLayoutQuality } from "../layoutQuality.js";

describe("widget layout quality gate", () => {
  it("rejects a dense settings panel without scroll, tabs, or styled containers", () => {
    const result = validateWidgetLayoutQuality({
      layout: {
        root: {
          type: "CanvasPanel",
          name: "Root",
          children: [
            {
              type: "VerticalBox",
              name: "SettingsColumn",
              children: Array.from({ length: 24 }, (_, index) => ({
                type: "HorizontalBox",
                name: `SettingRow${index}`,
                children: [
                  { type: "TextBlock", name: `Label${index}`, text: `Setting ${index}` },
                  { type: "Slider", name: `Slider${index}` }
                ]
              }))
            }
          ]
        }
      },
      profile: "settings",
      viewport: { width: 1280, height: 720 }
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SETTINGS_CONTENT_NEEDS_PAGING_OR_SCROLL" }),
        expect.objectContaining({ code: "MISSING_STYLED_CONTAINER" })
      ])
    );
  });

  it("accepts a settings layout with styled frame, tabs, scrollable content, and action row", () => {
    const result = validateWidgetLayoutQuality({
      layout: {
        root: {
          type: "CanvasPanel",
          name: "Root",
          children: [
            {
              type: "Border",
              name: "Frame",
              backgroundColor: "#101821DD",
              padding: [24, 24, 24, 24],
              slot: {
                anchors: { minimum: [0.5, 0.5], maximum: [0.5, 0.5] },
                alignment: [0.5, 0.5],
                size: [1040, 620]
              },
              children: [
                {
                  type: "HorizontalBox",
                  name: "Shell",
                  children: [
                    {
                      type: "VerticalBox",
                      name: "SettingsTabs",
                      children: [
                        { type: "Button", name: "VideoTab", backgroundColor: "#26435A" },
                        { type: "Button", name: "AudioTab", backgroundColor: "#1C2E3E" }
                      ]
                    },
                    {
                      type: "ScrollBox",
                      name: "SettingsScroll",
                      children: [
                        { type: "VerticalBox", name: "SettingsPage", children: [] }
                      ]
                    }
                  ]
                },
                {
                  type: "HorizontalBox",
                  name: "ActionRow",
                  children: [
                    { type: "Button", name: "ApplyButton", backgroundColor: "#2E7D5B" },
                    { type: "Button", name: "CloseButton", backgroundColor: "#5B6470" }
                  ]
                }
              ]
            }
          ]
        }
      },
      profile: "settings",
      viewport: { width: 1280, height: 720 }
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
