#pragma once

#include "CoreMinimal.h"
#include "HttpServerConstants.h"

class FJsonObject;

class FMWBBlueprintGraphService
{
public:
    static TSharedRef<FJsonObject> BindButtonClickedToFunction(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> BindSliderValueChangedToFunction(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> BindCheckBoxChangedToFunction(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

    static TSharedRef<FJsonObject> BindComboBoxSelectionChangedToFunction(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);
};
