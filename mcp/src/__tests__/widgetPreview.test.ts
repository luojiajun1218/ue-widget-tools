import { describe, expect, it } from "vitest";

import type { WidgetDesign } from "../designCompiler.js";
import { renderWidgetPreview } from "../widgetPreview.js";

describe("widget preview renderer", () => {
  it("renders tabs settings design with review shell, layout styles, hooks, and controls", () => {
    const html = renderWidgetPreview({ design: settingsPreviewDesign() });

    expect(html).toContain('<div class="widget-review-shell">');
    expect(html).toContain('<div class="widget-review-header" aria-label="Widget preview metadata">');
    expect(html).toContain('<span class="widget-review-source">SettingsPreview</span>');
    expect(html).toContain('<span class="widget-review-viewport">1280 x 720</span>');
    expect(html).toContain('<div class="widget-viewport-frame" style="width:1280px;height:720px;">');
    expect(html).toContain('<div class="widget-screen" data-node="SettingsScreen" style="width:1280px;height:720px;');
    expect(html).toContain('data-node="SettingsFrame" style="background:#0F1A22EE;padding:28px 24px 28px 24px;width:1120px;height:640px;');
    expect(html).toContain('data-widget-tab-button="video"');
    expect(html).toContain('data-widget-tab-page="audio" hidden');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("button.setAttribute('aria-selected', String(isActive))");
    expect(html).toContain("document.querySelectorAll('[data-widget-tab-button]')");
    expect(html).toContain("button.dataset.widgetTabButton === tabId");
    expect(html).toContain('data-node="ResolutionLabelBox" style="width:230px;flex:0 0 230px;"');
    expect(html).toContain('data-node="ResolutionComboBoxBox" style="width:430px;flex:0 0 430px;"');
    expect(html).toContain('data-node="BrightnessSliderBox" style="width:430px;flex:1 1 0;min-width:0;"');
    expect(html).toContain('<select data-node="ResolutionComboBox"');
    expect(html).toContain('<input data-node="BrightnessSlider" type="range"');
    expect(html).toContain('<label class="widget-toggle" data-node="FullscreenCheckBoxToggle">');
    expect(html).toContain('<input data-node="FullscreenCheckBox" type="checkbox" checked>');
    expect(html).toContain('<span class="widget-toggle-track" aria-hidden="true"><span class="widget-toggle-thumb"></span></span>');
    expect(html).toContain('data-node="ActionRow" style="display:flex;align-items:center;gap:20px;margin:18px 0 0 0;justify-content:flex-end;align-self:flex-end;"');
    expect(html).toContain('<button class="widget-button secondary" data-node="ResetButton"');
    expect(html).toContain('<button class="widget-button primary" data-node="ApplyButton"');
  });
});

function settingsPreviewDesign(): WidgetDesign {
  return {
    name: "SettingsPreview",
    viewport: { width: 1280, height: 720 },
    theme: {
      colors: {
        background: "#061016",
        panel: "#0F1A22EE",
        panelSoft: "#15242EEE",
        primary: "#38B27D",
        secondary: "#51616E",
        text: "#EDF6FA",
        muted: "#8FA4AF"
      },
      spacing: 16
    },
    root: {
      type: "screen",
      name: "SettingsScreen",
      children: [
        {
          type: "panel",
          name: "SettingsFrame",
          style: {
            backgroundColor: "panel",
            padding: [28, 24, 28, 24],
            width: 1120,
            height: 640
          },
          children: [
            {
              type: "stack",
              name: "SettingsLayout",
              gap: 16,
              style: { fill: true },
              children: [
                {
                  type: "row",
                  name: "HeaderRow",
                  style: { auto: true, margin: [0, 0, 0, 18] },
                  children: [
                    { type: "text", name: "TitleText", text: "SETTINGS", variant: "title", style: { fontSize: 40 } },
                    {
                      type: "text",
                      name: "ProfileText",
                      text: "Pilot Profile: Hunter-07",
                      variant: "muted",
                      style: { fontSize: 22, margin: [22, 8, 0, 0] }
                    }
                  ]
                },
                {
                  type: "tabs",
                  name: "SettingsTabs",
                  style: {
                    fill: true,
                    sidebarWidth: 176,
                    buttonHeight: 44,
                    sidebarGap: 12,
                    contentPadding: [28, 0, 0, 0]
                  },
                  tabs: [
                    {
                      id: "video",
                      label: "Video",
                      buttonName: "VideoTabButton",
                      pageName: "VideoSettingsPage",
                      children: [
                        {
                          type: "panel",
                          name: "VideoSettingsPanel",
                          style: { backgroundColor: "panelSoft", padding: [24, 22, 24, 22] },
                          children: [
                            {
                              type: "row",
                              name: "ResolutionRow",
                              style: { labelWidth: 230, controlWidth: 430 },
                              children: [
                                { type: "text", name: "ResolutionLabel", text: "Resolution" },
                                {
                                  type: "select",
                                  name: "ResolutionComboBox",
                                  options: ["1920 x 1080", "2560 x 1440"]
                                }
                              ]
                            },
                            {
                              type: "row",
                              name: "BrightnessRow",
                              style: { labelWidth: 230, controlWidth: 430, controlFill: true },
                              children: [
                                { type: "text", name: "BrightnessLabel", text: "Brightness" },
                                { type: "slider", name: "BrightnessSlider", value: 0.62 }
                              ]
                            },
                            {
                              type: "row",
                              name: "WindowModeRow",
                              style: { labelWidth: 230, controlWidth: 80 },
                              children: [
                                { type: "text", name: "WindowModeLabel", text: "Fullscreen" },
                                { type: "toggle", name: "FullscreenCheckBox", checked: true }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      id: "audio",
                      label: "Audio",
                      buttonName: "AudioTabButton",
                      pageName: "AudioSettingsPage",
                      children: [
                        {
                          type: "row",
                          name: "MasterVolumeRow",
                          style: { labelWidth: 230, controlWidth: 430 },
                          children: [
                            { type: "text", name: "MasterVolumeLabel", text: "Master Volume" },
                            { type: "slider", name: "MasterVolumeSlider", value: 0.82 }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "row",
                  name: "ActionRow",
                  gap: 20,
                  style: { auto: true, alignSelf: "right", margin: [0, 18, 0, 0] },
                  children: [
                    { type: "button", name: "ResetButton", text: "Reset", variant: "secondary", style: { width: 116, height: 44 } },
                    { type: "button", name: "ApplyButton", text: "Apply", variant: "primary", style: { width: 116, height: 44 } },
                    { type: "button", name: "CloseSettingsButton", text: "Close", variant: "secondary", style: { width: 116, height: 44 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}
