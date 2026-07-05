#include "WidgetBridgeModule.h"

#include "MWBHttpServer.h"
#include "Modules/ModuleManager.h"

namespace
{
    TUniquePtr<FMWBHttpServer> GServer;
}

void FWidgetBridgeModule::StartupModule()
{
    GServer = MakeUnique<FMWBHttpServer>();
    GServer->Start();
}

void FWidgetBridgeModule::ShutdownModule()
{
    if (GServer)
    {
        GServer->Stop();
        GServer.Reset();
    }
}

IMPLEMENT_MODULE(FWidgetBridgeModule, WidgetBridge)
