#pragma once

#include "CoreMinimal.h"
#include "HttpResultCallback.h"
#include "HttpRouteHandle.h"
#include "HttpServerConstants.h"
#include "HttpServerRequest.h"

struct FHttpServerResponse;
class FJsonObject;
class IHttpRouter;

class FMWBHttpServer
{
public:
    void Start();
    void Stop();

private:
    bool HandleStatus(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);
    bool HandleCommand(const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete);

    static TUniquePtr<FHttpServerResponse> JsonResponse(const TSharedRef<FJsonObject>& Object, EHttpServerResponseCodes Code = EHttpServerResponseCodes::Ok);

    uint32 Port = 17857;
    TSharedPtr<IHttpRouter> Router;
    FHttpRouteHandle StatusRoute;
    FHttpRouteHandle CommandRoute;
};
