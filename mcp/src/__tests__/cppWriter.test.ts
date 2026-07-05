import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeWidgetCpp } from "../cppWriter.js";

describe("writeWidgetCpp", () => {
  it("writes generated C++ into the project UI Generated folders", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "misty-ui-writer-"));

    try {
      const result = writeWidgetCpp(
        {
          className: "USettingsWidget",
          category: "Settings",
          functions: [{ name: "HandleVolumeChanged" }],
          bindings: [{ type: "USlider", name: "VolumeSlider" }]
        },
        { projectRoot }
      );

      expect(result.headerPath).toBe(
        join(projectRoot, "Source", "MistyPlanet", "Public", "UI", "Generated", "SettingsWidget.h")
      );
      expect(result.cppPath).toBe(
        join(projectRoot, "Source", "MistyPlanet", "Private", "UI", "Generated", "SettingsWidget.cpp")
      );
      expect(readFileSync(result.headerPath, "utf8")).toContain("class MISTYPLANET_API USettingsWidget");
      expect(readFileSync(result.cppPath, "utf8")).toContain("void USettingsWidget::HandleVolumeChanged()");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects a header path outside the project public UI Generated folder", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "misty-ui-writer-"));

    try {
      expect(() =>
        writeWidgetCpp(
          {
            className: "USettingsWidget",
            category: "Settings",
            functions: [],
            bindings: [],
            headerPath: join(projectRoot, "Source", "MistyPlanet", "Public", "UI", "SettingsWidget.h")
          },
          { projectRoot }
        )
      ).toThrow(/Public\/UI\/Generated/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects a cpp path outside the project private UI Generated folder", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "misty-ui-writer-"));

    try {
      expect(() =>
        writeWidgetCpp(
          {
            className: "USettingsWidget",
            category: "Settings",
            functions: [],
            bindings: [],
            cppPath: join(projectRoot, "Source", "MistyPlanet", "Private", "UI", "SettingsWidget.cpp")
          },
          { projectRoot }
        )
      ).toThrow(/Private\/UI\/Generated/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
