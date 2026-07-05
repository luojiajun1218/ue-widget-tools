#pragma once

#include "CoreMinimal.h"

class FJsonObject;

struct FMWBError
{
    FString Code;
    FString Message;
    bool bRetryable = false;
};

struct FMWBResponse
{
    bool bOk = true;
    FString TransactionId;
    TArray<FString> ChangedAssets;
    TArray<FString> Warnings;
    TSharedPtr<FJsonObject> Result;
    TOptional<FMWBError> Error;
};
