import type { DesignNode, DesignTab, WidgetDesign } from "./designCompiler.js";

export interface RenderWidgetPreviewInput {
  design: WidgetDesign;
}

const DEFAULT_COLORS: Record<string, string> = {
  background: "#071017",
  panel: "#101821DD",
  primary: "#2E7D5B",
  secondary: "#5B6470",
  text: "#EAF2F8",
  muted: "#9AA7B2"
};

interface PreviewTheme {
  colors: Record<string, string>;
  spacing: number;
  viewport: {
    width: number;
    height: number;
  };
}

export function renderWidgetPreview(input: RenderWidgetPreviewInput): string {
  const theme: PreviewTheme = {
    colors: { ...DEFAULT_COLORS, ...(input.design.theme?.colors ?? {}) },
    spacing: input.design.theme?.spacing ?? 16,
    viewport: input.design.viewport ?? { width: 1280, height: 720 }
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.design.name)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0B1117; color: ${theme.colors.text}; font-family: Segoe UI, Arial, sans-serif; }
    button, input, select { font: inherit; }
    button { border: 0; cursor: pointer; }
    [hidden] { display: none !important; }
    .widget-review-shell { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 18px; }
    .widget-review-header { width: ${px(theme.viewport.width)}; max-width: calc(100vw - 36px); display: flex; align-items: center; justify-content: space-between; color: #B7C2CC; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
    .widget-review-source { color: ${theme.colors.text}; font-weight: 700; }
    .widget-review-viewport { color: ${theme.colors.muted}; }
    .widget-viewport-frame { flex: 0 0 auto; overflow: hidden; box-shadow: 0 18px 48px rgba(0,0,0,.36); border: 1px solid rgba(255,255,255,.14); background: ${theme.colors.background}; }
    .widget-screen { display: grid; place-items: center; overflow: hidden; }
    .widget-panel { border: 1px solid rgba(255,255,255,.1); box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
    .widget-text { color: ${theme.colors.text}; }
    .widget-text.muted { color: ${theme.colors.muted}; }
    .widget-text.title { font-weight: 800; letter-spacing: .02em; }
    .widget-button { background: ${theme.colors.secondary}; color: ${theme.colors.text}; min-height: 36px; padding: 8px 18px; border: 1px solid rgba(255,255,255,.12); }
    .widget-button.secondary { background: ${theme.colors.secondary}; }
    .widget-button.primary, .widget-tab-button.active { background: ${theme.colors.primary}; color: #FFFFFF; }
    .widget-tab-button { width: 100%; color: ${theme.colors.text}; text-align: center; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.08); }
    .widget-input { width: 100%; accent-color: ${theme.colors.primary}; }
    .widget-toggle { display: inline-flex; align-items: center; width: 42px; height: 24px; cursor: pointer; }
    .widget-toggle input { position: absolute; opacity: 0; pointer-events: none; }
    .widget-toggle-track { position: relative; width: 42px; height: 24px; border-radius: 999px; background: ${theme.colors.secondary}; border: 1px solid rgba(255,255,255,.16); transition: background .14s ease; }
    .widget-toggle-thumb { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: ${theme.colors.text}; transition: transform .14s ease; }
    .widget-toggle input:checked + .widget-toggle-track { background: ${theme.colors.primary}; }
    .widget-toggle input:checked + .widget-toggle-track .widget-toggle-thumb { transform: translateX(18px); }
    .widget-select { width: 100%; min-height: 36px; background: #101820; color: ${theme.colors.text}; border: 1px solid rgba(255,255,255,.16); padding: 6px 10px; }
  </style>
</head>
<body><div class="widget-review-shell"><div class="widget-review-header" aria-label="Widget preview metadata"><span class="widget-review-source">${escapeHtml(input.design.name)}</span><span class="widget-review-viewport">${theme.viewport.width} x ${theme.viewport.height}</span></div><div class="widget-viewport-frame" style="${styleText([
    ["width", px(theme.viewport.width)],
    ["height", px(theme.viewport.height)]
  ])}">${renderNode(input.design.root, theme, true)}</div></div>
  <script>
    (() => {
      const buttons = Array.from(document.querySelectorAll('[data-widget-tab-button]'));
      const pages = Array.from(document.querySelectorAll('[data-widget-tab-page]'));
      buttons.forEach((clickedButton) => {
        clickedButton.addEventListener('click', () => {
          const tabId = clickedButton.dataset.widgetTabButton;
          buttons.forEach((button) => {
            const isActive = button.dataset.widgetTabButton === tabId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', String(isActive));
          });
          pages.forEach((page) => {
            page.hidden = page.dataset.widgetTabPage !== tabId;
          });
        });
      });
    })();
  </script>
</body>
</html>`;
}

function renderNode(node: DesignNode, theme: PreviewTheme, isRootChild = false): string {
  const children = (node.children ?? []).map((child) => renderNode(child, theme)).join("");
  const dataNode = escapeAttribute(node.name);

  switch (node.type) {
    case "screen":
      return `<div class="widget-screen" data-node="${dataNode}" style="${screenStyle(theme)}">${children}</div>`;
    case "panel":
      return `<section class="widget-panel" data-node="${dataNode}" style="${panelStyle(node, theme, isRootChild)}">${children}</section>`;
    case "stack":
      return `<div class="widget-stack" data-node="${dataNode}" style="${stackStyle(node, theme)}">${children}</div>`;
    case "row":
      return renderRow(node, theme);
    case "scroll":
      return `<div class="widget-scroll" data-node="${dataNode}" style="${styleText([
        ["overflow", "auto"],
        ["min-height", "0"],
        ["max-height", px(numberOr(node.style?.height, 520))]
      ])}">${children}</div>`;
    case "tabs":
      return renderTabs(node, theme);
    case "text":
      return `<div class="${textClass(node)}" data-node="${dataNode}" style="${textStyle(node, theme)}">${escapeHtml(node.text ?? "")}</div>`;
    case "button":
      return `<button class="${buttonClass(node)}" data-node="${dataNode}" style="${sizeStyle(node.style ?? {})}">${escapeHtml(node.text ?? node.name)}</button>`;
    case "slider":
      return `<input data-node="${dataNode}" type="range" class="widget-input" min="0" max="1" step="0.01" value="${escapeAttribute(String(node.value ?? 0))}">`;
    case "toggle":
      return `<label class="widget-toggle" data-node="${dataNode}Toggle"><input data-node="${dataNode}" type="checkbox"${node.checked ? " checked" : ""}><span class="widget-toggle-track" aria-hidden="true"><span class="widget-toggle-thumb"></span></span></label>`;
    case "select":
      return `<select data-node="${dataNode}" class="widget-select">${(node.options ?? []).map((option) => `<option>${escapeHtml(option)}</option>`).join("")}</select>`;
    case "spacer":
      return `<div data-node="${dataNode}" style="${styleText([
        ["width", px(numberOr(node.style?.width, 0))],
        ["height", px(numberOr(node.style?.height, 16))]
      ])}"></div>`;
    default:
      return `<div data-node="${dataNode}">${children}</div>`;
  }
}

function renderRow(node: DesignNode, theme: PreviewTheme): string {
  const children = node.children ?? [];
  const style = node.style ?? {};
  const rowStyle = styleText([
    ["display", "flex"],
    ["align-items", "center"],
    ["gap", px(numberOr(node.gap, theme.spacing))],
    ["margin", marginCss(normalizePaddingOr(style.margin, isSettingRow(node) ? [0, 0, 0, 12] : [0, 0, 0, 0]))],
    ["justify-content", rowJustifyContent(node)],
    ["align-self", alignSelfCss(style.alignSelf)]
  ]);

  if (isSettingRow(node) && children.length >= 2) {
    const labelWidth = numberOr(style.labelWidth, 260);
    const controlWidth = numberOr(style.controlWidth, 320);
    const label = children[0];
    const control = children[1];

    return `<div class="widget-row" data-node="${escapeAttribute(node.name)}" style="${rowStyle}">` +
      `<div data-node="${escapeAttribute(label.name)}Box" style="${fixedWidthStyle(labelWidth)}">${renderNode(label, theme)}</div>` +
      `<div data-node="${escapeAttribute(control.name)}Box" style="${controlBoxStyle(controlWidth, style.controlFill === true)}">${renderNode(control, theme)}</div>` +
      `${children.slice(2).map((child) => renderNode(child, theme)).join("")}</div>`;
  }

  return `<div class="widget-row" data-node="${escapeAttribute(node.name)}" style="${rowStyle}">${children.map((child) => renderNode(child, theme)).join("")}</div>`;
}

function renderTabs(node: DesignNode, theme: PreviewTheme): string {
  const tabs = node.tabs ?? [];
  const style = node.style ?? {};
  const sidebarWidth = numberOr(style.sidebarWidth, 176);
  const buttonHeight = numberOr(style.buttonHeight, 44);
  const sidebarGap = numberOr(style.sidebarGap, 10);
  const contentPadding = normalizePaddingOr(style.contentPadding, [20, 0, 0, 0]);

  return `<div class="widget-tabs" data-node="${escapeAttribute(node.name)}" style="${tabsStyle(node)}">` +
    `<nav data-node="${escapeAttribute(node.name)}ButtonColumn" style="${styleText([
      ["width", px(sidebarWidth)],
      ["flex", `0 0 ${px(sidebarWidth)}`],
      ["display", "flex"],
      ["flex-direction", "column"],
      ["gap", px(sidebarGap)]
    ])}">${tabs.map((tab, index) => renderTabButton(tab, index, buttonHeight)).join("")}</nav>` +
    `<section data-node="${escapeAttribute(node.name)}Switcher" style="${styleText([
      ["flex", "1 1 auto"],
      ["min-width", "0"],
      ["padding", paddingCss(contentPadding)]
    ])}">${tabs.map((tab, index) => renderTabPage(tab, index, theme)).join("")}</section></div>`;
}

function renderTabButton(tab: DesignTab, index: number, buttonHeight: number): string {
  return `<button class="widget-tab-button${index === 0 ? " active" : ""}" data-node="${escapeAttribute(tab.buttonName)}" data-widget-tab-button="${escapeAttribute(tab.id)}" aria-selected="${index === 0 ? "true" : "false"}" style="${styleText([
    ["height", px(buttonHeight)],
    ["flex", `0 0 ${px(buttonHeight)}`]
  ])}">${escapeHtml(tab.label)}</button>`;
}

function renderTabPage(tab: DesignTab, index: number, theme: PreviewTheme): string {
  const children = (tab.children ?? []).map((child) => renderNode(child, theme)).join("");
  return `<div class="widget-tab-page" data-node="${escapeAttribute(tab.pageName)}" data-widget-tab-page="${escapeAttribute(tab.id)}"${index === 0 ? "" : " hidden"}>${children}</div>`;
}

function screenStyle(theme: PreviewTheme): string {
  return styleText([
    ["width", px(theme.viewport.width)],
    ["height", px(theme.viewport.height)],
    ["background", theme.colors.background]
  ]);
}

function panelStyle(node: DesignNode, theme: PreviewTheme, isRootChild: boolean): string {
  const style = node.style ?? {};
  const width = typeof style.width === "number" ? style.width : isRootChild ? Math.min(1040, Math.max(320, theme.viewport.width - 160)) : undefined;
  const height = typeof style.height === "number" ? style.height : isRootChild ? Math.min(620, Math.max(240, theme.viewport.height - 100)) : undefined;

  return styleText([
    ["background", resolveColor(style.backgroundColor, theme.colors, "panel")],
    ["padding", paddingCss(normalizePadding(style.padding, theme.spacing))],
    ["width", width === undefined ? undefined : px(width)],
    ["height", height === undefined ? undefined : px(height)],
    ["min-height", "0"]
  ]);
}

function stackStyle(node: DesignNode, theme: PreviewTheme): string {
  const direction = node.direction ?? "vertical";
  const style = node.style ?? {};
  return styleText([
    ["display", "flex"],
    ["flex-direction", direction === "horizontal" ? "row" : "column"],
    ["gap", px(numberOr(node.gap, theme.spacing))],
    ["height", style.fill === true ? "100%" : undefined],
    ["min-height", style.fill === true ? "0" : undefined],
    ["margin", optionalMargin(style.margin)]
  ]);
}

function tabsStyle(node: DesignNode): string {
  const style = node.style ?? {};
  return styleText([
    ["display", "flex"],
    ["align-items", "stretch"],
    ["gap", "0"],
    ["height", style.fill === true ? "100%" : undefined],
    ["min-height", "0"],
    ["margin", optionalMargin(style.margin)]
  ]);
}

function textClass(node: DesignNode): string {
  const variant = node.variant === "title" ? " title" : node.variant === "muted" ? " muted" : "";
  return `widget-text${variant}`;
}

function textStyle(node: DesignNode, theme: PreviewTheme): string {
  const style = node.style ?? {};
  const fontSize = numberOr(style.fontSize, node.variant === "title" ? 34 : 18);
  return styleText([
    ["font-size", px(fontSize)],
    ["color", resolveColor(style.color, theme.colors, node.variant === "muted" ? "muted" : "text")],
    ["margin", optionalMargin(style.margin)]
  ]);
}

function fixedWidthStyle(width: number): string {
  return styleText([
    ["width", px(width)],
    ["flex", `0 0 ${px(width)}`]
  ]);
}

function controlBoxStyle(width: number, fill: boolean): string {
  if (fill) {
    return styleText([
      ["width", px(width)],
      ["flex", "1 1 0"],
      ["min-width", "0"]
    ]);
  }
  return fixedWidthStyle(width);
}

function buttonClass(node: DesignNode): string {
  const variant = node.variant === "primary" ? " primary" : node.variant === "secondary" ? " secondary" : "";
  return `widget-button${variant}`;
}

function sizeStyle(style: Record<string, unknown>): string {
  return styleText([
    ["width", typeof style.width === "number" ? px(style.width) : undefined],
    ["height", typeof style.height === "number" ? px(style.height) : undefined],
    ["margin", optionalMargin(style.margin)]
  ]);
}

function rowJustifyContent(node: DesignNode): string | undefined {
  const style = node.style ?? {};
  if (style.alignSelf === "right" || node.name === "ActionRow") {
    return "flex-end";
  }
  if (style.alignSelf === "center") {
    return "center";
  }
  return undefined;
}

function alignSelfCss(value: unknown): string | undefined {
  if (value === "right") {
    return "flex-end";
  }
  if (value === "center") {
    return "center";
  }
  if (value === "left") {
    return "flex-start";
  }
  if (value === "fill") {
    return "stretch";
  }
  return undefined;
}

function isSettingRow(node: DesignNode): boolean {
  return /Row$/.test(node.name) && !/HeaderRow|ActionRow|BodyShell/.test(node.name);
}

function resolveColor(value: unknown, colors: Record<string, string>, fallbackKey: string): string {
  if (typeof value === "string") {
    return colors[value] ?? value;
  }
  return colors[fallbackKey] ?? "#FFFFFFFF";
}

function normalizePadding(value: unknown, fallback: number): number[] {
  return normalizePaddingOr(value, [fallback, fallback, fallback, fallback]);
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

function optionalPadding(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return paddingCss(normalizePaddingOr(value, [0, 0, 0, 0]));
}

function optionalMargin(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return marginCss(normalizePaddingOr(value, [0, 0, 0, 0]));
}

function paddingCss(value: number[]): string {
  return `${cssLength(value[0])} ${cssLength(value[1])} ${cssLength(value[2])} ${cssLength(value[3])}`;
}

function marginCss(value: number[]): string {
  return `${cssLength(value[1])} ${cssLength(value[2])} ${cssLength(value[3])} ${cssLength(value[0])}`;
}

function cssLength(value: number): string {
  return value === 0 ? "0" : px(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function px(value: number): string {
  return `${value}px`;
}

function styleText(items: Array<[string, string | undefined]>): string {
  return items
    .filter((item): item is [string, string] => item[1] !== undefined && item[1] !== "")
    .map(([property, value]) => `${property}:${value};`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
