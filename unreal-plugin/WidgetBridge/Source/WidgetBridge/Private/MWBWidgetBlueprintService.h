#pragma once

#include "CoreMinimal.h"
#include "HttpServerConstants.h"

class FJsonObject;
class UWidget;
class UWidgetBlueprint;

class FMWBWidgetBlueprintService
{
public:
    static TSharedRef<FJsonObject> HandleCommand(
        const FString& Command,
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

private:
    static TSharedRef<FJsonObject> InspectWidgetTree(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> CreateWidgetBlueprint(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> SetWidgetParentClass(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> ApplyWidgetLayout(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> CompileWidget(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> FinalizeWidget(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> CaptureWidgetPreview(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> CompareUiImages(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> ImportUiPng(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> Failure(
        const FString& TransactionId,
        const FString& Code,
        const FString& Message,
        bool bRetryable = false);

    static TSharedRef<FJsonObject> SerializeWidget(const UWidget* Widget);
    static UWidgetBlueprint* LoadWidgetBlueprint(const FString& AssetPath);
    static bool IsAllowedWidgetBlueprintPath(const FString& AssetPath);
};
