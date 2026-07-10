export interface WidgetReviewQualityInput {
  html: string;
  viewport?: {
    width: number;
    height: number;
  };
  requiredNodes?: string[];
}

export interface WidgetReviewQualityIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

export function validateWidgetReview(input: WidgetReviewQualityInput): { ok: boolean; issues: WidgetReviewQualityIssue[] } {
  const issues: WidgetReviewQualityIssue[] = [];
  const html = input.html;

  if (html.trim() === "") {
    issues.push({
      code: "BLANK_HTML",
      severity: "error",
      message: "Preview HTML must not be blank."
    });
    return { ok: false, issues };
  }

  if (!hasClass(html, "widget-review-shell")) {
    issues.push({
      code: "MISSING_REVIEW_SHELL",
      severity: "error",
      message: "Preview HTML must include the widget review shell."
    });
  }

  if (!hasViewportFrame(html, input.viewport)) {
    issues.push({
      code: "MISSING_VIEWPORT_FRAME_SIZE",
      severity: "error",
      message: viewportMessage(input.viewport)
    });
  }

  if (!hasPreviewScaleContract(html)) {
    issues.push({
      code: "MISSING_PREVIEW_SCALE",
      severity: "error",
      message: "Preview HTML must include scale-to-fit CSS for direct browser review."
    });
  }

  for (const nodeName of input.requiredNodes ?? []) {
    if (!hasDataNode(html, nodeName)) {
      issues.push({
        code: "MISSING_REQUIRED_NODE",
        severity: "error",
        message: `Preview HTML is missing required data-node "${nodeName}".`
      });
    }
  }

  if (/\b(undefined|null)\b/i.test(html)) {
    issues.push({
      code: "UNRESOLVED_LITERAL",
      severity: "error",
      message: "Preview HTML must not contain literal undefined or null text."
    });
  }

  validateTabs(html, issues);

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues
  };
}

function hasClass(html: string, className: string): boolean {
  const classAttributePattern = /\bclass\s*=\s*(["'])(.*?)\1/gis;
  for (const match of html.matchAll(classAttributePattern)) {
    const classes = match[2]?.split(/\s+/) ?? [];
    if (classes.includes(className)) {
      return true;
    }
  }
  return false;
}

function hasViewportFrame(html: string, viewport: WidgetReviewQualityInput["viewport"]): boolean {
  for (const tag of tagsWithClass(html, "widget-viewport-frame")) {
    const style = attributeValue(tag, "style");
    if (!style) {
      continue;
    }

    if (viewport) {
      if (hasCssDeclaration(style, "width", `${viewport.width}px`) && hasCssDeclaration(style, "height", `${viewport.height}px`)) {
        return true;
      }
      continue;
    }

    if (
      (/\bwidth\s*:\s*\d+px\b/i.test(style) && /\bheight\s*:\s*\d+px\b/i.test(style)) ||
      (hasCssDeclaration(style, "width", "calc(100vw - 36px)") && hasCssDeclaration(style, "height", "calc(100vh - 96px)"))
    ) {
      return true;
    }
  }

  return false;
}

function viewportMessage(viewport: WidgetReviewQualityInput["viewport"]): string {
  if (viewport) {
    return `Preview HTML must include a widget viewport frame sized ${viewport.width}px by ${viewport.height}px.`;
  }
  return "Preview HTML must include a widget viewport frame with explicit width and height.";
}

function hasDataNode(html: string, nodeName: string): boolean {
  const dataNodePattern = /\bdata-node\s*=\s*(["'])(.*?)\1/gis;
  for (const match of html.matchAll(dataNodePattern)) {
    if (match[2] === nodeName) {
      return true;
    }
  }
  return false;
}

function validateTabs(html: string, issues: WidgetReviewQualityIssue[]): void {
  const hasTabButtons = /\bdata-widget-tab-button\s*=/i.test(html);
  if (hasTabButtons && !hasTabScript(html)) {
    issues.push({
      code: "MISSING_TAB_SCRIPT",
      severity: "error",
      message: "Preview HTML with tab buttons must include JavaScript that wires tab buttons to tab pages."
    });
  }

  const tabPageTags = tagsWithAttribute(html, "data-widget-tab-page");
  if (tabPageTags.length <= 1) {
    return;
  }

  for (const tag of tabPageTags) {
    const style = attributeValue(tag, "style") ?? "";
    if (
      !hasCssDeclaration(style, "height", "100%") ||
      !hasCssDeclaration(style, "min-height", "0") ||
      !hasCssDeclaration(style, "overflow", "auto")
    ) {
      issues.push({
        code: "TAB_PAGE_NOT_SCROLLABLE",
        severity: "error",
        message: "Preview HTML tab pages must be fill-sized and scrollable for dense settings review."
      });
      break;
    }
  }

  if (hasBooleanAttribute(tabPageTags[0] ?? "", "hidden")) {
    issues.push({
      code: "INVALID_TAB_PAGE_VISIBILITY",
      severity: "error",
      message: "The first tab page must be visible by default."
    });
  }

  for (const tag of tabPageTags.slice(1)) {
    if (!hasBooleanAttribute(tag, "hidden")) {
      issues.push({
        code: "INVALID_TAB_PAGE_VISIBILITY",
        severity: "error",
        message: "All tab pages after the first must be hidden by default."
      });
      return;
    }
  }
}

function hasPreviewScaleContract(html: string): boolean {
  return /--widget-preview-scale\b/i.test(html) && /transform\s*:\s*scale\(\s*var\(\s*--widget-preview-scale\s*\)\s*\)/i.test(html);
}

function hasTabScript(html: string): boolean {
  return (
    /<script\b/i.test(html) &&
    /querySelectorAll\(\s*(['"])\[data-widget-tab-button\]\1\s*\)/i.test(html) &&
    /querySelectorAll\(\s*(['"])\[data-widget-tab-page\]\1\s*\)/i.test(html) &&
    /addEventListener\(\s*(['"])click\1/i.test(html) &&
    /widgetTabButton/.test(html) &&
    /widgetTabPage/.test(html)
  );
}

function tagsWithClass(html: string, className: string): string[] {
  return tagsWithAttribute(html, "class").filter((tag) => {
    const classValue = attributeValue(tag, "class");
    return classValue?.split(/\s+/).includes(className) ?? false;
  });
}

function tagsWithAttribute(html: string, attributeName: string): string[] {
  const tagPattern = /<([a-z][\w:-]*)\b[^>]*>/gis;
  return Array.from(html.matchAll(tagPattern), (match) => match[0]).filter((tag) =>
    new RegExp(`\\b${escapeRegExp(attributeName)}(?:\\s*=|\\b)`, "i").test(tag)
  );
}

function attributeValue(tag: string, attributeName: string): string | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(attributeName)}\\s*=\\s*(["'])(.*?)\\1`, "is");
  return pattern.exec(tag)?.[2];
}

function hasBooleanAttribute(tag: string, attributeName: string): boolean {
  return new RegExp(`\\b${escapeRegExp(attributeName)}(?:\\s*=|\\b)`, "i").test(tag);
}

function hasCssDeclaration(style: string, property: string, value: string): boolean {
  return new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*${escapeRegExp(value)}\\s*(?:;|$)`, "i").test(style);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
