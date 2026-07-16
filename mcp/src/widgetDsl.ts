import type { DesignNode, DesignTab, WidgetDesign } from "./designCompiler.js";
import { getUnsupportedProps, isKnownComponent } from "./widgetDslRegistry.js";

export interface CompileWidgetDslInput {
  source: string;
}

export interface WidgetDslDiagnostic {
  code: string;
  message: string;
}

export interface CompileWidgetDslResult {
  design: WidgetDesign;
  diagnostics: WidgetDslDiagnostic[];
}

interface DslNode {
  tag: string;
  attrs: Record<string, unknown>;
  children: DslNode[];
}

export function compileWidgetDsl(input: CompileWidgetDslInput): CompileWidgetDslResult {
  const diagnostics: WidgetDslDiagnostic[] = [];
  const parsed = parseDsl(input.source, diagnostics);
  const widget = normalizeWidgetRoot(
    parsed ?? {
      tag: "Canvas",
      attrs: { name: "WidgetScreen" },
      children: []
    },
    diagnostics
  );
  const root = widget.root;
  const viewportWidth = numberAttr(root.attrs, "width");
  const viewportHeight = numberAttr(root.attrs, "height");

  return {
    design: {
      name: widget.name,
      ...(widget.theme ? { theme: widget.theme } : {}),
      ...(viewportWidth !== undefined && viewportHeight !== undefined
        ? { viewport: { width: viewportWidth, height: viewportHeight } }
        : {}),
      root: compileDslNode(root, diagnostics)
    },
    diagnostics
  };
}

function normalizeWidgetRoot(
  parsed: DslNode,
  diagnostics: WidgetDslDiagnostic[]
): { name: string; root: DslNode; theme?: WidgetDesign["theme"] } {
  if (parsed.tag !== "Widget") {
    return {
      name: stringAttr(parsed.attrs, "name", "WidgetDesign"),
      root: parsed
    };
  }

  reportUnsupportedAttrs(parsed, diagnostics);

  const canvasChildren = parsed.children.filter((child) => child.tag === "Canvas");
  const themeChildren = parsed.children.filter((child) => child.tag === "Theme");
  for (const child of parsed.children) {
    if (child.tag !== "Canvas" && child.tag !== "Theme") {
      diagnostics.push({
        code: "UNSUPPORTED_WIDGET_CHILD",
        message: `<Widget> only supports <Theme> and exactly one <Canvas> child; found <${child.tag}>.`
      });
    }
  }
  if (canvasChildren.length !== 1) {
    diagnostics.push({
      code: "INVALID_WIDGET_CANVAS_COUNT",
      message: `<Widget> should contain exactly one <Canvas> child; found ${canvasChildren.length}.`
    });
  }
  if (themeChildren.length > 1) {
    diagnostics.push({
      code: "MULTIPLE_THEMES",
      message: "<Widget> should contain at most one <Theme> child; using the first one."
    });
  }

  const root = canvasChildren[0] ?? {
    tag: "Canvas",
    attrs: { name: "WidgetScreen" },
    children: []
  };
  return {
    name: stringAttr(parsed.attrs, "name", stringAttr(root.attrs, "name", "WidgetDesign")),
    root,
    theme: themeChildren[0] ? themeFromAttrs(themeChildren[0].attrs, diagnostics) : undefined
  };
}

function parseDsl(source: string, diagnostics: WidgetDslDiagnostic[]): DslNode | undefined {
  const root: DslNode = { tag: "__root", attrs: {}, children: [] };
  const stack: DslNode[] = [root];
  const tagPattern = /<\/?[A-Za-z][A-Za-z0-9]*(?:\s+[^<>]*?)?\s*\/?>/g;
  const tags = stripComments(source).match(tagPattern) ?? [];

  for (const rawTag of tags) {
    if (rawTag.startsWith("</")) {
      const closingTag = rawTag.slice(2, -1).trim();
      const open = stack.pop();
      if (!open || open.tag !== closingTag) {
        diagnostics.push({
          code: "MISMATCHED_CLOSING_TAG",
          message: `Closing tag </${closingTag}> does not match the current open tag.`
        });
      }
      continue;
    }

    const selfClosing = rawTag.endsWith("/>");
    const body = rawTag.slice(1, rawTag.length - (selfClosing ? 2 : 1)).trim();
    const firstSpace = body.search(/\s/);
    const tag = firstSpace === -1 ? body : body.slice(0, firstSpace);
    const attrSource = firstSpace === -1 ? "" : body.slice(firstSpace + 1);
    const node: DslNode = {
      tag,
      attrs: parseAttrs(attrSource, diagnostics),
      children: []
    };

    stack[stack.length - 1]?.children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }

  if (stack.length > 1) {
    diagnostics.push({
      code: "UNCLOSED_TAG",
      message: `Unclosed tag <${stack[stack.length - 1]?.tag}>.`
    });
  }

  if (root.children.length === 0) {
    diagnostics.push({
      code: "EMPTY_DSL",
      message: "Widget DSL source did not contain a root component."
    });
    return undefined;
  }
  if (root.children.length > 1) {
    diagnostics.push({
      code: "MULTIPLE_ROOTS",
      message: "Widget DSL source should contain one root component; using the first one."
    });
  }

  return root.children[0];
}

function stripComments(source: string): string {
  return source
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .replaceAll(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

function parseAttrs(source: string, diagnostics: WidgetDslDiagnostic[]): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  let index = 0;

  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) {
      index += 1;
    }
    if (index >= source.length) {
      break;
    }

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
    if (!nameMatch) {
      diagnostics.push({
        code: "UNSUPPORTED_ATTRIBUTE_SYNTAX",
        message: `Could not parse attribute near '${source.slice(index, index + 24)}'.`
      });
      break;
    }

    const name = nameMatch[0];
    index += name.length;
    while (/\s/.test(source[index] ?? "")) {
      index += 1;
    }

    if (source[index] !== "=") {
      attrs[name] = true;
      continue;
    }

    index += 1;
    while (/\s/.test(source[index] ?? "")) {
      index += 1;
    }

    const parsed = parseAttrValue(source, index, diagnostics);
    attrs[name] = parsed.value;
    index = parsed.nextIndex;
  }

  return attrs;
}

function parseAttrValue(
  source: string,
  index: number,
  diagnostics: WidgetDslDiagnostic[]
): { value: unknown; nextIndex: number } {
  const quote = source[index];
  if (quote === '"' || quote === "'") {
    const end = source.indexOf(quote, index + 1);
    if (end === -1) {
      diagnostics.push({ code: "UNCLOSED_STRING", message: "String attribute is missing a closing quote." });
      return { value: source.slice(index + 1), nextIndex: source.length };
    }
    return { value: source.slice(index + 1, end), nextIndex: end + 1 };
  }

  if (quote === "{") {
    const end = findMatchingBrace(source, index);
    if (end === -1) {
      diagnostics.push({ code: "UNCLOSED_EXPRESSION", message: "Expression attribute is missing a closing brace." });
      return { value: source.slice(index + 1), nextIndex: source.length };
    }
    return { value: parseExpressionValue(source.slice(index + 1, end), diagnostics), nextIndex: end + 1 };
  }

  const token = /^[^\s]+/.exec(source.slice(index))?.[0] ?? "";
  return { value: parseScalar(token), nextIndex: index + token.length };
}

function findMatchingBrace(source: string, start: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseExpressionValue(expression: string, diagnostics: WidgetDslDiagnostic[]): unknown {
  const trimmed = expression.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed.replaceAll("'", '"'));
    } catch {
      diagnostics.push({
        code: "UNSUPPORTED_EXPRESSION",
        message: `Only JSON-like array/object expressions are supported: ${trimmed}`
      });
      return trimmed;
    }
  }
  return parseScalar(trimmed);
}

function parseScalar(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && value.trim() !== "" ? numeric : value;
}

function compileDslNode(node: DslNode, diagnostics: WidgetDslDiagnostic[]): DesignNode {
  reportUnsupportedAttrs(node, diagnostics);

  switch (node.tag) {
    case "Canvas":
      return {
        type: "screen",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "WidgetScreen")),
        children: node.children.map((child) => compileDslNode(child, diagnostics))
      };
    case "CalibrationShell":
      return compileContainerNode(node, "overlay", diagnostics);
    case "Border":
    case "Panel":
    case "PanelFrame":
    case "TelemetryDeck":
      return {
        type: "panel",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", `${node.tag}Panel`)),
        style: styleFromAttrs(node.attrs, { backgroundKey: "backgroundColor" }),
        children: node.children.map((child) => compileDslNode(child, diagnostics))
      };
    case "VerticalBox":
    case "ModuleRail":
    case "HorizontalBox":
      return {
        type: "stack",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", `${node.tag}Stack`)),
        direction: node.tag === "HorizontalBox" ? "horizontal" : "vertical",
        gap: numberAttr(node.attrs, "size", numberAttr(node.attrs, "gap")),
        style: styleFromAttrs(node.attrs),
        children: node.children.map((child) => compileDslNode(child, diagnostics))
      };
    case "Text":
      return {
        type: "text",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "TextBlock")),
        text: stringAttr(node.attrs, "value", stringAttr(node.attrs, "text", stringAttr(node.attrs, "label", ""))),
        variant: stringAttr(node.attrs, "variant", boolAttr(node.attrs, "muted") ? "muted" : undefined),
        style: styleFromAttrs(node.attrs, { fontSizeKey: "fontSize" })
      };
    case "Readout":
      return {
        type: "text",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "ReadoutText")),
        text: stringAttr(node.attrs, "value", stringAttr(node.attrs, "text", "")),
        variant: "readout",
        style: styleFromAttrs(node.attrs, { fontSizeKey: "fontSize" })
      };
    case "SectionLabel":
      return {
        type: "text",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "SectionLabelText")),
        text: stringAttr(node.attrs, "value", stringAttr(node.attrs, "text", "")),
        variant: "section",
        style: styleFromAttrs(node.attrs, { fontSizeKey: "fontSize" })
      };
    case "StatusBadge":
      return {
        type: "panel",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "StatusBadge")),
        style: styleFromAttrs(node.attrs, { backgroundKey: "backgroundColor" }),
        children: [{
          type: "text",
          name: `${stringAttr(node.attrs, "name", "StatusBadge")}Text`,
          text: stringAttr(node.attrs, "value", stringAttr(node.attrs, "text", "ONLINE")),
          style: styleFromAttrs(node.attrs, { fontSizeKey: "fontSize" })
        }]
      };
    case "Button":
      return {
        type: "button",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "Button")),
        text: stringAttr(node.attrs, "text", stringAttr(node.attrs, "value", stringAttr(node.attrs, "label", "Button"))),
        variant: stringAttr(node.attrs, "variant", undefined),
        style: styleFromAttrs(node.attrs)
      };
    case "Slider":
      return {
        type: "slider",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "Slider")),
        value: numberAttr(node.attrs, "value", 0),
        style: styleFromAttrs(node.attrs)
      };
    case "Toggle":
      return {
        type: "toggle",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "CheckBox")),
        checked: boolAttr(node.attrs, "checked"),
        style: styleFromAttrs(node.attrs)
      };
    case "Select":
      return {
        type: "select",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "ComboBox")),
        options: stringArrayAttr(node.attrs, "options"),
        style: styleFromAttrs(node.attrs)
      };
    case "SettingRow":
      return compileSettingRow(node, diagnostics);
    case "Tabs":
      return compileTabs(node, diagnostics);
    case "Overlay":
      return compileContainerNode(node, "overlay", diagnostics);
    case "SafeZone":
      return compileContainerNode(node, "safeZone", diagnostics);
    case "HUDLayer":
      return compileContainerNode(node, "hudLayer", diagnostics);
    case "Toolbar":
      return compileContainerNode(node, "toolbar", diagnostics, { direction: "horizontal" });
    case "CardList":
      return compileContainerNode(node, "cardList", diagnostics);
    case "InventoryGrid":
      return {
        type: "inventoryGrid",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "InventoryGrid")),
        style: {
          ...styleFromAttrs(node.attrs),
          columns: numberAttr(node.attrs, "columns", 4)
        },
        children: node.children.map((child) => compileDslNode(child, diagnostics))
      };
    case "Image":
      return {
        type: "image",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "Image")),
        text: stringAttr(node.attrs, "source", stringAttr(node.attrs, "src", undefined)),
        previewSrc: stringAttr(node.attrs, "previewSrc", undefined),
        style: styleFromAttrs(node.attrs)
      };
    case "ProgressBar":
      return {
        type: "progress",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "ProgressBar")),
        value: numberAttr(node.attrs, "value", 0),
        style: styleFromAttrs(node.attrs)
      };
    case "SignalMeter":
      return {
        type: "progress",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "SignalMeter")),
        value: numberAttr(node.attrs, "value", 0),
        style: styleFromAttrs(node.attrs)
      };
    case "IconButton":
      return {
        type: "iconButton",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "IconButton")),
        text: stringAttr(node.attrs, "text", stringAttr(node.attrs, "label", stringAttr(node.attrs, "icon", "Button"))),
        variant: stringAttr(node.attrs, "variant", undefined),
        style: {
          ...styleFromAttrs(node.attrs),
          icon: stringAttr(node.attrs, "icon", undefined)
        }
      };
    case "KeyValueRow":
      return compileKeyValueRow(node);
    case "Modal":
      return compileModal(node, diagnostics);
    case "ConfirmDialog":
      return compileConfirmDialog(node);
    default:
      diagnostics.push({
        code: "UNSUPPORTED_COMPONENT",
        message: `Component <${node.tag}> is not supported by the Widget DSL compiler.`
      });
      return {
        type: "panel",
        name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", node.tag)),
        children: node.children.map((child) => compileDslNode(child, diagnostics))
      };
  }
}

function compileContainerNode(
  node: DslNode,
  type: string,
  diagnostics: WidgetDslDiagnostic[],
  extra: Record<string, unknown> = {}
): DesignNode {
  return {
    type,
    name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", node.tag)),
    style: styleFromAttrs(node.attrs),
    children: node.children.map((child) => compileDslNode(child, diagnostics)),
    ...extra
  };
}

function reportUnsupportedAttrs(node: DslNode, diagnostics: WidgetDslDiagnostic[]): void {
  if (!isKnownComponent(node.tag)) {
    return;
  }

  for (const attr of getUnsupportedProps(node.tag, node.attrs)) {
    diagnostics.push({
      code: "UNSUPPORTED_ATTRIBUTE",
      message: `Attribute '${attr}' on <${node.tag}> is not supported by the Widget DSL compiler.`
    });
  }
}

function themeFromAttrs(attrs: Record<string, unknown>, diagnostics: WidgetDslDiagnostic[]): WidgetDesign["theme"] {
  reportUnsupportedAttrs({ tag: "Theme", attrs, children: [] }, diagnostics);

  const colors: Record<string, string> = {};
  const preset = stringAttr(attrs, "preset", undefined);
  if (preset === "mistyCalibration") {
    Object.assign(colors, {
      background: "#050B0E",
      panel: "#092126",
      primary: "#00E0C0",
      secondary: "#102F34",
      text: "#ECFFFB",
      muted: "#91ADA8",
      void: "#050B0E",
      surface: "#092126",
      recess: "#102F34",
      mint: "#00E0C0",
      soft: "#91ADA8",
      danger: "#E0A356"
    });
  }
  for (const key of ["background", "panel", "primary", "secondary", "text", "muted", "void", "surface", "recess", "mint", "soft", "danger"]) {
    if (typeof attrs[key] === "string") {
      colors[key] = attrs[key];
    }
  }

  const spacing = numberAttr(attrs, "spacing");
  return {
    ...(Object.keys(colors).length > 0 ? { colors } : {}),
    ...(spacing !== undefined ? { spacing } : {})
  };
}

function compileSettingRow(node: DslNode, diagnostics: WidgetDslDiagnostic[]): DesignNode {
  const label = stringAttr(node.attrs, "label", "Setting");
  const name = stringAttr(node.attrs, "name", `${toIdentifier(label)}Row`);
  const compiledChildren = node.children.map((child) => compileDslNode(child, diagnostics));
  const hasExplicitLabel = compiledChildren[0]?.type === "text";
  return {
    type: "row",
    name,
    style: styleFromAttrs(node.attrs, { includeRowColumns: true }),
    children:
      hasExplicitLabel
        ? compiledChildren
        : [
            {
              type: "text",
              name: stringAttr(node.attrs, "labelName", `${name.replace(/Row$/, "")}Label`),
              text: label
            },
            ...compiledChildren
          ]
  };
}

function compileKeyValueRow(node: DslNode): DesignNode {
  const label = stringAttr(node.attrs, "label", stringAttr(node.attrs, "keyText", "Label"));
  const value = stringAttr(node.attrs, "value", stringAttr(node.attrs, "valueText", ""));
  const name = stringAttr(node.attrs, "name", `${toIdentifier(label)}Row`);
  return {
    type: "row",
    name,
    style: styleFromAttrs(node.attrs, { includeRowColumns: true }),
    children: [
      {
        type: "text",
        name: `${name.replace(/Row$/, "")}Label`,
        text: label
      },
      {
        type: "text",
        name: `${name.replace(/Row$/, "")}Value`,
        text: value,
        variant: "muted"
      }
    ]
  };
}

function compileModal(node: DslNode, diagnostics: WidgetDslDiagnostic[]): DesignNode {
  const title = stringAttr(node.attrs, "title", undefined);
  return {
    type: "modal",
    name: stringAttr(node.attrs, "name", stringAttr(node.attrs, "id", "Modal")),
    style: styleFromAttrs(node.attrs),
    children: [
      ...(title
        ? [
            {
              type: "text",
              name: `${stringAttr(node.attrs, "name", "Modal")}TitleText`,
              text: title,
              variant: "title"
            } as DesignNode
          ]
        : []),
      ...node.children.map((child) => compileDslNode(child, diagnostics))
    ]
  };
}

function compileConfirmDialog(node: DslNode): DesignNode {
  const name = stringAttr(node.attrs, "name", "ConfirmDialog");
  return {
    type: "confirmDialog",
    name,
    style: styleFromAttrs(node.attrs),
    children: [
      { type: "text", name: `${name}TitleText`, text: stringAttr(node.attrs, "title", "Confirm"), variant: "title" },
      { type: "text", name: `${name}MessageText`, text: stringAttr(node.attrs, "message", ""), variant: "muted" },
      {
        type: "row",
        name: `${name}ActionRow`,
        style: { alignSelf: "right", auto: true },
        children: [
          { type: "button", name: `${name}CancelButton`, text: stringAttr(node.attrs, "cancelText", "Cancel"), variant: "secondary" },
          { type: "button", name: `${name}ConfirmButton`, text: stringAttr(node.attrs, "confirmText", "Confirm"), variant: "primary" }
        ]
      }
    ]
  };
}

function compileTabs(node: DslNode, diagnostics: WidgetDslDiagnostic[]): DesignNode {
  const tabs: DesignTab[] = [];
  for (const child of node.children) {
    reportUnsupportedAttrs(child, diagnostics);
    if (child.tag !== "Tab") {
      diagnostics.push({
        code: "UNSUPPORTED_TABS_CHILD",
        message: `<Tabs> only supports <Tab> children; found <${child.tag}>.`
      });
      continue;
    }
    const id = stringAttr(child.attrs, "id", toIdentifier(stringAttr(child.attrs, "label", "tab")).toLowerCase());
    const label = stringAttr(child.attrs, "label", id);
    tabs.push({
      id,
      label,
      buttonName: stringAttr(child.attrs, "buttonName", `${toIdentifier(label)}TabButton`),
      pageName: stringAttr(child.attrs, "pageName", `${toIdentifier(label)}SettingsPage`),
      children: child.children.map((grandchild) => compileDslNode(grandchild, diagnostics))
    });
  }

  return {
    type: "tabs",
    name: stringAttr(node.attrs, "name", "WidgetTabs"),
    style: styleFromAttrs(node.attrs, { includeTabs: true }),
    tabs
  };
}

function styleFromAttrs(
  attrs: Record<string, unknown>,
  options: { backgroundKey?: string; fontSizeKey?: string; includeRowColumns?: boolean; includeTabs?: boolean } = {}
): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  copyNumber(attrs, style, "width");
  copyNumber(attrs, style, "height");
  copyArray(attrs, style, "padding");
  copyArray(attrs, style, "margin");
  copyString(attrs, style, "alignSelf");
  copyString(attrs, style, "valignSelf");
  copyBoolean(attrs, style, "fill");
  copyBoolean(attrs, style, "auto");
  copyBoolean(attrs, style, "grow");
  copyNumber(attrs, style, "opacity");
  copyNumber(attrs, style, "zIndex");
  copyNumber(attrs, style, "minValue");
  copyNumber(attrs, style, "maxValue");
  copyArray(attrs, style, "shadowOffset");
  copyArray(attrs, style, "position");
  copyArray(attrs, style, "canvasSize");
  copyValue(attrs, style, "anchors");
  copyString(attrs, style, "color");
  copyString(attrs, style, "brushColor");
  copyString(attrs, style, "shadowColor");
  copyString(attrs, style, "justification");
  copyString(attrs, style, "barColor");
  copyString(attrs, style, "handleColor");
  copyString(attrs, style, "activeColor");
  copyString(attrs, style, "inactiveColor");
  copyString(attrs, style, "asset");
  if (options.backgroundKey && typeof attrs.background === "string") {
    style[options.backgroundKey] = attrs.background;
  } else if (options.backgroundKey && typeof attrs.backgroundColor === "string") {
    style[options.backgroundKey] = attrs.backgroundColor;
  } else if (typeof attrs.background === "string") {
    style.backgroundColor = attrs.background;
  } else if (typeof attrs.backgroundColor === "string") {
    style.backgroundColor = attrs.backgroundColor;
  }
  if (options.fontSizeKey && typeof attrs.size === "number") {
    style[options.fontSizeKey] = attrs.size;
  } else if (options.fontSizeKey && typeof attrs.fontSize === "number") {
    style[options.fontSizeKey] = attrs.fontSize;
  }
  if (options.includeRowColumns) {
    copyNumber(attrs, style, "labelWidth");
    copyNumber(attrs, style, "controlWidth");
    copyBoolean(attrs, style, "controlFill");
  }
  if (options.includeTabs) {
    copyNumber(attrs, style, "sidebarWidth");
    copyNumber(attrs, style, "buttonHeight");
    copyNumber(attrs, style, "sidebarGap");
    copyArray(attrs, style, "contentPadding");
  }
  return style;
}

function copyNumber(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (typeof source[key] === "number") {
    target[key] = source[key];
  }
}

function copyString(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (typeof source[key] === "string") {
    target[key] = source[key];
  }
}

function copyBoolean(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (typeof source[key] === "boolean") {
    target[key] = source[key];
  }
}

function copyArray(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (Array.isArray(source[key])) {
    target[key] = source[key];
  }
}

function copyValue(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (source[key] !== undefined) {
    target[key] = source[key];
  }
}

function stringAttr<T extends string | undefined>(attrs: Record<string, unknown>, key: string, fallback: T): string | T {
  return typeof attrs[key] === "string" ? attrs[key] : fallback;
}

function numberAttr(attrs: Record<string, unknown>, key: string, fallback?: number): number | undefined {
  return typeof attrs[key] === "number" ? attrs[key] : fallback;
}

function boolAttr(attrs: Record<string, unknown>, key: string): boolean {
  return attrs[key] === true;
}

function stringArrayAttr(attrs: Record<string, unknown>, key: string): string[] {
  const value = attrs[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toIdentifier(value: string): string {
  const words = value.match(/[A-Za-z0-9]+/g) ?? ["Widget"];
  const identifier = words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join("");
  return identifier || "Widget";
}
