import { describe, expect, it } from "vitest";

import type { WidgetDesign } from "../designCompiler.js";
import { renderWidgetPreview } from "../widgetPreview.js";

describe("widget preview renderer", () => {
  it("renders tabs settings design with review shell, layout styles, hooks, and controls", () => {
    const html = renderWidgetPreview({ design: settingsPreviewDesign() });

    expect(html).toContain('<main class="widget-review-shell" data-preview-mode="fixed">');
    expect(html).toContain('<div class="widget-review-header" aria-label="Widget preview metadata">');
    expect(html).toContain('<span class="widget-review-source">SettingsPreview</span>');
    expect(html).toContain('<span class="widget-review-viewport">1280 x 720</span>');
    expect(html).toContain('<div class="widget-viewport-frame" style="width:1280px;height:720px;">');
    expect(html).toContain('<div class="widget-screen" data-node="SettingsScreen" style="width:1280px;height:720px;');
    expect(html).toContain('data-node="SettingsFrame"');
    expect(html).toContain('background:#0F1A22EE;');
    expect(html).toContain('padding:28px 24px 28px 24px;');
    expect(html).toContain('width:1120px;height:640px;');
    expect(html).toContain('data-widget-tab-button="video"');
    expect(html).toContain('data-widget-tab-page="audio"');
    expect(html).toContain('hidden><div class="widget-row" data-node="MasterVolumeRow"');
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

  it("renders a usable fullscreen design review preview for layered settings screens", () => {
    const html = renderWidgetPreview({ design: layeredSettingsPreviewDesign() });

    expect(html).toContain('<main class="widget-review-shell" data-preview-mode="fixed">');
    expect(html).toContain('Open this file directly in a browser');
    expect(html).toContain('transform:scale(var(--widget-preview-scale));');
    expect(html).toContain('data-node="DimBackground"');
    expect(html).toContain('position:absolute;inset:0;z-index:0;');
    expect(html).toContain('data-node="SettingsFrame"');
    expect(html).toContain('z-index:1;');
    expect(html).toContain('data-node="HeaderTextStack" style="display:flex;flex-direction:column;gap:4px;flex:1 1 0;min-width:0;');
    expect(html).toContain('data-node="ActionRow" style="display:flex;align-items:center;gap:14px;');
    expect(html).toContain('justify-content:flex-end;align-self:flex-end;');
    expect(html).toContain('data-node="SettingsTabsSwitcher" style="flex:1 1 auto;min-width:0;padding:22px 0 0 0;height:100%;min-height:0;');
    expect(html).toContain('class="widget-tab-page" data-node="AudioSettingsPage" data-widget-tab-page="audio" style="height:100%;min-height:0;overflow:auto;"');
  });

  it("renders designs without a viewport as browser fullscreen fill-parent previews", () => {
    const html = renderWidgetPreview({
      design: {
        name: "FullscreenSettingsPreview",
        root: {
          type: "screen",
          name: "SettingsScreen",
          children: [
            {
              type: "panel",
              name: "SettingsRoot",
              style: { fill: true, backgroundColor: "panel" },
              children: [{ type: "text", name: "TitleText", text: "设置", variant: "title" }]
            }
          ]
        }
      }
    });

    expect(html).toContain('data-preview-mode="fullscreen"');
    expect(html).toContain('<span class="widget-review-viewport">fullscreen / fill-parent</span>');
    expect(html).toContain('class="widget-viewport-frame" style="width:calc(100vw - 36px);height:calc(100vh - 96px);"');
    expect(html).toContain('data-node="SettingsScreen" style="width:100%;height:100%;');
    expect(html).toContain('data-node="SettingsRoot" style="position:absolute;inset:0;');
    expect(html).not.toContain('1280 x 720');
    expect(html).not.toContain('1920 x 1080');
  });

  it("renders a review console that selects widgets and simulates control states without editing the DSL", () => {
    const html = renderWidgetPreview({ design: settingsPreviewDesign() });

    expect(html).toContain('<aside class="widget-review-console" aria-label="Widget review controls">');
    expect(html).toContain('data-review-selection>Nothing selected</output>');
    expect(html).toContain('data-review-state-button="normal"');
    expect(html).toContain('data-review-state-button="hover"');
    expect(html).toContain('data-review-state-button="pressed"');
    expect(html).toContain('data-review-state-button="disabled"');
    expect(html).toContain("document.querySelectorAll('[data-node]')");
    expect(html).toContain("document.documentElement.dataset.reviewState = state");
    expect(html).toContain("navigator.clipboard.writeText(selectedNode)");
    expect(html).toContain("node.classList.toggle('widget-review-selected', isSelected)");
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

function layeredSettingsPreviewDesign(): WidgetDesign {
  return {
    name: "LayeredSettingsPreview",
    viewport: { width: 1280, height: 720 },
    theme: {
      colors: {
        background: "#081017EE",
        panel: "#101D28F2",
        primary: "#35D6C9",
        secondary: "#2F4656",
        text: "#EAF7F6",
        muted: "#8FA9AD"
      },
      spacing: 12
    },
    root: {
      type: "screen",
      name: "SettingsScreen",
      children: [
        {
          type: "panel",
          name: "DimBackground",
          style: { backgroundColor: "#03070ACC", width: 1280, height: 720 }
        },
        {
          type: "panel",
          name: "SettingsFrame",
          style: {
            backgroundColor: "panel",
            padding: [28, 24, 28, 24],
            width: 1120,
            height: 640,
            alignSelf: "center",
            valignSelf: "center"
          },
          children: [
            {
              type: "stack",
              name: "SettingsLayout",
              gap: 18,
              style: { fill: true },
              children: [
                {
                  type: "stack",
                  name: "HeaderTextStack",
                  gap: 4,
                  style: { grow: true },
                  children: [
                    { type: "text", name: "TitleText", text: "设置", variant: "title" },
                    { type: "text", name: "SubtitleText", text: "调整音频、画面和控制", variant: "muted" }
                  ]
                },
                {
                  type: "tabs",
                  name: "SettingsTabs",
                  style: {
                    fill: true,
                    sidebarWidth: 190,
                    buttonHeight: 54,
                    sidebarGap: 10,
                    contentPadding: [22, 0, 0, 0]
                  },
                  tabs: [
                    {
                      id: "audio",
                      label: "音频",
                      buttonName: "AudioTabButton",
                      pageName: "AudioSettingsPage",
                      children: [
                        {
                          type: "panel",
                          name: "AudioPanel",
                          style: { backgroundColor: "#0C1720DD", padding: [22, 20, 22, 20] },
                          children: [
                            {
                              type: "row",
                              name: "MasterVolumeRow",
                              style: { labelWidth: 230, controlWidth: 430 },
                              children: [
                                { type: "text", name: "MasterVolumeLabel", text: "主音量" },
                                { type: "slider", name: "MasterVolumeSlider", value: 0.8 }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "row",
                  name: "ActionRow",
                  gap: 14,
                  style: { alignSelf: "end" },
                  children: [
                    { type: "button", name: "ResetButton", text: "恢复默认", variant: "secondary" },
                    { type: "button", name: "ApplyButton", text: "应用", variant: "primary" }
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
