import { describe, expect, it } from "vitest";

import { compileWidgetDesign } from "../designCompiler.js";

describe("widget design compiler prototype", () => {
  it("compiles structured design IR into UMG layout and loss report", () => {
    const result = compileWidgetDesign({
      design: {
        name: "SettingsPrototype",
        viewport: { width: 1280, height: 720 },
        theme: {
          colors: {
            background: "#071017",
            panel: "#101821DD",
            primary: "#2E7D5B",
            text: "#EAF2F8",
            muted: "#9AA7B2"
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
              style: { backgroundColor: "panel", padding: 24 },
              children: [
                { type: "text", name: "TitleText", text: "Settings", variant: "title" },
                {
                  type: "stack",
                  name: "SettingsRows",
                  direction: "vertical",
                  gap: 12,
                  children: [
                    {
                      type: "row",
                      name: "VolumeRow",
                      children: [
                        { type: "text", name: "VolumeLabel", text: "Volume" },
                        { type: "slider", name: "VolumeSlider", value: 0.75 }
                      ]
                    },
                    {
                      type: "row",
                      name: "FullscreenRow",
                      children: [
                        { type: "text", name: "FullscreenLabel", text: "Fullscreen" },
                        { type: "toggle", name: "FullscreenToggle", checked: true }
                      ]
                    }
                  ]
                },
                {
                  type: "row",
                  name: "ActionRow",
                  children: [
                    { type: "button", name: "ApplyButton", text: "Apply", variant: "primary" },
                    { type: "button", name: "CloseButton", text: "Close", variant: "secondary" }
                  ]
                }
              ]
            }
          ]
        }
      }
    });

    expect(result.layout.root).toEqual(
      expect.objectContaining({
        type: "CanvasPanel",
        name: "SettingsScreen"
      })
    );
    expect(result.layout.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Border",
          name: "SettingsFrame",
          backgroundColor: "#101821DD",
          horizontalAlignment: "Fill",
          verticalAlignment: "Fill",
          slot: expect.objectContaining({
            anchors: { minimum: [0.5, 0.5], maximum: [0.5, 0.5] },
            alignment: [0.5, 0.5],
            size: [1040, 620]
          })
        })
      ])
    );
    expect(result.lossReport).toEqual([]);
  });

  it("reports unsupported visual effects without failing compilation", () => {
    const result = compileWidgetDesign({
      design: {
        name: "FancyMenu",
        root: {
          type: "screen",
          name: "MenuScreen",
          children: [
            {
              type: "panel",
              name: "GlassPanel",
              style: {
                backgroundColor: "#101821DD",
                blur: 24,
                boxShadow: "0 20px 60px rgba(0,0,0,.4)"
              },
              children: []
            }
          ]
        }
      }
    });

    expect(result.lossReport).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_STYLE_BLUR", node: "GlassPanel" }),
        expect.objectContaining({ code: "UNSUPPORTED_STYLE_BOX_SHADOW", node: "GlassPanel" })
      ])
    );
  });

  it("maps scroll containers to ScrollBox for dense pages", () => {
    const result = compileWidgetDesign({
      design: {
        name: "InventoryPrototype",
        root: {
          type: "screen",
          name: "InventoryScreen",
          children: [
            {
              type: "scroll",
              name: "InventoryScroll",
              children: [
                { type: "button", name: "ItemButton", text: "Item" }
              ]
            }
          ]
        }
      }
    });

    expect(result.layout.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ScrollBox",
          name: "InventoryScroll"
        })
      ])
    );
  });

  it("maps tabs to tab buttons plus WidgetSwitcher pages", () => {
    const result = compileWidgetDesign({
      design: {
        name: "TabbedSettingsPrototype",
        root: {
          type: "screen",
          name: "SettingsScreen",
          children: [
            {
              type: "tabs",
              name: "SettingsTabs",
              tabs: [
                {
                  id: "video",
                  label: "Video",
                  buttonName: "VideoTabButton",
                  pageName: "VideoSettingsPage",
                  children: [{ type: "text", name: "VideoTitle", text: "Video" }]
                },
                {
                  id: "audio",
                  label: "Audio",
                  buttonName: "AudioTabButton",
                  pageName: "AudioSettingsPage",
                  children: [{ type: "text", name: "AudioTitle", text: "Audio" }]
                }
              ]
            }
          ]
        }
      }
    });

    expect(result.layout.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "HorizontalBox",
          name: "SettingsTabs",
          children: [
            expect.objectContaining({
              type: "VerticalBox",
              name: "SettingsTabsButtonColumn",
              slot: expect.objectContaining({
                size: { rule: "Automatic" }
              })
            }),
            expect.objectContaining({
              type: "WidgetSwitcher",
              name: "SettingsTabsSwitcher",
              slot: expect.objectContaining({
                size: { rule: "Fill", value: 1 }
              })
            })
          ]
        })
      ])
    );
  });

  it("adds production slot sizing for settings shell and rows", () => {
    const result = compileWidgetDesign({
      design: {
        name: "SettingsShellPrototype",
        root: {
          type: "screen",
          name: "SettingsScreen",
          children: [
            {
              type: "panel",
              name: "SettingsFrame",
              children: [
                { type: "row", name: "HeaderRow", children: [{ type: "text", name: "TitleText", text: "Settings" }] },
                {
                  type: "tabs",
                  name: "SettingsTabs",
                  tabs: [
                    {
                      id: "video",
                      label: "Video",
                      buttonName: "VideoTabButton",
                      pageName: "VideoSettingsPage",
                      children: [
                        {
                          type: "row",
                          name: "BrightnessRow",
                          children: [
                            { type: "text", name: "BrightnessLabel", text: "Brightness" },
                            { type: "slider", name: "BrightnessSlider", value: 0.5 }
                          ]
                        }
                      ]
                    }
                  ]
                },
                { type: "row", name: "ActionRow", children: [{ type: "button", name: "ApplyButton", text: "Apply" }] }
              ]
            }
          ]
        }
      }
    });
    const frame = (result.layout.root.children as Record<string, unknown>[])[0];
    const content = (frame.children as Record<string, unknown>[])[0];
    const shellChildren = content.children as Record<string, unknown>[];
    const tabs = shellChildren.find((child) => child.name === "SettingsTabs");

    expect(shellChildren.find((child) => child.name === "HeaderRow")).toEqual(
      expect.objectContaining({ slot: expect.objectContaining({ size: { rule: "Automatic" } }) })
    );
    expect(tabs).toEqual(
      expect.objectContaining({ slot: expect.objectContaining({ size: { rule: "Fill", value: 1 } }) })
    );
    const switcher = (tabs?.children as Record<string, unknown>[]).find((child) => child.name === "SettingsTabsSwitcher");
    const page = (switcher?.children as Record<string, unknown>[])[0];
    const row = (page.children as Record<string, unknown>[])[0];
    expect(row).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({ padding: [0, 0, 0, 12] }),
        children: [
          expect.objectContaining({ type: "SizeBox", widthOverride: 260 }),
          expect.objectContaining({ type: "SizeBox", widthOverride: 320 })
        ]
      })
    );
  });

  it("wraps multiple panel children because UMG Border accepts one content child", () => {
    const result = compileWidgetDesign({
      design: {
        name: "PanelWrapperPrototype",
        root: {
          type: "screen",
          name: "Screen",
          children: [
            {
              type: "panel",
              name: "Frame",
              children: [
                { type: "text", name: "FirstText", text: "First" },
                { type: "text", name: "SecondText", text: "Second" }
              ]
            }
          ]
        }
      }
    });

    const rootChildren = result.layout.root.children as Record<string, unknown>[];
    expect(rootChildren[0]).toEqual(
      expect.objectContaining({
          type: "Border",
          name: "Frame",
          horizontalAlignment: "Fill",
          verticalAlignment: "Fill",
          children: [
          expect.objectContaining({
            type: "VerticalBox",
            name: "FrameContent",
            children: [
              expect.objectContaining({ name: "FirstText" }),
              expect.objectContaining({ name: "SecondText" })
            ]
          })
        ]
      })
    );
  });

  it("uses explicit rule-based style fields instead of name guesses for shell sizing and spacing", () => {
    const result = compileWidgetDesign({
      design: {
        name: "RuleBasedSettingsShell",
        viewport: { width: 1280, height: 720 },
        root: {
          type: "screen",
          name: "SettingsScreen",
          children: [
            {
              type: "panel",
              name: "SettingsFrame",
              style: {
                width: 1120,
                height: 640,
                padding: [28, 24, 28, 24],
                backgroundColor: "panel"
              },
              children: [
                {
                  type: "tabs",
                  name: "SettingsTabs",
                  style: {
                    fill: true,
                    sidebarWidth: 180,
                    sidebarGap: 12,
                    contentPadding: [28, 10, 0, 0]
                  },
                  tabs: [
                    {
                      id: "video",
                      label: "Video",
                      buttonName: "VideoTabButton",
                      pageName: "VideoSettingsPage",
                      children: [
                        {
                          type: "row",
                          name: "ResolutionRow",
                          style: {
                            labelWidth: 240,
                            controlWidth: 420,
                            margin: [0, 0, 0, 14]
                          },
                          children: [
                            { type: "text", name: "ResolutionLabel", text: "Resolution" },
                            { type: "select", name: "ResolutionComboBox", options: ["1920 x 1080"] }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    });

    const frame = (result.layout.root.children as Record<string, unknown>[])[0];
    const tabs = (frame.children as Record<string, unknown>[])[0];
    const tabColumn = (tabs.children as Record<string, unknown>[])[0];
    const switcher = (tabs.children as Record<string, unknown>[])[1];
    const page = (switcher.children as Record<string, unknown>[])[0];
    const row = (page.children as Record<string, unknown>[])[0];

    expect(frame).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({
          size: [1120, 640]
        }),
        padding: [28, 24, 28, 24]
      })
    );
    expect(tabs).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({
          size: { rule: "Fill", value: 1 }
        })
      })
    );
    expect(tabColumn).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({
          size: { rule: "Automatic" }
        }),
        children: [
          expect.objectContaining({
            widthOverride: 180,
            heightOverride: 44,
            slot: expect.objectContaining({
              padding: [0, 0, 0, 12]
            })
          })
        ]
      })
    );
    expect(switcher).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({
          padding: [28, 10, 0, 0],
          size: { rule: "Fill", value: 1 }
        })
      })
    );
    expect(row).toEqual(
      expect.objectContaining({
        slot: expect.objectContaining({
          padding: [0, 0, 0, 14]
        }),
        children: [
          expect.objectContaining({ widthOverride: 240 }),
          expect.objectContaining({ widthOverride: 420 })
        ]
      })
    );
  });

  it("compiles Settings IR into deterministic UMG layout without unsupported losses", () => {
    const result = compileWidgetDesign({
      design: {
        name: "SettingsPrototype",
        viewport: { width: 1440, height: 900 },
        theme: {
          colors: {
            background: "#071017",
            panel: "#101821DD",
            primary: "#2E7D5B",
            secondary: "#5B6470",
            text: "#EAF2F8",
            muted: "#9AA7B2"
          },
          spacing: 14
        },
        root: {
          type: "screen",
          name: "SettingsScreen",
          children: [
            {
              type: "panel",
              name: "SettingsFrame",
              style: {
                width: 1120,
                height: 680,
                padding: [28, 24, 28, 24],
                backgroundColor: "panel"
              },
              children: [
                {
                  type: "row",
                  name: "HeaderRow",
                  children: [
                    { type: "text", name: "SettingsTitle", text: "Settings", variant: "title", style: { fontSize: 32 } },
                    { type: "text", name: "UnsavedText", text: "Unsaved changes", variant: "muted", style: { alignSelf: "right" } }
                  ]
                },
                {
                  type: "tabs",
                  name: "SettingsTabs",
                  style: {
                    fill: true,
                    sidebarWidth: 184,
                    buttonHeight: 42,
                    sidebarGap: 8,
                    contentPadding: [24, 0, 0, 0]
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
                          name: "VideoPagePanel",
                          style: { padding: [0, 0, 0, 0], backgroundColor: "panel", fill: true },
                          children: [
                            {
                              type: "stack",
                              name: "VideoSettingsList",
                              direction: "vertical",
                              gap: 10,
                              style: { fill: true },
                              children: [
                                {
                                  type: "row",
                                  name: "ResolutionRow",
                                  style: { labelWidth: 220, controlWidth: 360, margin: [0, 0, 0, 12] },
                                  children: [
                                    { type: "text", name: "ResolutionLabel", text: "Resolution" },
                                    { type: "select", name: "ResolutionSelect", options: ["1920 x 1080", "2560 x 1440"] }
                                  ]
                                },
                                {
                                  type: "row",
                                  name: "BrightnessRow",
                                  style: { labelWidth: 220, controlWidth: 420, controlFill: true, margin: [0, 0, 0, 12] },
                                  children: [
                                    { type: "text", name: "BrightnessLabel", text: "Brightness" },
                                    { type: "slider", name: "BrightnessSlider", value: 0.65 }
                                  ]
                                },
                                {
                                  type: "row",
                                  name: "FullscreenRow",
                                  style: { labelWidth: 220, controlWidth: 28, margin: [0, 0, 0, 12] },
                                  children: [
                                    { type: "text", name: "FullscreenLabel", text: "Fullscreen" },
                                    { type: "toggle", name: "FullscreenToggle", checked: true }
                                  ]
                                }
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
                          type: "panel",
                          name: "AudioPagePanel",
                          style: { padding: [0, 0, 0, 0], backgroundColor: "panel", fill: true },
                          children: [{ type: "text", name: "AudioTitle", text: "Audio" }]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "row",
                  name: "ActionRow",
                  children: [
                    { type: "button", name: "ResetButton", text: "Reset" },
                    { type: "button", name: "ApplyButton", text: "Apply", variant: "primary" }
                  ]
                }
              ]
            }
          ]
        }
      }
    });

    const rootChildren = result.layout.root.children as Record<string, unknown>[];
    const frame = rootChildren[0];
    const frameContent = (frame.children as Record<string, unknown>[])[0];
    const frameChildren = frameContent.children as Record<string, unknown>[];
    const header = frameChildren.find((child) => child.name === "HeaderRow");
    const tabs = frameChildren.find((child) => child.name === "SettingsTabs");
    const actionRow = frameChildren.find((child) => child.name === "ActionRow");
    const switcher = (tabs?.children as Record<string, unknown>[]).find((child) => child.name === "SettingsTabsSwitcher");
    const videoScroll = (switcher?.children as Record<string, unknown>[]).find((child) => child.name === "VideoSettingsPage");
    const videoPagePanel = (videoScroll?.children as Record<string, unknown>[])[0];
    const videoList = (videoPagePanel.children as Record<string, unknown>[])[0];
    const videoRows = videoList.children as Record<string, unknown>[];
    const brightnessRow = videoRows.find((child) => child.name === "BrightnessRow");
    const fullscreenRow = videoRows.find((child) => child.name === "FullscreenRow");

    expect(frame).toEqual(
      expect.objectContaining({
        type: "Border",
        name: "SettingsFrame",
        padding: [28, 24, 28, 24],
        slot: expect.objectContaining({ size: [1120, 680] }),
        children: [
          expect.objectContaining({
            type: "VerticalBox",
            name: "SettingsFrameContent"
          })
        ]
      })
    );
    expect(header).toEqual(expect.objectContaining({ slot: expect.objectContaining({ size: { rule: "Automatic" } }) }));
    expect(tabs).toEqual(
      expect.objectContaining({
        type: "HorizontalBox",
        slot: expect.objectContaining({ size: { rule: "Fill", value: 1 } })
      })
    );
    expect(switcher).toEqual(expect.objectContaining({ type: "WidgetSwitcher", name: "SettingsTabsSwitcher" }));
    expect(videoScroll).toEqual(
      expect.objectContaining({
        type: "ScrollBox",
        slot: expect.objectContaining({ horizontalAlignment: "Fill", verticalAlignment: "Fill" }),
        children: [expect.objectContaining({ type: "Border", name: "VideoPagePanel" })]
      })
    );
    expect(videoList).toEqual(
      expect.objectContaining({
        type: "VerticalBox",
        name: "VideoSettingsList",
        slot: expect.objectContaining({ size: { rule: "Fill", value: 1 } })
      })
    );
    expect(brightnessRow).toEqual(
      expect.objectContaining({
        children: [
          expect.objectContaining({ type: "SizeBox", widthOverride: 220 }),
          expect.objectContaining({
            type: "SizeBox",
            widthOverride: 420,
            slot: expect.objectContaining({ size: { rule: "Fill", value: 1 } })
          })
        ]
      })
    );
    expect(fullscreenRow).toEqual(
      expect.objectContaining({
        children: [
          expect.objectContaining({ type: "SizeBox", widthOverride: 220 }),
          expect.objectContaining({
            type: "SizeBox",
            widthOverride: 28,
            slot: expect.objectContaining({ size: { rule: "Automatic" }, horizontalAlignment: "Left" })
          })
        ]
      })
    );
    expect(actionRow).toEqual(expect.objectContaining({ slot: expect.objectContaining({ horizontalAlignment: "Right" }) }));
    expect(result.lossReport).toEqual([]);
  });

  it("compiles advanced semantic nodes into UMG-friendly layout without loss", () => {
    const result = compileWidgetDesign({
      design: {
        name: "AdvancedHud",
        root: {
          type: "screen",
          name: "HudScreen",
          children: [
            {
              type: "hudLayer",
              name: "HudLayer",
              children: [
                {
                  type: "safeZone",
                  name: "HudSafeZone",
                  children: [
                    {
                      type: "toolbar",
                      name: "TopToolbar",
                      children: [
                        { type: "iconButton", name: "InventoryButton", text: "Inventory", variant: "primary" },
                        { type: "progress", name: "HealthBar", value: 0.75, style: { width: 240, height: 18 } }
                      ]
                    },
                    {
                      type: "inventoryGrid",
                      name: "InventoryGrid",
                      style: { columns: 4 },
                      children: [{ type: "image", name: "SlotImage", text: "/Game/MistyPlanet/UI/T_Slot", style: { width: 64, height: 64 } }]
                    },
                    {
                      type: "confirmDialog",
                      name: "QuitDialog",
                      children: [
                        { type: "text", name: "QuitDialogTitleText", text: "Quit?", variant: "title" },
                        { type: "text", name: "QuitDialogMessageText", text: "Return to base?", variant: "muted" }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    });

    expect(result.lossReport).toEqual([]);
    const layer = (result.layout.root.children as Record<string, unknown>[])[0];
    const safeZone = (layer.children as Record<string, unknown>[])[0];
    const toolbar = (safeZone.children as Record<string, unknown>[])[0];
    const grid = (safeZone.children as Record<string, unknown>[])[1];
    const dialog = (safeZone.children as Record<string, unknown>[])[2];

    expect(layer).toEqual(expect.objectContaining({ type: "Overlay", name: "HudLayer" }));
    expect(safeZone).toEqual(expect.objectContaining({ type: "SafeZone", name: "HudSafeZone" }));
    expect(toolbar).toEqual(expect.objectContaining({ type: "HorizontalBox", name: "TopToolbar" }));
    expect((toolbar.children as Record<string, unknown>[])[0]).toEqual(expect.objectContaining({ type: "Button", name: "InventoryButton" }));
    expect((toolbar.children as Record<string, unknown>[])[1]).toEqual(expect.objectContaining({ type: "ProgressBar", name: "HealthBar", percent: 0.75 }));
    expect(grid).toEqual(expect.objectContaining({ type: "UniformGridPanel", name: "InventoryGrid", columns: 4 }));
    expect((grid.children as Record<string, unknown>[])[0]).toEqual(expect.objectContaining({ type: "Image", name: "SlotImage" }));
    expect(dialog).toEqual(expect.objectContaining({ type: "Border", name: "QuitDialog" }));
  });

  it("compiles root fill panels to fullscreen Canvas anchors without fixed viewport size", () => {
    const result = compileWidgetDesign({
      design: {
        name: "FullscreenSettings",
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

    expect((result.layout.root.children as Record<string, unknown>[])[0]).toEqual(
      expect.objectContaining({
        name: "SettingsRoot",
        slot: expect.objectContaining({
          anchors: { minimum: [0, 0], maximum: [1, 1] },
          alignment: [0, 0],
          size: [0, 0]
        })
      })
    );
  });
});
