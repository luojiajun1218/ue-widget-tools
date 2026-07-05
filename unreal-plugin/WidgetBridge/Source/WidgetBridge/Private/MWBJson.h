#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "MWBTypes.h"

class FMWBJson
{
public:
    static TSharedPtr<FJsonObject> ParseObject(const FString& Body, FString& OutError);
    static FString StringifyObject(const TSharedRef<FJsonObject>& Object);
    static TSharedRef<FJsonObject> Success(const FString& TransactionId, TSharedPtr<FJsonObject> Result);
    static TSharedRef<FJsonObject> Failure(const FString& Code, const FString& Message, bool bRetryable = false);
    static bool GetRequiredString(const TSharedPtr<FJsonObject>& Object, const FString& Field, FString& OutValue, FString& OutError);
};
