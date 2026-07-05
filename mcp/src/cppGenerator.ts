import {
  generateWidgetCppSchema,
  type GenerateWidgetCppInput,
  type ParsedGenerateWidgetCppInput
} from "./schemas.js";

export interface GeneratedWidgetCpp {
  header: string;
  cpp: string;
}

export function generateWidgetCpp(input: GenerateWidgetCppInput): GeneratedWidgetCpp {
  const parsed = generateWidgetCppSchema.parse(input);

  return {
    header: generateHeader(parsed),
    cpp: generateCpp(parsed)
  };
}

function generateHeader(input: ParsedGenerateWidgetCppInput): string {
  const componentIncludes = [...new Set(input.bindings.map((binding) => componentInclude(binding.type)))].filter(
    (include): include is string => include !== undefined
  );
  const functionDeclarations = input.functions.flatMap((func) => [
    `  UFUNCTION(BlueprintCallable, Category="${input.category}")`,
    `  void ${func.name}();`
  ]);
  const bindingDeclarations = input.bindings.flatMap((binding) => [
    "  UPROPERTY(meta=(BindWidget))",
    `  TObjectPtr<${binding.type}> ${binding.name};`
  ]);
  const bodyLines = [...functionDeclarations, ...bindingDeclarations];

  return [
    "#pragma once",
    "",
    '#include "CoreMinimal.h"',
    '#include "Blueprint/UserWidget.h"',
    ...componentIncludes.map((include) => `#include "${include}"`),
    `#include "${headerFileName(input.className).replace(/\.h$/, ".generated.h")}"`,
    "",
    "UCLASS()",
    `class ${input.apiMacro} ${input.className} : public UUserWidget`,
    "{",
    "  GENERATED_BODY()",
    ...(bodyLines.length > 0 ? ["", "public:", ...bodyLines] : []),
    "};",
    ""
  ].join("\n");
}

function generateCpp(input: ParsedGenerateWidgetCppInput): string {
  const definitions = input.functions.flatMap((func) => [
    `void ${input.className}::${func.name}()`,
    "{",
    "}",
    ""
  ]);

  return [`#include "${headerFileName(input.className)}"`, "", ...definitions].join("\n");
}

function headerFileName(className: string): string {
  const fileStem = className.startsWith("U") && className.length > 1 ? className.slice(1) : className;

  return `${fileStem}.h`;
}

function componentInclude(typeName: string): string | undefined {
  const withoutPrefix = typeName.startsWith("U") && typeName.length > 1 ? typeName.slice(1) : typeName;
  const knownComponentTypes = new Set([
    "Button",
    "TextBlock",
    "Image",
    "Border",
    "ProgressBar",
    "CanvasPanel",
    "Overlay",
    "VerticalBox",
    "HorizontalBox",
    "ScrollBox",
    "WidgetSwitcher",
    "Slider",
    "CheckBox",
    "ComboBoxString",
    "SizeBox",
    "Spacer"
  ]);

  return knownComponentTypes.has(withoutPrefix) ? `Components/${withoutPrefix}.h` : undefined;
}
