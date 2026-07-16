export type WidgetDslPropType = "string" | "number" | "boolean" | "array" | "enum" | "color" | "any";

export interface WidgetDslPropSpec {
  type: WidgetDslPropType;
  values?: readonly string[];
  description?: string;
}

export interface WidgetDslComponentSpec {
  name: string;
  status: "supported" | "planned";
  description: string;
  props: Record<string, WidgetDslPropSpec>;
}

function prop(type: WidgetDslPropType, description?: string, values?: readonly string[]): WidgetDslPropSpec {
  return {
    type,
    ...(description ? { description } : {}),
    ...(values ? { values } : {})
  };
}

const commonIdentityProps = {
  name: prop("string", "Stable Unreal widget name."),
  id: prop("string", "Stable logical identifier.")
};

const commonStyleProps = {
  width: prop("number", "Desired width."),
  height: prop("number", "Desired height."),
  padding: prop("array", "Padding tuple."),
  margin: prop("array", "Margin tuple."),
  alignSelf: prop("enum", "Horizontal slot alignment.", ["start", "center", "end", "stretch"]),
  valignSelf: prop("enum", "Vertical slot alignment.", ["start", "center", "end", "stretch"]),
  fill: prop("boolean", "Fill available layout space."),
  auto: prop("boolean", "Size to content."),
  grow: prop("boolean", "Take proportional layout space."),
  background: prop("color", "Theme color key or literal color."),
  backgroundColor: prop("color", "Theme color key or literal color.")
};

// These map directly to properties already accepted by the WidgetBridge layout
// payload.  Keep them explicit: a rich visual contract must not silently drop
// a style that is needed to reproduce an approved web baseline.
const nativeVisualProps = {
  color: prop("color", "Foreground/tint color."),
  brushColor: prop("color", "Native Slate brush tint."),
  shadowColor: prop("color", "Text shadow color."),
  shadowOffset: prop("array", "Text shadow x/y offset."),
  justification: prop("enum", "Text justification.", ["Left", "Center", "Right"]),
  opacity: prop("number", "Render opacity from 0 to 1."),
  zIndex: prop("number", "Canvas z-order for absolute layers."),
  anchors: prop("any", "Canvas anchor object with minimum/maximum pairs."),
  position: prop("array", "Canvas position x/y."),
  canvasSize: prop("array", "Canvas size x/y (kept distinct from component size aliases)."),
  minValue: prop("number", "Native slider minimum."),
  maxValue: prop("number", "Native slider maximum."),
  barColor: prop("color", "Slider bar tint contract."),
  handleColor: prop("color", "Slider handle tint contract."),
  activeColor: prop("color", "Active control tint contract."),
  inactiveColor: prop("color", "Inactive control tint contract."),
  asset: prop("string", "Native UMG brush/material asset path.")
};

export const componentRegistry = {
  Widget: {
    name: "Widget",
    status: "supported",
    description: "Document wrapper containing optional Theme and one Canvas.",
    props: {
      name: commonIdentityProps.name
    }
  },
  Theme: {
    name: "Theme",
    status: "supported",
    description: "Theme token overrides for the widget design.",
    props: {
      background: prop("color", "Background color token."),
      panel: prop("color", "Panel color token."),
      primary: prop("color", "Primary accent color token."),
      secondary: prop("color", "Secondary accent color token."),
      text: prop("color", "Primary text color token."),
      muted: prop("color", "Muted text color token."),
      void: prop("color", "Near-black backdrop token."),
      surface: prop("color", "Primary calibrated panel token."),
      recess: prop("color", "Recessed control token."),
      mint: prop("color", "Calibration accent token."),
      soft: prop("color", "Secondary telemetry text token."),
      danger: prop("color", "Warning/action token."),
      preset: prop("enum", "Named native visual contract.", ["mistyCalibration"]),
      spacing: prop("number", "Base spacing unit.")
    }
  },
  Canvas: {
    name: "Canvas",
    status: "supported",
    description: "Root screen or explicit absolute-layout container.",
    props: {
      ...commonIdentityProps,
      width: commonStyleProps.width,
      height: commonStyleProps.height
    }
  },
  Border: {
    name: "Border",
    status: "supported",
    description: "Frame or panel with background and spacing.",
    props: {
      ...commonIdentityProps,
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Panel: {
    name: "Panel",
    status: "supported",
    description: "Semantic content panel alias.",
    props: {
      ...commonIdentityProps,
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  VerticalBox: {
    name: "VerticalBox",
    status: "supported",
    description: "Ordered vertical layout container.",
    props: {
      ...commonIdentityProps,
      size: prop("number", "Gap alias."),
      gap: prop("number", "Spacing between children."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  HorizontalBox: {
    name: "HorizontalBox",
    status: "supported",
    description: "Ordered horizontal layout container.",
    props: {
      ...commonIdentityProps,
      size: prop("number", "Gap alias."),
      gap: prop("number", "Spacing between children."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Tabs: {
    name: "Tabs",
    status: "supported",
    description: "Tab button column plus switcher pages.",
    props: {
      name: commonIdentityProps.name,
      sidebarWidth: prop("number", "Width of the tab button column."),
      buttonHeight: prop("number", "Height of each tab button."),
      sidebarGap: prop("number", "Spacing between tab buttons."),
      contentPadding: prop("array", "Padding between buttons and content page."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Tab: {
    name: "Tab",
    status: "supported",
    description: "Page descriptor child for Tabs.",
    props: {
      id: commonIdentityProps.id,
      label: prop("string", "Visible tab label."),
      buttonName: prop("string", "Generated tab button widget name."),
      pageName: prop("string", "Generated tab content page widget name.")
    }
  },
  SettingRow: {
    name: "SettingRow",
    status: "supported",
    description: "Two-column label and control row.",
    props: {
      name: commonIdentityProps.name,
      label: prop("string", "Default label text."),
      labelName: prop("string", "Generated label widget name."),
      labelWidth: prop("number", "Width of the label column."),
      controlWidth: prop("number", "Width of the control column."),
      controlFill: prop("boolean", "Whether the control column fills remaining space."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Text: {
    name: "Text",
    status: "supported",
    description: "TextBlock content.",
    props: {
      ...commonIdentityProps,
      value: prop("string", "Text content alias."),
      text: prop("string", "Text content."),
      label: prop("string", "Text content alias."),
      variant: prop("enum", "Text style variant.", ["title", "body", "muted"]),
      muted: prop("boolean", "Muted text style shortcut."),
      size: prop("number", "Font size alias."),
      fontSize: prop("number", "Font size."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Button: {
    name: "Button",
    status: "supported",
    description: "Button with text child.",
    props: {
      ...commonIdentityProps,
      text: prop("string", "Button label."),
      value: prop("string", "Button label alias."),
      label: prop("string", "Button label alias."),
      variant: prop("enum", "Button visual variant.", ["primary", "secondary", "ghost"]),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Slider: {
    name: "Slider",
    status: "supported",
    description: "Normalized slider control.",
    props: {
      ...commonIdentityProps,
      value: prop("number", "Initial normalized value."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Toggle: {
    name: "Toggle",
    status: "supported",
    description: "CheckBox control.",
    props: {
      ...commonIdentityProps,
      checked: prop("boolean", "Initial checked state."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Select: {
    name: "Select",
    status: "supported",
    description: "ComboBoxString control.",
    props: {
      ...commonIdentityProps,
      options: prop("array", "String option list."),
      ...commonStyleProps,
      ...nativeVisualProps
    }
  },
  Spacer: {
    name: "Spacer",
    status: "planned",
    description: "Intentional empty layout space.",
    props: {
      ...commonIdentityProps,
      ...commonStyleProps
    }
  },
  Overlay: {
    name: "Overlay",
    status: "planned",
    description: "Layered child container.",
    props: {
      ...commonIdentityProps,
      ...commonStyleProps
    }
  },
  SafeZone: {
    name: "SafeZone",
    status: "planned",
    description: "Safe-zone layout wrapper.",
    props: {
      ...commonIdentityProps,
      padLeft: prop("boolean", "Apply left safe padding."),
      padRight: prop("boolean", "Apply right safe padding."),
      padTop: prop("boolean", "Apply top safe padding."),
      padBottom: prop("boolean", "Apply bottom safe padding."),
      ...commonStyleProps
    }
  },
  Image: {
    name: "Image",
    status: "supported",
    description: "Image brush widget.",
    props: {
      ...commonIdentityProps,
      src: prop("string", "Texture or brush asset reference."),
      source: prop("string", "Texture or brush asset reference."),
      previewSrc: prop("string", "Local image URL used only by the browser review console."),
      tint: prop("color", "Image tint."),
      ...commonStyleProps
    }
  },
  ProgressBar: {
    name: "ProgressBar",
    status: "supported",
    description: "Progress indicator.",
    props: {
      ...commonIdentityProps,
      value: prop("number", "Current normalized progress."),
      fillColor: prop("color", "Fill color."),
      ...commonStyleProps
    }
  },
  IconButton: {
    name: "IconButton",
    status: "supported",
    description: "Button with icon and optional label.",
    props: {
      ...commonIdentityProps,
      icon: prop("string", "Icon key or asset reference."),
      text: prop("string", "Optional label."),
      variant: prop("enum", "Button visual variant.", ["primary", "secondary", "ghost"]),
      ...commonStyleProps
    }
  },
  KeyValueRow: {
    name: "KeyValueRow",
    status: "supported",
    description: "Read-only key/value display row.",
    props: {
      ...commonIdentityProps,
      label: prop("string", "Key label alias."),
      value: prop("string", "Value label alias."),
      keyText: prop("string", "Key label."),
      valueText: prop("string", "Value label."),
      labelWidth: prop("number", "Width of the key column."),
      controlWidth: prop("number", "Width of the value column."),
      ...commonStyleProps
    }
  },
  Modal: {
    name: "Modal",
    status: "supported",
    description: "Layered modal panel.",
    props: {
      ...commonIdentityProps,
      title: prop("string", "Modal title."),
      open: prop("boolean", "Initial visibility."),
      ...commonStyleProps
    }
  },
  Toolbar: {
    name: "Toolbar",
    status: "supported",
    description: "Horizontal action group.",
    props: {
      ...commonIdentityProps,
      gap: prop("number", "Spacing between actions."),
      ...commonStyleProps
    }
  },
  CardList: {
    name: "CardList",
    status: "supported",
    description: "Repeated card layout container.",
    props: {
      ...commonIdentityProps,
      items: prop("array", "Card item data."),
      columns: prop("number", "Preferred column count."),
      ...commonStyleProps
    }
  },
  InventoryGrid: {
    name: "InventoryGrid",
    status: "supported",
    description: "Grid for item slots.",
    props: {
      ...commonIdentityProps,
      items: prop("array", "Inventory item data."),
      columns: prop("number", "Grid column count."),
      slotSize: prop("number", "Square slot size."),
      selectedIndex: prop("number", "Initially selected slot index."),
      ...commonStyleProps
    }
  },
  ConfirmDialog: {
    name: "ConfirmDialog",
    status: "supported",
    description: "Confirmation dialog pattern.",
    props: {
      ...commonIdentityProps,
      title: prop("string", "Dialog title."),
      message: prop("string", "Dialog body text."),
      confirmText: prop("string", "Confirm button label."),
      cancelText: prop("string", "Cancel button label."),
      destructive: prop("boolean", "Use destructive action styling."),
      ...commonStyleProps
    }
  },
  HUDLayer: {
    name: "HUDLayer",
    status: "supported",
    description: "Named gameplay HUD layer.",
    props: {
      ...commonIdentityProps,
      layer: prop("enum", "HUD layer role.", ["background", "world", "main", "overlay", "modal"]),
      zIndex: prop("number", "Layer order."),
      ...commonStyleProps
    }
  },
  CalibrationShell: {
    name: "CalibrationShell",
    status: "supported",
    description: "Fullscreen, layered system-calibration shell; compiles to native UMG Overlay.",
    props: { ...commonIdentityProps, ...commonStyleProps, ...nativeVisualProps }
  },
  PanelFrame: {
    name: "PanelFrame",
    status: "supported",
    description: "Border frame for calibrated panels, with optional native brush asset.",
    props: { ...commonIdentityProps, ...commonStyleProps, ...nativeVisualProps }
  },
  ModuleRail: {
    name: "ModuleRail",
    status: "supported",
    description: "Vertical settings module rail; compiles to native VerticalBox.",
    props: { ...commonIdentityProps, gap: prop("number", "Item gap."), ...commonStyleProps, ...nativeVisualProps }
  },
  TelemetryDeck: {
    name: "TelemetryDeck",
    status: "supported",
    description: "Styled live telemetry panel; compiles to native Border.",
    props: { ...commonIdentityProps, ...commonStyleProps, ...nativeVisualProps }
  },
  SignalMeter: {
    name: "SignalMeter",
    status: "supported",
    description: "Native ProgressBar semantic for live signal strength.",
    props: { ...commonIdentityProps, value: prop("number", "Normalized signal value."), ...commonStyleProps, ...nativeVisualProps }
  },
  Readout: {
    name: "Readout",
    status: "supported",
    description: "Monospace-style telemetry text; compiles to native TextBlock.",
    props: { ...commonIdentityProps, text: prop("string", "Readout text."), value: prop("string", "Readout text alias."), fontSize: prop("number", "Font size."), ...commonStyleProps, ...nativeVisualProps }
  },
  SectionLabel: {
    name: "SectionLabel",
    status: "supported",
    description: "Compact section heading; compiles to native TextBlock.",
    props: { ...commonIdentityProps, text: prop("string", "Label text."), value: prop("string", "Label text alias."), ...commonStyleProps, ...nativeVisualProps }
  },
  StatusBadge: {
    name: "StatusBadge",
    status: "supported",
    description: "Compact online/status badge; compiles to native Border with text child.",
    props: { ...commonIdentityProps, text: prop("string", "Badge text."), value: prop("string", "Badge text alias."), ...commonStyleProps, ...nativeVisualProps }
  }
} as const satisfies Record<string, WidgetDslComponentSpec>;

export type WidgetDslComponentName = keyof typeof componentRegistry;

export function getComponentSpec(name: string): WidgetDslComponentSpec | undefined {
  return componentRegistry[name as WidgetDslComponentName];
}

export function isKnownComponent(name: string): name is WidgetDslComponentName {
  return getComponentSpec(name) !== undefined;
}

export function getUnsupportedProps(componentName: string, attrs: Record<string, unknown>): string[] {
  const spec = getComponentSpec(componentName);
  if (!spec) {
    return Object.keys(attrs);
  }

  return Object.keys(attrs).filter((attr) => spec.props[attr] === undefined);
}
