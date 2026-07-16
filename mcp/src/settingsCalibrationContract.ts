/**
 * Shared, inspectable contract for synchronising the approved system
 * calibration web design into UMG. It contains only native UMG concepts and
 * design tokens; it never references or mutates a game asset.
 */
export const settingsCalibrationStyleContract = {
  id: "misty-calibration",
  viewport: { width: 1920, height: 1080 },
  theme: {
    void: "#050B0E",
    surface: "#092126",
    recess: "#102F34",
    mint: "#00E0C0",
    soft: "#91ADA8",
    text: "#ECFFFB",
    danger: "#E0A356",
    panelLine: "#97FFEF3B"
  },
  nativeMappings: {
    shell: "CanvasPanel + Overlay + Image/Border layers",
    framedPanel: "Border + native brush/color + corner decoration Images",
    moduleRail: "VerticalBox with Button/Border state layers",
    pageContent: "WidgetSwitcher + ScrollBox",
    settingRow: "HorizontalBox + SizeBox label/control slots",
    telemetry: "Border + TextBlock + ProgressBar",
    signal: "Overlay/HorizontalBox with Image bars or a ProgressBar",
    controls: "Slider, CheckBox, ComboBoxString with explicit visual tokens"
  },
  requiredNodes: [
    "SettingsScreen",
    "Topline",
    "ModuleRail",
    "CalibratorPanel",
    "TelemetryDeck",
    "ApplyButton"
  ],
  fidelityGate: {
    baselineViewport: "1920x1080",
    requiredArtifacts: ["web-baseline.png", "umg-designer.png", "overlay.png", "pixel-diff.png"],
    comparison: "same viewport, 100% scale, normal/default interaction state",
    passRule: "No unreviewed geometry, typography, color, or hierarchy mismatch remains."
  }
} as const;

export type SettingsCalibrationStyleContract = typeof settingsCalibrationStyleContract;
