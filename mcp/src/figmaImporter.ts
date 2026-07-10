import type { DesignNode, WidgetDesign } from "./designCompiler.js";

export interface CompileFigmaWidgetInput {
  node: Record<string, unknown>;
  name?: string;
}

export interface FigmaImportDiagnostic {
  code: string;
  node: string;
  message: string;
}

export interface CompileFigmaWidgetResult {
  design: WidgetDesign;
  diagnostics: FigmaImportDiagnostic[];
}

interface FigmaNode {
  type?: string;
  name?: string;
  characters?: string;
  children?: FigmaNode[];
  layoutMode?: string;
  itemSpacing?: number;
  absoluteBoundingBox?: {
    width?: number;
    height?: number;
  };
  fills?: Array<{
    type?: string;
    color?: { r?: number; g?: number; b?: number };
    opacity?: number;
  }>;
  style?: {
    fontSize?: number;
  };
}

interface SemanticName {
  role?: string;
  name: string;
}

export function compileFigmaWidget(input: CompileFigmaWidgetInput): CompileFigmaWidgetResult {
  const diagnostics: FigmaImportDiagnostic[] = [];
  const rootNode = input.node as FigmaNode;
  const rootName = semanticName(rootNode.name ?? input.name ?? "FigmaWidget").name;
  const viewport = viewportFromNode(rootNode);
  const children = compileChildren(rootNode, diagnostics);

  return {
    design: {
      name: input.name ?? rootName,
      ...(viewport ? { viewport } : {}),
      root: {
        type: "screen",
        name: rootName,
        children
      }
    },
    diagnostics
  };
}

function compileChildren(node: FigmaNode, diagnostics: FigmaImportDiagnostic[]): DesignNode[] {
  return (node.children ?? [])
    .map((child) => compileNode(child, diagnostics))
    .filter((child): child is DesignNode => child !== undefined);
}

function compileNode(node: FigmaNode, diagnostics: FigmaImportDiagnostic[]): DesignNode | undefined {
  const semantic = semanticName(node.name ?? "FigmaNode");
  const role = semantic.role?.toLowerCase();
  const children = compileChildren(node, diagnostics);
  const style = styleFromNode(node);

  if (role === "text" || node.type === "TEXT") {
    return {
      type: "text",
      name: semantic.name,
      text: node.characters ?? semantic.name,
      ...(node.style?.fontSize ? { style: { ...style, fontSize: node.style.fontSize } } : Object.keys(style).length > 0 ? { style } : {})
    };
  }

  if (role === "button") {
    return {
      type: "button",
      name: semantic.name,
      text: firstText(node) ?? semantic.name,
      ...(Object.keys(style).length > 0 ? { style } : {})
    };
  }

  if (role === "slider") {
    return { type: "slider", name: semantic.name };
  }

  if (role === "toggle" || role === "checkbox") {
    return { type: "toggle", name: semantic.name };
  }

  if (role === "select" || role === "combobox") {
    return { type: "select", name: semantic.name, options: optionTexts(node) };
  }

  if (role === "scroll") {
    return {
      type: "scroll",
      name: semantic.name,
      ...(Object.keys(style).length > 0 ? { style } : {}),
      children
    };
  }

  if (role === "panel" || role === "border") {
    return {
      type: "panel",
      name: semantic.name,
      ...(Object.keys(style).length > 0 ? { style } : {}),
      children
    };
  }

  if (role === "verticalbox" || role === "horizontalbox" || node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
    return {
      type: "stack",
      name: semantic.name,
      direction: role === "horizontalbox" || node.layoutMode === "HORIZONTAL" ? "horizontal" : "vertical",
      ...(typeof node.itemSpacing === "number" ? { gap: node.itemSpacing } : {}),
      ...(Object.keys(style).length > 0 ? { style } : {}),
      children
    };
  }

  if (node.type === "RECTANGLE") {
    return {
      type: "panel",
      name: semantic.name,
      ...(Object.keys(style).length > 0 ? { style } : {}),
      children
    };
  }

  diagnostics.push({
    code: "UNSUPPORTED_FIGMA_NODE",
    node: semantic.name,
    message: `Unsupported Figma node type '${node.type ?? "unknown"}'.`
  });
  return undefined;
}

function semanticName(name: string): SemanticName {
  const slash = name.indexOf("/");
  if (slash === -1) {
    return { name: sanitizeWidgetName(name) };
  }

  return {
    role: name.slice(0, slash).trim(),
    name: sanitizeWidgetName(name.slice(slash + 1).trim())
  };
}

function sanitizeWidgetName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "");
  return /^[A-Za-z_]/.test(clean) ? clean : `Widget_${clean || "Node"}`;
}

function viewportFromNode(node: FigmaNode): WidgetDesign["viewport"] | undefined {
  const width = node.absoluteBoundingBox?.width;
  const height = node.absoluteBoundingBox?.height;
  return typeof width === "number" && typeof height === "number" ? { width, height } : undefined;
}

function styleFromNode(node: FigmaNode): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  const fill = solidFill(node);
  if (fill) {
    style.backgroundColor = fill;
  }
  if (node.absoluteBoundingBox?.width) {
    style.width = node.absoluteBoundingBox.width;
  }
  if (node.absoluteBoundingBox?.height) {
    style.height = node.absoluteBoundingBox.height;
  }
  return style;
}

function solidFill(node: FigmaNode): string | undefined {
  const fill = node.fills?.find((candidate) => candidate.type === "SOLID" && candidate.color);
  if (!fill?.color) {
    return undefined;
  }

  const alpha = fill.opacity ?? 1;
  return `#${hex(fill.color.r ?? 0)}${hex(fill.color.g ?? 0)}${hex(fill.color.b ?? 0)}${hex(alpha)}`;
}

function hex(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function firstText(node: FigmaNode): string | undefined {
  if (node.type === "TEXT" && node.characters) {
    return node.characters;
  }
  for (const child of node.children ?? []) {
    const found = firstText(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function optionTexts(node: FigmaNode): string[] {
  const texts = (node.children ?? [])
    .map((child) => firstText(child))
    .filter((text): text is string => Boolean(text));
  return texts.length > 0 ? texts : [];
}
