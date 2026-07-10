import { describe, expect, it } from "vitest";

import { compileWidgetDsl } from "../widgetDsl.js";

describe("widget TSX DSL compiler", () => {
  it("compiles UMG-like settings DSL into WidgetDesign IR", () => {
    const result = compileWidgetDsl({
      source: `
        <Canvas name="SettingsScreen">
          <Border name="SettingsFrame" width={1120} height={640} padding={[28,24,28,24]} background="panel">
            <VerticalBox name="SettingsFrameContent" fill>
              <Text name="TitleText" value="SETTINGS" size={40} />
              <Tabs name="SettingsTabs" fill sidebarWidth={176} buttonHeight={44} sidebarGap={12} contentPadding={[28,0,0,0]}>
                <Tab id="video" label="Video" buttonName="VideoTabButton" pageName="VideoSettingsPage">
                  <Panel name="VideoSettingsPanel" background="panelSoft" padding={[24,22,24,22]}>
                    <SettingRow label="Brightness" labelWidth={230} controlWidth={430} margin={[0,0,0,16]}>
                      <Slider name="BrightnessSlider" value={0.62} />
                    </SettingRow>
                    <SettingRow label="Fullscreen" labelWidth={230} controlWidth={80}>
                      <Toggle name="FullscreenCheckBox" checked />
                    </SettingRow>
                  </Panel>
                </Tab>
              </Tabs>
            </VerticalBox>
          </Border>
        </Canvas>
      `
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.design.root).toEqual(
      expect.objectContaining({
        type: "screen",
        name: "SettingsScreen"
      })
    );
    const frame = result.design.root.children?.[0];
    expect(frame).toEqual(
      expect.objectContaining({
        type: "panel",
        name: "SettingsFrame",
        style: expect.objectContaining({
          width: 1120,
          height: 640,
          padding: [28, 24, 28, 24],
          backgroundColor: "panel"
        })
      })
    );
    const content = frame?.children?.[0];
    const tabs = content?.children?.find((child) => child.name === "SettingsTabs");
    expect(tabs).toEqual(
      expect.objectContaining({
        type: "tabs",
        style: expect.objectContaining({
          fill: true,
          sidebarWidth: 176,
          buttonHeight: 44,
          sidebarGap: 12,
          contentPadding: [28, 0, 0, 0]
        }),
        tabs: [
          expect.objectContaining({
            id: "video",
            label: "Video",
            buttonName: "VideoTabButton",
            pageName: "VideoSettingsPage"
          })
        ]
      })
    );
    const pagePanel = tabs?.tabs?.[0]?.children?.[0];
    const brightnessRow = pagePanel?.children?.[0];
    expect(brightnessRow).toEqual(
      expect.objectContaining({
        type: "row",
        name: "BrightnessRow",
        style: expect.objectContaining({
          labelWidth: 230,
          controlWidth: 430,
          margin: [0, 0, 0, 16]
        }),
        children: [
          expect.objectContaining({ type: "text", name: "BrightnessLabel", text: "Brightness" }),
          expect.objectContaining({ type: "slider", name: "BrightnessSlider", value: 0.62 })
        ]
      })
    );
  });

  it("reports unsupported components as diagnostics without throwing", () => {
    const result = compileWidgetDsl({
      source: '<Canvas name="Screen"><Mystery name="Unknown" /></Canvas>'
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_COMPONENT" })
      ])
    );
    expect(result.design.root.children?.[0]).toEqual(
      expect.objectContaining({
        type: "panel",
        name: "Unknown"
      })
    );
  });

  it("supports explicit SettingRow label children and common style aliases used by examples", () => {
    const result = compileWidgetDsl({
      source: `
        <Canvas name="SettingsScreen" width={1280} height={720}>
          <Panel name="VideoSettingsPanel" backgroundColor="panelSoft" padding={[24,22,24,22]}>
            <SettingRow name="ResolutionRow" labelWidth={230} controlWidth={430}>
              <Text name="ResolutionLabel" text="Resolution" fontSize={20} />
              <Select name="ResolutionComboBox" options={["1920 x 1080", "2560 x 1440"]} />
            </SettingRow>
          </Panel>
        </Canvas>
      `
    });

    expect(result.design.viewport).toEqual({ width: 1280, height: 720 });
    const panel = result.design.root.children?.[0];
    expect(panel?.style).toEqual(
      expect.objectContaining({
        backgroundColor: "panelSoft",
        padding: [24, 22, 24, 22]
      })
    );
    const row = panel?.children?.[0];
    expect(row?.children).toEqual([
      expect.objectContaining({
        type: "text",
        name: "ResolutionLabel",
        text: "Resolution",
        style: expect.objectContaining({ fontSize: 20 })
      }),
      expect.objectContaining({
        type: "select",
        name: "ResolutionComboBox",
        options: ["1920 x 1080", "2560 x 1440"]
      })
    ]);
  });

  it("ignores XML and JSX comments, including tag-shaped content", () => {
    const result = compileWidgetDsl({
      source: `
        <!-- <Canvas name="CommentedOut"><Text text="ignored" /></Canvas> -->
        <Canvas name="CommentSafeScreen">
          {/* <Mystery name="IgnoredComponent" /> */}
          <Text name="TitleText" text="Visible" />
        </Canvas>
      `
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.design.root).toEqual(
      expect.objectContaining({
        type: "screen",
        name: "CommentSafeScreen",
        children: [
          expect.objectContaining({
            type: "text",
            name: "TitleText",
            text: "Visible"
          })
        ]
      })
    );
  });

  it("reports unsupported attributes on known components", () => {
    const result = compileWidgetDsl({
      source: '<Canvas name="Screen"><Button name="ApplyButton" text="Apply" onClick="ApplySettings" /></Canvas>'
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "UNSUPPORTED_ATTRIBUTE",
        message: expect.stringContaining("<Button>")
      })
    ]);
    expect(result.diagnostics[0]?.message).toContain("onClick");
  });

  it("supports a Widget wrapper with Theme and exactly one Canvas child", () => {
    const result = compileWidgetDsl({
      source: `
        <Widget name="InventoryWidget">
          <Theme background="#001122" panel="#223344" primary="#44AA88" text="#FFFFFF" spacing={20} />
          <Canvas name="InventoryScreen" width={1024} height={768}>
            <Text name="HeadingText" text="Inventory" />
          </Canvas>
        </Widget>
      `
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.design).toEqual(
      expect.objectContaining({
        name: "InventoryWidget",
        viewport: { width: 1024, height: 768 },
        theme: {
          colors: {
            background: "#001122",
            panel: "#223344",
            primary: "#44AA88",
            text: "#FFFFFF"
          },
          spacing: 20
        },
        root: expect.objectContaining({
          type: "screen",
          name: "InventoryScreen"
        })
      })
    );
  });

  it("compiles advanced semantic components into WidgetDesign IR", () => {
    const result = compileWidgetDsl({
      source: `
        <Widget name="AdvancedHud">
          <Canvas name="HudScreen" width={1280} height={720}>
            <HUDLayer name="HudLayer">
              <SafeZone name="HudSafeZone">
                <Toolbar name="TopToolbar">
                  <IconButton name="InventoryButton" icon="bag" text="Inventory" variant="primary" />
                  <ProgressBar name="HealthBar" value={0.75} width={240} height={18} />
                </Toolbar>
                <KeyValueRow name="AmmoRow" label="Ammo" value="24 / 90" labelWidth={120} controlWidth={180} />
                <InventoryGrid name="InventoryGrid" columns={4}>
                  <Image name="SlotImage" source="/Game/MistyPlanet/UI/T_Slot" width={64} height={64} />
                </InventoryGrid>
                <ConfirmDialog name="QuitDialog" title="Quit?" message="Return to base?" confirmText="Yes" cancelText="No" />
              </SafeZone>
            </HUDLayer>
          </Canvas>
        </Widget>
      `
    });

    expect(result.diagnostics).toEqual([]);
    const hudLayer = result.design.root.children?.[0];
    const safeZone = hudLayer?.children?.[0];
    const toolbar = safeZone?.children?.[0];
    const inventoryGrid = safeZone?.children?.[2];
    const confirmDialog = safeZone?.children?.[3];

    expect(hudLayer).toEqual(expect.objectContaining({ type: "hudLayer", name: "HudLayer" }));
    expect(safeZone).toEqual(expect.objectContaining({ type: "safeZone", name: "HudSafeZone" }));
    expect(toolbar).toEqual(
      expect.objectContaining({
        type: "toolbar",
        name: "TopToolbar",
        children: [
          expect.objectContaining({ type: "iconButton", name: "InventoryButton", text: "Inventory" }),
          expect.objectContaining({ type: "progress", name: "HealthBar", value: 0.75 })
        ]
      })
    );
    expect(inventoryGrid).toEqual(
      expect.objectContaining({
        type: "inventoryGrid",
        name: "InventoryGrid",
        style: expect.objectContaining({ columns: 4 }),
        children: [expect.objectContaining({ type: "image", name: "SlotImage" })]
      })
    );
    expect(confirmDialog).toEqual(
      expect.objectContaining({
        type: "confirmDialog",
        name: "QuitDialog",
        children: expect.arrayContaining([
          expect.objectContaining({ type: "text", name: "QuitDialogTitleText", text: "Quit?" }),
          expect.objectContaining({ type: "text", name: "QuitDialogMessageText", text: "Return to base?" })
        ])
      })
    );
  });

  it("keeps Canvas without width and height as fullscreen fill-parent design", () => {
    const result = compileWidgetDsl({
      source: `
        <Widget name="FullscreenSettings">
          <Canvas name="SettingsScreen">
            <Border name="SettingsRoot" fill backgroundColor="panel">
              <Text name="TitleText" text="设置" variant="title" />
            </Border>
          </Canvas>
        </Widget>
      `
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.design.viewport).toBeUndefined();
    expect(result.design.root.name).toBe("SettingsScreen");
    expect(result.design.root.children?.[0]?.style?.fill).toBe(true);
  });
});
