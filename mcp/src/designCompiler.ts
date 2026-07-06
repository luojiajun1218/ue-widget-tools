export interface CompileWidgetDesignInput {
  design: WidgetDesign;
}

export interface WidgetDesign {
  name: string;
  viewport?: {
    width: number;
    height: number;
  };
  theme?: {
    colors?: Record<string, string>;
    spacing?: number;
  };
  root: DesignNode;
}

export interface DesignNode {
  type: string;
  name: string;
  tabs?: DesignTab[];
  text?: string;
  variant?: string;
  direction?: "horizontal" | "vertical";
  gap?: number;
  value?: number;
  checked?: boolean;
  options?: string[];
  style?: Record<string, unknown>;
  children?: DesignNode[];
}

export interface DesignTab {
  id: string;
  label: string;
  buttonName: string;
  pageName: string;
  children?: DesignNode[];
}

export interface CompileWidgetDesignResult {
  layout: {
    root: Record<string, unknown>;
  };
  html: string;
  lossReport: DesignLoss[];
}

export interface DesignLoss {
  code: string;
  node: string;
  message: string;
}

const DEFAULT_COLORS: Record<string, string> = {
  background: "#071017",
  panel: "#101821DD",
  primary: "#2E7D5B",
  secondary: "#5B6470",
  text: "#EAF2F8",
  muted: "#9AA7B2"
};

export function compileWidgetDesign(input: CompileWidgetDesignInput): CompileWidgetDesignResult {
  const theme = {
    colors: { ...DEFAULT_COLORS, ...(input.design.theme?.colors ?? {}) },
    spacing: input.design.theme?.spacing ?? 16,
    viewport: input.design.viewport ?? { width: 1280, height: 720 }
  };
  const lossReport: DesignLoss[] = [];

  return {
    layout: {
      root: compileNode(input.design.root, theme, lossReport, true)
    },
    html: renderHtml(input.design, theme, lossReport),
    lossReport
  };
}

function compileNode(
  node: DesignNode,
  theme: { colors: Record<string, string>; spacing: number; viewport: { width: number; height: number } },
  lossReport: DesignLoss[],
  isRoot = false
): Record<string, unknown> {
  collectStyleLosses(node, lossReport);

  const children = (node.children ?? []).map((child) => compileNode(child, theme, lossReport));
  const style = node.style ?? {};

  switch (node.type) {
    case "screen":
      return {
        type: "CanvasPanel",
        name: node.name,
        children: (node.children ?? []).map((child) => compileNode(child, theme, lossReport, true))
      };
    case "panel":
      return {
        type: "Border",
        name: node.name,
        backgroundColor: resolveColor(style.backgroundColor, theme.colors, "panel"),
        padding: normalizePadding(style.padding, theme.spacing),
        horizontalAlignment: "Fill",
        verticalAlignment: "Fill",
        ...(isRoot ? rootSlot(style, theme.viewport) : styleSlot(style)),
        children: wrapContentWidgetChildren(node.name, children)
      };
    case "stack":
      return {
        type: node.direction === "horizontal" ? "HorizontalBox" : "VerticalBox",
        name: node.name,
        ...styleSlot(style),
        children: compileStackChildren(node, theme, lossReport)
      };
    case "row":
      return {
        type: "HorizontalBox",
        name: node.name,
        ...slotForNode(node),
        children: compileRowChildren(node, theme, lossReport)
      };
    case "scroll":
      return {
        type: "ScrollBox",
        name: node.name,
        ...styleSlot(style),
        children
      };
    case "tabs":
      return compileTabsNode(node, theme, lossReport);
    case "text":
      return {
        type: "TextBlock",
        name: node.name,
        text: node.text ?? "",
        color: resolveColor(style.color, theme.colors, node.variant === "muted" ? "muted" : "text"),
        fontSize: numberOr(style.fontSize, node.variant === "title" ? 34 : 18),
        ...boxOverrides(style),
        ...styleSlot(style)
      };
    case "button":
      return {
        type: "Button",
        name: node.name,
        backgroundColor: resolveColor(style.backgroundColor, theme.colors, node.variant === "primary" ? "primary" : "secondary"),
        ...boxOverrides(style),
        ...styleSlot(style),
        children: [
          {
            type: "TextBlock",
            name: `${node.name}Text`,
            text: node.text ?? node.name,
            color: theme.colors.text,
            fontSize: 18
          }
        ]
      };
    case "slider":
      return {
        type: "Slider",
        name: node.name,
        value: node.value ?? 0,
        ...boxOverrides(style),
        ...styleSlot(style)
      };
    case "toggle":
      return {
        type: "CheckBox",
        name: node.name,
        checked: node.checked ?? false,
        ...boxOverrides(style),
        ...styleSlot(style)
      };
    case "select":
      return {
        type: "ComboBoxString",
        name: node.name,
        options: node.options ?? [],
        ...boxOverrides(style),
        ...styleSlot(style)
      };
    case "spacer":
      return {
        type: "Spacer",
        name: node.name
      };
    case "overlay":
    case "hudLayer":
      return {
        type: "Overlay",
        name: node.name,
        ...styleSlot(style),
        children
      };
    case "safeZone":
      return {
        type: "SafeZone",
        name: node.name,
        ...styleSlot(style),
        children
      };
    case "toolbar":
      return {
        type: "HorizontalBox",
        name: node.name,
        ...styleSlot(style),
        children: compileStackChildren({ ...node, type: "stack", direction: "horizontal" }, theme, lossReport)
      };
    case "cardList":
      return {
        type: "VerticalBox",
        name: node.name,
        ...styleSlot(style),
        children: compileStackChildren({ ...node, type: "stack", direction: "vertical" }, theme, lossReport)
      };
    case "inventoryGrid":
      return {
        type: "UniformGridPanel",
        name: node.name,
        columns: numberOr(style.columns, 4),
        ...styleSlot(style),
        children
      };
    case "image":
      return {
        type: "Image",
        name: node.name,
        brush: typeof node.text === "string" ? node.text : undefined,
        ...boxOverrides(style),
        ...styleSlot(style)
      };
    case "progress":
      return {
        type: "ProgressBar",
        name: node.name,
        percent: node.value ?? 0,
        ...boxOverrides(style),
        ...styleSlot(style)
      };
    case "iconButton":
      return {
        type: "Button",
        name: node.name,
        backgroundColor: resolveColor(style.backgroundColor, theme.colors, node.variant === "primary" ? "primary" : "secondary"),
        ...boxOverrides(style),
        ...styleSlot(style),
        children: [
          {
            type: "TextBlock",
            name: `${node.name}Text`,
            text: node.text ?? node.name,
            color: theme.colors.text,
            fontSize: 18,
            justification: "Center"
          }
        ]
      };
    case "modal":
    case "confirmDialog":
      return {
        type: "Border",
        name: node.name,
        backgroundColor: resolveColor(style.backgroundColor, theme.colors, "panel"),
        padding: normalizePadding(style.padding, theme.spacing),
        ...styleSlot(style),
        children: wrapContentWidgetChildren(node.name, children)
      };
    default:
      lossReport.push({
        code: "UNSUPPORTED_NODE_TYPE",
        node: node.name,
        message: `Design node type '${node.type}' is not supported by the prototype compiler.`
      });
      return {
        type: "Border",
        name: node.name,
        backgroundColor: "#FF00FF33",
        children
      };
  }
}

function wrapContentWidgetChildren(name: string, children: Record<string, unknown>[]): Record<string, unknown>[] {
  if (children.length <= 1) {
    return children;
  }

  return [
    {
      type: "VerticalBox",
      name: `${name}Content`,
      children
    }
  ];
}

function renderHtml(
  design: WidgetDesign,
  theme: { colors: Record<string, string>; spacing: number },
  lossReport: DesignLoss[]
): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(design.name)}</title>
  <style>
    body { margin: 0; background: ${theme.colors.background}; color: ${theme.colors.text}; font-family: Segoe UI, Arial, sans-serif; }
    .screen { min-height: 100vh; display: grid; place-items: center; }
    .panel { background: ${theme.colors.panel}; padding: 24px; min-width: 720px; }
    .stack.vertical { display: flex; flex-direction: column; gap: ${theme.spacing}px; }
    .stack.horizontal, .row { display: flex; align-items: center; gap: ${theme.spacing}px; }
    button { background: ${theme.colors.primary}; color: ${theme.colors.text}; border: 0; padding: 10px 18px; }
    .title { font-size: 34px; font-weight: 700; }
  </style>
</head>
<body>${renderHtmlNode(design.root, lossReport)}</body>
</html>`;
}

function renderHtmlNode(node: DesignNode, lossReport: DesignLoss[]): string {
  collectStyleLosses(node, lossReport);
  const children = (node.children ?? []).map((child) => renderHtmlNode(child, lossReport)).join("");
  const id = escapeHtml(node.name);

  switch (node.type) {
    case "screen":
      return `<main class="screen" data-node="${id}">${children}</main>`;
    case "panel":
      return `<section class="panel" data-node="${id}">${children}</section>`;
    case "stack":
      return `<div class="stack ${node.direction ?? "vertical"}" data-node="${id}">${children}</div>`;
    case "row":
      return `<div class="row" data-node="${id}">${children}</div>`;
    case "scroll":
      return `<div data-node="${id}" style="overflow:auto; max-height:520px">${children}</div>`;
    case "tabs":
      return renderTabsHtmlNode(node, lossReport);
    case "text":
      return `<div class="${node.variant === "title" ? "title" : "text"}" data-node="${id}">${escapeHtml(node.text ?? "")}</div>`;
    case "button":
      return `<button data-node="${id}">${escapeHtml(node.text ?? node.name)}</button>`;
    case "slider":
      return `<input data-node="${id}" type="range" min="0" max="1" step="0.01" value="${node.value ?? 0}">`;
    case "toggle":
      return `<input data-node="${id}" type="checkbox"${node.checked ? " checked" : ""}>`;
    case "select":
      return `<select data-node="${id}">${(node.options ?? []).map((option) => `<option>${escapeHtml(option)}</option>`).join("")}</select>`;
    case "spacer":
      return `<div data-node="${id}" style="height:${Number(node.style?.height ?? 16)}px"></div>`;
    default:
      return `<div data-node="${id}">${children}</div>`;
  }
}

function compileTabsNode(
  node: DesignNode,
  theme: { colors: Record<string, string>; spacing: number; viewport: { width: number; height: number } },
  lossReport: DesignLoss[]
): Record<string, unknown> {
  const tabs = node.tabs ?? [];
  const style = node.style ?? {};
  const sidebarWidth = numberOr(style.sidebarWidth, 176);
  const buttonHeight = numberOr(style.buttonHeight, 44);
  const sidebarGap = numberOr(style.sidebarGap, 10);
  const contentPadding = normalizePaddingOr(style.contentPadding, [20, 0, 0, 0]);
  return {
    type: "HorizontalBox",
    name: node.name,
    ...slotForNode(node),
    children: [
      {
        type: "VerticalBox",
        name: `${node.name}ButtonColumn`,
        slot: {
          size: { rule: "Automatic" },
          padding: [0, 0, 20, 0],
          horizontalAlignment: "Fill",
          verticalAlignment: "Fill"
        },
        children: tabs.map((tab, index) => ({
          type: "Button",
          name: tab.buttonName,
          isVariable: true,
          backgroundColor: index === 0 ? theme.colors.primary : theme.colors.secondary,
          slot: {
            padding: [0, 0, 0, sidebarGap],
            horizontalAlignment: "Fill",
            size: { rule: "Automatic" }
          },
          widthOverride: sidebarWidth,
          heightOverride: buttonHeight,
          children: [
            {
              type: "TextBlock",
              name: `${tab.buttonName}Text`,
              text: tab.label,
              color: theme.colors.text,
              fontSize: 18,
              justification: "Center"
            }
          ]
        }))
      },
      {
        type: "WidgetSwitcher",
        name: `${node.name}Switcher`,
        isVariable: true,
        slot: {
          size: { rule: "Fill", value: 1 },
          padding: contentPadding,
          horizontalAlignment: "Fill",
          verticalAlignment: "Fill"
        },
        children: tabs.map((tab) => ({
          type: "ScrollBox",
          name: tab.pageName,
          slot: {
            horizontalAlignment: "Fill",
            verticalAlignment: "Fill"
          },
          children: (tab.children ?? []).map((child) => compileNode(child, theme, lossReport))
        }))
      }
    ]
  };
}

function compileRowChildren(
  node: DesignNode,
  theme: { colors: Record<string, string>; spacing: number; viewport: { width: number; height: number } },
  lossReport: DesignLoss[]
): Record<string, unknown>[] {
  const children = node.children ?? [];
  const style = node.style ?? {};
  if (isSettingRow(node) && children.length >= 2) {
    const labelWidth = numberOr(style.labelWidth, 260);
    const controlWidth = numberOr(style.controlWidth, 320);
    const controlFill = style.controlFill === true;
    const controlNode = children[1];
    const isCompactToggle = (controlNode.type === "toggle" || controlNode.type === "checkbox") && controlWidth <= 64 && !controlFill;
    return [
      {
        type: "SizeBox",
        name: `${children[0].name}Box`,
        widthOverride: labelWidth,
        slot: {
          size: { rule: "Automatic" },
          verticalAlignment: "Center"
        },
        children: [compileNode(children[0], theme, lossReport)]
      },
      {
        type: "SizeBox",
        name: `${children[1].name}Box`,
        widthOverride: controlWidth,
        slot: {
          size: controlFill ? { rule: "Fill", value: 1 } : { rule: "Automatic" },
          ...(isCompactToggle ? { horizontalAlignment: "Left" } : {}),
          verticalAlignment: "Center"
        },
        children: [compileNode(children[1], theme, lossReport)]
      }
    ];
  }

  return children.map((child, index) =>
    withMergedSlot(compileNode(child, theme, lossReport), {
      ...(index > 0 ? { padding: [16, 0, 0, 0] } : {}),
      size: { rule: "Automatic" },
      verticalAlignment: "Center"
    })
  );
}

function isSettingRow(node: DesignNode): boolean {
  return /Row$/.test(node.name) && !/HeaderRow|ActionRow|BodyShell/.test(node.name);
}

function slotForNode(node: DesignNode): Record<string, unknown> {
  const styleDrivenSlot = styleSlot(node.style ?? {});
  const nameDrivenSlot = slotForNodeName(node.name);
  if ("slot" in styleDrivenSlot || "slot" in nameDrivenSlot) {
    return {
      slot: mergeSlots(
        (nameDrivenSlot.slot as Record<string, unknown> | undefined) ?? {},
        (styleDrivenSlot.slot as Record<string, unknown> | undefined) ?? {}
      )
    };
  }
  return {};
}

function slotForNodeName(name: string): Record<string, unknown> {
  if (name === "HeaderRow") {
    return {
      slot: {
        size: { rule: "Automatic" },
        padding: [0, 0, 0, 18],
        horizontalAlignment: "Fill"
      }
    };
  }

  if (name === "ActionRow") {
    return {
      slot: {
        size: { rule: "Automatic" },
        padding: [0, 18, 0, 0],
        horizontalAlignment: "Right"
      }
    };
  }

  if (/Tabs$/.test(name)) {
    return {
      slot: {
        size: { rule: "Fill", value: 1 },
        horizontalAlignment: "Fill",
        verticalAlignment: "Fill"
      }
    };
  }

  if (isSettingRow({ type: "row", name })) {
    return {
      slot: {
        size: { rule: "Automatic" },
        padding: [0, 0, 0, 12],
        horizontalAlignment: "Fill"
      }
    };
  }

  return {};
}

function styleSlot(style: Record<string, unknown>): Record<string, unknown> {
  const slot: Record<string, unknown> = {};
  const padding = paddingFromStyle(style.margin);
  const size = slotSizeFromStyle(style);

  if (padding) {
    slot.padding = padding;
  }
  if (size) {
    slot.size = size;
  }
  if (typeof style.alignSelf === "string") {
    slot.horizontalAlignment = toUmgAlignment(style.alignSelf);
  }
  if (typeof style.valignSelf === "string") {
    slot.verticalAlignment = toUmgAlignment(style.valignSelf);
  }

  return Object.keys(slot).length > 0 ? { slot } : {};
}

function slotSizeFromStyle(style: Record<string, unknown>): unknown {
  if (style.fill === true || style.grow === true) {
    return { rule: "Fill", value: numberOr(style.growValue, 1) };
  }
  if (style.auto === true) {
    return { rule: "Automatic" };
  }
  return undefined;
}

function compileStackChildren(
  node: DesignNode,
  theme: { colors: Record<string, string>; spacing: number; viewport: { width: number; height: number } },
  lossReport: DesignLoss[]
): Record<string, unknown>[] {
  const gap = numberOr(node.gap, 0);
  return (node.children ?? []).map((child, index) => {
    const compiled = compileNode(child, theme, lossReport);
    if (gap <= 0 || index === 0) {
      return compiled;
    }
    return withMergedSlot(compiled, {
      padding: node.direction === "horizontal" ? [gap, 0, 0, 0] : [0, gap, 0, 0]
    });
  });
}

function boxOverrides(style: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (typeof style.width === "number") {
    overrides.widthOverride = style.width;
  }
  if (typeof style.height === "number") {
    overrides.heightOverride = style.height;
  }
  return overrides;
}

function withMergedSlot(widget: Record<string, unknown>, slot: Record<string, unknown>): Record<string, unknown> {
  return {
    ...widget,
    slot: mergeSlots((widget.slot as Record<string, unknown> | undefined) ?? {}, slot)
  };
}

function mergeSlots(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  return {
    ...base,
    ...override
  };
}

function toUmgAlignment(value: string): string {
  switch (value) {
    case "start":
    case "left":
    case "top":
      return "Left";
    case "end":
    case "right":
    case "bottom":
      return "Right";
    case "center":
      return "Center";
    case "stretch":
    case "fill":
      return "Fill";
    default:
      return value;
  }
}

function renderTabsHtmlNode(node: DesignNode, lossReport: DesignLoss[]): string {
  const tabs = node.tabs ?? [];
  const buttons = tabs
    .map((tab, index) => `<button class="tab-button${index === 0 ? " active" : ""}" data-tab="${escapeHtml(tab.id)}" data-node="${escapeHtml(tab.buttonName)}">${escapeHtml(tab.label)}</button>`)
    .join("");
  const pages = tabs
    .map((tab, index) => `<div class="settings-page" data-page="${escapeHtml(tab.id)}" data-node="${escapeHtml(tab.pageName)}"${index === 0 ? "" : " hidden"}>${(tab.children ?? []).map((child) => renderHtmlNode(child, lossReport)).join("")}</div>`)
    .join("");

  return `<div class="tabs" data-node="${escapeHtml(node.name)}"><nav>${buttons}</nav><section>${pages}</section></div>`;
}

function collectStyleLosses(node: DesignNode, lossReport: DesignLoss[]): void {
  if (node.style?.blur !== undefined) {
    addLossOnce(lossReport, {
      code: "UNSUPPORTED_STYLE_BLUR",
      node: node.name,
      message: "CSS blur is not mapped to UMG in this prototype."
    });
  }
  if (node.style?.boxShadow !== undefined) {
    addLossOnce(lossReport, {
      code: "UNSUPPORTED_STYLE_BOX_SHADOW",
      node: node.name,
      message: "CSS box-shadow is not mapped to UMG in this prototype."
    });
  }
}

function addLossOnce(lossReport: DesignLoss[], loss: DesignLoss): void {
  if (!lossReport.some((item) => item.code === loss.code && item.node === loss.node)) {
    lossReport.push(loss);
  }
}

function resolveColor(value: unknown, colors: Record<string, string>, fallbackKey: string): string {
  if (typeof value === "string") {
    return colors[value] ?? value;
  }
  return colors[fallbackKey] ?? "#FFFFFFFF";
}

function normalizePadding(value: unknown, fallback: number): number[] {
  if (typeof value === "number") {
    return [value, value, value, value];
  }
  if (Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number")) {
    return value as number[];
  }
  return [fallback, fallback, fallback, fallback];
}

function normalizePaddingOr(value: unknown, fallback: number[]): number[] {
  if (typeof value === "number") {
    return [value, value, value, value];
  }
  if (Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number")) {
    return value as number[];
  }
  return fallback;
}

function paddingFromStyle(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizePaddingOr(value, [0, 0, 0, 0]);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rootSlot(style: Record<string, unknown>, viewport: { width: number; height: number }): Record<string, unknown> {
  const width = numberOr(style.width, Math.min(1040, Math.max(320, viewport.width - 160)));
  const height = numberOr(style.height, Math.min(620, Math.max(240, viewport.height - 100)));
  return {
    slot: {
      anchors: { minimum: [0.5, 0.5], maximum: [0.5, 0.5] },
      alignment: [0.5, 0.5],
      size: [width, height],
      zOrder: 1
    }
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
