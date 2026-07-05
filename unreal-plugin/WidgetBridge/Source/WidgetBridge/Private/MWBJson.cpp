#include "MWBJson.h"

#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

TSharedPtr<FJsonObject> FMWBJson::ParseObject(const FString& Body, FString& OutError)
{
    TSharedPtr<FJsonObject> Object;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
    if (!FJsonSerializer::Deserialize(Reader, Object) || !Object.IsValid())
    {
        OutError = TEXT("Invalid JSON object.");
        return nullptr;
    }

    return Object;
}

FString FMWBJson::StringifyObject(const TSharedRef<FJsonObject>& Object)
{
    FString Output;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Object, Writer);
    return Output;
}

TSharedRef<FJsonObject> FMWBJson::Success(const FString& TransactionId, TSharedPtr<FJsonObject> Result)
{
    TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
    Object->SetBoolField(TEXT("ok"), true);
    Object->SetStringField(TEXT("transactionId"), TransactionId);
    Object->SetArrayField(TEXT("changedAssets"), {});
    Object->SetArrayField(TEXT("warnings"), {});
    Object->SetObjectField(TEXT("result"), Result.IsValid() ? Result.ToSharedRef() : MakeShared<FJsonObject>());
    return Object;
}

TSharedRef<FJsonObject> FMWBJson::Failure(const FString& Code, const FString& Message, bool bRetryable)
{
    TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
    TSharedRef<FJsonObject> Error = MakeShared<FJsonObject>();
    Error->SetStringField(TEXT("code"), Code);
    Error->SetStringField(TEXT("message"), Message);
    Error->SetBoolField(TEXT("retryable"), bRetryable);
    Object->SetBoolField(TEXT("ok"), false);
    Object->SetObjectField(TEXT("error"), Error);
    return Object;
}

bool FMWBJson::GetRequiredString(const TSharedPtr<FJsonObject>& Object, const FString& Field, FString& OutValue, FString& OutError)
{
    if (!Object.IsValid() || !Object->TryGetStringField(Field, OutValue) || OutValue.IsEmpty())
    {
        OutError = FString::Printf(TEXT("Missing required string field '%s'."), *Field);
        return false;
    }

    return true;
}
