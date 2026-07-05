export type LayoutProfile = "settings" | "hud" | "menu" | "generic";

export interface LayoutQualityInput {
  layout: Record<string, unknown>;
  profile?: LayoutProfile;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface LayoutQualityIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

interface LayoutNode {
  type?: string;
  class?: string;
  name?: string;
  children?: unknown[];
  [key: string]: unknown;
}

interface LayoutStats {
  totalNodes: number;
  controls: number;
  textBlocks: number;
  buttons: number;
  scrollBoxes: number;
  widgetSwitchers: number;
  styledContainers: number;
  styledButtons: number;
  canvasSlotCount: number;
  responsiveCanvasSlotCount: number;
  actionRows: number;
  tabLikeGroups: number;
}

const CONTROL_TYPES = new Set(["Button", "Slider", "CheckBox", "ComboBoxString", "EditableText", "EditableTextBox"]);

export function validateWidgetLayoutQuality(input: LayoutQualityInput) {
  const profile = input.profile ?? "generic";
  const root = getRootNode(input.layout);
  const stats = collectStats(root);
  const issues: LayoutQualityIssue[] = [];

  if (stats.totalNodes === 0) {
    issues.push({
      code: "EMPTY_LAYOUT",
      message: "Layout must contain a root widget.",
      severity: "error"
    });
  }

  if (profile === "settings") {
    validateSettingsLayout(stats, issues);
  }

  if (stats.controls >= 8 && stats.styledButtons === 0) {
    issues.push({
      code: "UNSTYLED_INTERACTIVE_CONTROLS",
      message: "Interactive UI with many controls needs button/control styling instead of default UMG appearance.",
      severity: "error"
    });
  }

  if (stats.canvasSlotCount > 0 && stats.responsiveCanvasSlotCount === 0) {
    issues.push({
      code: "CANVAS_WITHOUT_RESPONSIVE_ANCHORS",
      message: "Canvas layout must use anchors/alignment/size instead of relying on default top-left placement.",
      severity: "error"
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    profile,
    viewport: input.viewport ?? { width: 1280, height: 720 },
    stats,
    issues
  };
}

function validateSettingsLayout(stats: LayoutStats, issues: LayoutQualityIssue[]): void {
  if (stats.controls >= 12 && stats.scrollBoxes === 0 && stats.widgetSwitchers === 0) {
    issues.push({
      code: "SETTINGS_CONTENT_NEEDS_PAGING_OR_SCROLL",
      message: "Settings screens with many controls must use ScrollBox and/or WidgetSwitcher tabs instead of one long column.",
      severity: "error"
    });
  }

  if (stats.styledContainers === 0) {
    issues.push({
      code: "MISSING_STYLED_CONTAINER",
      message: "Settings screens need a styled frame/background container, such as Border with backgroundColor and padding.",
      severity: "error"
    });
  }

  if (stats.actionRows === 0 && stats.buttons >= 2) {
    issues.push({
      code: "MISSING_ACTION_ROW",
      message: "Settings screens need a deliberate action row for Apply/Reset/Close style actions.",
      severity: "warning"
    });
  }
}

function getRootNode(layout: Record<string, unknown>): LayoutNode | undefined {
  const root = layout.root;
  if (isNode(root)) {
    return root;
  }
  if (isNode(layout)) {
    return layout;
  }
  return undefined;
}

function collectStats(root: LayoutNode | undefined): LayoutStats {
  const stats: LayoutStats = {
    totalNodes: 0,
    controls: 0,
    textBlocks: 0,
    buttons: 0,
    scrollBoxes: 0,
    widgetSwitchers: 0,
    styledContainers: 0,
    styledButtons: 0,
    canvasSlotCount: 0,
    responsiveCanvasSlotCount: 0,
    actionRows: 0,
    tabLikeGroups: 0
  };

  visit(root, stats);
  return stats;
}

function visit(node: LayoutNode | undefined, stats: LayoutStats): void {
  if (!node) {
    return;
  }

  stats.totalNodes += 1;
  const type = getType(node);
  const name = typeof node.name === "string" ? node.name : "";

  if (CONTROL_TYPES.has(type)) {
    stats.controls += 1;
  }
  if (type === "TextBlock") {
    stats.textBlocks += 1;
  }
  if (type === "Button") {
    stats.buttons += 1;
    if (hasStyle(node)) {
      stats.styledButtons += 1;
    }
  }
  if (type === "ScrollBox") {
    stats.scrollBoxes += 1;
  }
  if (type === "WidgetSwitcher") {
    stats.widgetSwitchers += 1;
  }
  if ((type === "Border" || type === "Image" || type === "Overlay") && hasStyle(node)) {
    stats.styledContainers += 1;
  }
  if (/action|footer/i.test(name)) {
    stats.actionRows += 1;
  }
  if (/tab|category/i.test(name)) {
    stats.tabLikeGroups += 1;
  }

  const slot = isRecord(node.slot) ? node.slot : node;
  if (isRecord(slot) && ("anchors" in slot || "position" in slot || "size" in slot)) {
    stats.canvasSlotCount += 1;
    if ("anchors" in slot && "alignment" in slot && "size" in slot) {
      stats.responsiveCanvasSlotCount += 1;
    }
  }

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (isNode(child)) {
      visit(child, stats);
    }
  }
}

function getType(node: LayoutNode): string {
  if (typeof node.type === "string") {
    return node.type;
  }
  if (typeof node.class === "string") {
    return node.class;
  }
  return "";
}

function hasStyle(node: LayoutNode): boolean {
  return (
    "backgroundColor" in node ||
    "color" in node ||
    "brushColor" in node ||
    "style" in node ||
    "padding" in node
  );
}

function isNode(value: unknown): value is LayoutNode {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
