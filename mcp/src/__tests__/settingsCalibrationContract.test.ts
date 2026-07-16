import { describe, expect, it } from "vitest";

import { compileWidgetDesign } from "../designCompiler.js";
import { settingsCalibrationStyleContract } from "../settingsCalibrationContract.js";
import { dispatchTool, mcpTools } from "../tools.js";
import { compileWidgetDsl } from "../widgetDsl.js";
import { componentRegistry } from "../widgetDslRegistry.js";

describe("Misty calibration UMG style contract", () => {
  it("publishes the approved visual tokens, landmarks, and screenshot-diff artifacts", () => {
    expect(settingsCalibrationStyleContract.viewport).toEqual({ width: 1920, height: 1080 });
    expect(settingsCalibrationStyleContract.theme).toMatchObject({
      void: "#050B0E",
      mint: "#00E0C0",
      text: "#ECFFFB"
    });
    expect(settingsCalibrationStyleContract.requiredNodes).toEqual(
      expect.arrayContaining(["SettingsScreen", "ModuleRail", "ApplyButton"])
    );
    expect(settingsCalibrationStyleContract.fidelityGate.requiredArtifacts).toEqual(
      expect.arrayContaining(["web-baseline.png", "umg-designer.png", "overlay.png", "pixel-diff.png"])
    );
  });

  it("exposes the contract through a read-only MCP tool", async () => {
    expect(mcpTools.map((tool) => tool.name)).toContain("ue.ui.get_style_contract");
    const result = await dispatchTool("ue.ui.get_style_contract", {});
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(JSON.stringify(result.content[0])).toContain("misty-calibration");
  });

  it("recognizes calibration semantic nodes without treating them as unsupported custom widgets", () => {
    expect(Object.keys(componentRegistry)).toEqual(
      expect.arrayContaining([
        "CalibrationShell",
        "PanelFrame",
        "ModuleRail",
        "TelemetryDeck",
        "SignalMeter",
        "Readout",
        "SectionLabel",
        "StatusBadge"
      ])
    );

    const dsl = compileWidgetDsl({
      source: `
        <Widget name="CalibrationSettings">
          <Theme preset="mistyCalibration" />
          <Canvas name="SettingsScreen" width={1920} height={1080}>
            <CalibrationShell name="SystemLayer" fill>
              <PanelFrame name="CalibratorPanel" background="surface" anchors={{"minimum":[0,0],"maximum":[1,1]}} canvasSize={[0,0]}>
                <ModuleRail name="ModuleRail"><SectionLabel name="AudioSection" text="AUDIO" color="mint" /></ModuleRail>
                <TelemetryDeck name="TelemetryDeck"><SignalMeter name="SignalStrength" value={0.74} /></TelemetryDeck>
                <Readout name="PeakReadout" text="-3.2 dB" color="mint" />
                <StatusBadge name="OnlineBadge" text="ONLINE" background="recess" />
              </PanelFrame>
            </CalibrationShell>
          </Canvas>
        </Widget>`
    });

    expect(dsl.diagnostics).toEqual([]);
    expect(dsl.design.theme?.colors).toMatchObject({ mint: "#00E0C0", surface: "#092126" });
    const compiled = compileWidgetDesign({ design: dsl.design });
    expect(compiled.lossReport).toEqual([]);
    expect(JSON.stringify(compiled.layout)).toContain('"type":"Overlay"');
    expect(JSON.stringify(compiled.layout)).toContain('"type":"ProgressBar"');
  });

  it("retains native bridge visual properties and emits the bridge checkbox field", () => {
    const result = compileWidgetDsl({
      source: `<Widget name="Controls"><Theme preset="mistyCalibration" /><Canvas name="SettingsScreen"><Toggle name="SpatialAudio" checked activeColor="mint" /><Slider name="MasterVolume" value={0.78} minValue={0} maxValue={1} barColor="recess" handleColor="mint" /></Canvas></Widget>`
    });

    expect(result.diagnostics).toEqual([]);
    const compiled = compileWidgetDesign({ design: result.design });
    const serialized = JSON.stringify(compiled.layout);
    expect(serialized).toContain('"isChecked":true');
    expect(serialized).toContain('"barColor":"#102F34"');
    expect(serialized).toContain('"handleColor":"#00E0C0"');
  });
});
