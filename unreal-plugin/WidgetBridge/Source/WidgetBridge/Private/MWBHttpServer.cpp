#include "MWBHttpServer.h"

#include "HttpPath.h"
#include "HttpRequestHandler.h"
#include "HttpServerModule.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"
#include "Misc/Char.h"
#include "MWBJson.h"
#include "MWBWidgetBlueprintService.h"

void FMWBHttpServer::Start()
{
    FHttpServerModule& HttpServerModule = FHttpServerModule::Get();
    Router = HttpServerModule.GetHttpRouter(Port);
    if (!Router.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("WidgetBridge failed to create HTTP router on port %u."), Port);
        return;
    }

    StatusRoute = Router->BindRoute(
        FHttpPath(TEXT("/status")),
        EHttpServerRequestVerbs::VERB_GET,
        FHttpRequestHandler::CreateRaw(this, &FMWBHttpServer::HandleStatus));

    CommandRoute = Router->BindRoute(
        FHttpPath(TEXT("/command")),
        EHttpServerRequestVerbs::VERB_POST,
        FHttpRequestHandler::CreateRaw(this, &FMWBHttpServer::HandleCommand));

    HttpServerModule.StartAllListeners();
    UE_LOG(LogTemp, Display, TEXT("WidgetBridge listening on http://127.0.0.1:%u"), Port);
}

void FMWBHttpServer::Stop()
{
    if (Router.IsValid())
    {
        if (StatusRoute.IsValid())
        {
            Router->UnbindRoute(StatusRoute);
            StatusRoute.Reset();
        }

        if (CommandRoute.IsValid())
        {
            Router->UnbindRoute(CommandRoute);
            CommandRoute.Reset();
        }

        Router.Reset();
    }

    if (FHttpServerModule::IsAvailable())
    {
        FHttpServerModule::Get().StopAllListeners();
    }
}

bool FMWBHttpServer::HandleStatus(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetBoolField(TEXT("ok"), true);
    Result->SetStringField(TEXT("bridge"), TEXT("WidgetBridge"));
    Result->SetStringField(TEXT("version"), TEXT("0.1.0"));
    Result->SetStringField(TEXT("engineTarget"), TEXT("5.7"));
    OnComplete(JsonResponse(Result));
    return true;
}

bool FMWBHttpServer::HandleCommand(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
{
    const FUTF8ToTCHAR BodyConverter(reinterpret_cast<const ANSICHAR*>(Request.Body.GetData()), Request.Body.Num());
    const FString Body(BodyConverter.Length(), BodyConverter.Get());

    FString ParseError;
    TSharedPtr<FJsonObject> CommandObject = FMWBJson::ParseObject(Body, ParseError);
    if (!CommandObject.IsValid())
    {
        OnComplete(JsonResponse(FMWBJson::Failure(TEXT("INVALID_JSON"), ParseError), EHttpServerResponseCodes::BadRequest));
        return true;
    }

    FString Command;
    FString RequestError;
    if (!FMWBJson::GetRequiredString(CommandObject, TEXT("command"), Command, RequestError))
    {
        OnComplete(JsonResponse(FMWBJson::Failure(TEXT("INVALID_REQUEST"), RequestError), EHttpServerResponseCodes::BadRequest));
        return true;
    }

    FString TransactionId;
    if (!FMWBJson::GetRequiredString(CommandObject, TEXT("transactionId"), TransactionId, RequestError))
    {
        TransactionId = TEXT("");
    }

    const TSharedPtr<FJsonObject>* Payload = nullptr;
    if (!CommandObject->TryGetObjectField(TEXT("payload"), Payload) || !Payload || !Payload->IsValid())
    {
        OnComplete(JsonResponse(FMWBJson::Failure(TEXT("INVALID_REQUEST"), TEXT("Missing required object field 'payload'.")), EHttpServerResponseCodes::BadRequest));
        return true;
    }

    EHttpServerResponseCodes StatusCode = EHttpServerResponseCodes::Ok;
    TSharedRef<FJsonObject> Result = FMWBWidgetBlueprintService::HandleCommand(Command, TransactionId, *Payload, StatusCode);
    OnComplete(JsonResponse(Result, StatusCode));
    return true;
}

TUniquePtr<FHttpServerResponse> FMWBHttpServer::JsonResponse(const TSharedRef<FJsonObject>& Object, EHttpServerResponseCodes Code)
{
    TUniquePtr<FHttpServerResponse> Response = FHttpServerResponse::Create(FMWBJson::StringifyObject(Object), TEXT("application/json"));
    Response->Code = Code;
    return Response;
}
