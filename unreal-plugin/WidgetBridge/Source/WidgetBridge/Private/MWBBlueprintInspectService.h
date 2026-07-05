#pragma once

#include "CoreMinimal.h"
#include "HttpServerConstants.h"

class FJsonObject;

class FMWBBlueprintInspectService
{
public:
    static TSharedRef<FJsonObject> InspectBlueprint(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode);

private:
    static TSharedRef<FJsonObject> Failure(
        const FString& TransactionId,
        const FString& Code,
        const FString& Message,
        bool bRetryable = false);
};
