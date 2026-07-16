import { describe, expect, it } from "vitest";

import { dispatchTool, mcpTools } from "../tools.js";
import { generateWidgetCpp } from "../cppGenerator.js";

describe("generateWidgetCpp", () => {
  it("generates a UUserWidget subclass header and source from structured input", () => {
    const generated = generateWidgetCpp({
      className: "UShopWidget",
      category: "Shop",
      functions: [{ name: "CloseShop" }],
      bindings: [{ type: "UButton", name: "CloseButton" }]
    });

    expect(generated.header).toContain("class MISTYPLANET_API UShopWidget : public UUserWidget");
    expect(generated.header).toContain('#include "Components/Button.h"');
    expect(generated.header).toContain('UFUNCTION(BlueprintCallable, Category="Shop")');
    expect(generated.header).toContain("void CloseShop();");
    expect(generated.header).toContain("UPROPERTY(meta=(BindWidget))");
    expect(generated.header).toContain("TObjectPtr<UButton> CloseButton;");
    expect(generated.cpp).toContain('#include "UI/Generated/ShopWidget.h"');
    expect(generated.cpp).toContain("void UShopWidget::CloseShop()");
  });

  it("uses the provided API macro when one is supplied", () => {
    const generated = generateWidgetCpp({
      className: "UInventoryWidget",
      apiMacro: "OTHERGAME_API",
      category: "Inventory",
      functions: [],
      bindings: []
    });

    expect(generated.header).toContain("class OTHERGAME_API UInventoryWidget : public UUserWidget");
  });

  it("exposes generation as a pure MCP tool result", async () => {
    expect(mcpTools.map((tool) => tool.name)).toContain("ue.ui.generate_widget_cpp");

    const result = await dispatchTool("ue.ui.generate_widget_cpp", {
      className: "UShopWidget",
      category: "Shop",
      functions: [{ name: "CloseShop" }],
      bindings: [{ type: "UButton", name: "CloseButton" }]
    });

    expect(result.isError).toBeUndefined();
    const [content] = result.content;
    expect(content?.type).toBe("text");
    expect(content?.type === "text" ? content.text : "").toContain("TObjectPtr<UButton> CloseButton;");
  });
});
