import { describe, expect, it } from "vitest";

import { validateWidgetReview } from "../widgetReviewQuality.js";

describe("widget review quality gate", () => {
  it("accepts preview HTML with shell, viewport, required nodes, and tab wiring", () => {
    const result = validateWidgetReview({
      html: validPreviewHtml(),
      viewport: { width: 1280, height: 720 },
      requiredNodes: ["SettingsScreen", "VideoTabButton", "VideoSettingsPage", "AudioSettingsPage"]
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects preview HTML missing a required node", () => {
    const result = validateWidgetReview({
      html: validPreviewHtml(),
      requiredNodes: ["MissingWidget"]
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "MISSING_REQUIRED_NODE",
        severity: "error",
        message: expect.stringContaining("MissingWidget")
      })
    ]);
  });

  it("rejects blank preview HTML", () => {
    const result = validateWidgetReview({ html: "   " });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "BLANK_HTML",
          severity: "error"
        })
      ])
    );
  });

  it("rejects literal undefined or null text in markup", () => {
    const result = validateWidgetReview({
      html: validPreviewHtml().replace("SettingsScreen", "undefined")
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNRESOLVED_LITERAL",
          severity: "error"
        })
      ])
    );
  });
});

function validPreviewHtml(): string {
  return `<!doctype html>
<html>
<body>
  <div class="widget-review-shell">
    <div class="widget-viewport-frame" style="width:1280px;height:720px;">
      <div class="widget-screen" data-node="SettingsScreen" style="width:1280px;height:720px;">
        <button class="widget-tab-button active" data-node="VideoTabButton" data-widget-tab-button="video" aria-selected="true">Video</button>
        <button class="widget-tab-button" data-node="AudioTabButton" data-widget-tab-button="audio" aria-selected="false">Audio</button>
        <div class="widget-tab-page" data-node="VideoSettingsPage" data-widget-tab-page="video">Video settings</div>
        <div class="widget-tab-page" data-node="AudioSettingsPage" data-widget-tab-page="audio" hidden>Audio settings</div>
      </div>
    </div>
  </div>
  <script>
    (() => {
      const buttons = Array.from(document.querySelectorAll('[data-widget-tab-button]'));
      const pages = Array.from(document.querySelectorAll('[data-widget-tab-page]'));
      buttons.forEach((clickedButton) => {
        clickedButton.addEventListener('click', () => {
          const tabId = clickedButton.dataset.widgetTabButton;
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
