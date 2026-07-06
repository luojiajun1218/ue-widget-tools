import { describe, expect, it } from "vitest";

import {
  componentRegistry,
  getComponentSpec,
  getUnsupportedProps,
  isKnownComponent
} from "../widgetDslRegistry.js";

describe("Widget DSL component registry", () => {
  it("identifies known components and returns their specs", () => {
    expect(isKnownComponent("Canvas")).toBe(true);
    expect(isKnownComponent("InventoryGrid")).toBe(true);
    expect(isKnownComponent("Mystery")).toBe(false);

    expect(getComponentSpec("Button")).toEqual(
      expect.objectContaining({
        name: "Button",
        props: expect.objectContaining({
          name: expect.objectContaining({ type: "string" }),
          text: expect.objectContaining({ type: "string" }),
          variant: expect.objectContaining({ type: "enum" })
        })
      })
    );
    expect(getComponentSpec("Mystery")).toBeUndefined();
  });

  it("detects unsupported props for known components", () => {
    expect(
      getUnsupportedProps("Button", {
        name: "ApplyButton",
        text: "Apply",
        onClick: "ApplySettings",
        tooltip: "Save changes"
      })
    ).toEqual(["onClick", "tooltip"]);
  });

  it("treats every prop as unsupported for unknown components", () => {
    expect(getUnsupportedProps("Mystery", { name: "Unknown", width: 100 })).toEqual(["name", "width"]);
  });

  it("includes current and planned docs-critical components", () => {
    expect(Object.keys(componentRegistry)).toEqual(
      expect.arrayContaining([
        "Canvas",
        "Widget",
        "Theme",
        "Border",
        "Panel",
        "VerticalBox",
        "HorizontalBox",
        "Tabs",
        "Tab",
        "SettingRow",
        "Text",
        "Button",
        "Slider",
        "Toggle",
        "Select",
        "Spacer",
        "Overlay",
        "SafeZone",
        "Image",
        "ProgressBar",
        "IconButton",
        "KeyValueRow",
        "Modal",
        "Toolbar",
        "CardList",
        "InventoryGrid",
        "ConfirmDialog",
        "HUDLayer"
      ])
    );
  });
});
