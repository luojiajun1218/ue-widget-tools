#include "MWBBlueprintInspectService.h"

#include "Dom/JsonObject.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphNode.h"
#include "Engine/Blueprint.h"
#include "Engine/SCS_Node.h"
#include "Engine/SimpleConstructionScript.h"
#include "Misc/PackageName.h"
#include "MWBJson.h"
#include "UObject/Package.h"
#include "UObject/UnrealType.h"

namespace
{
    constexpr TCHAR AllowedBlueprintPathPrefix[] = TEXT("/Game/");

    FString InspectToLongPackageName(const FString& AssetPath)
    {
        FString PackageName = AssetPath;
        FString ObjectName;
        if (AssetPath.Split(TEXT("."), &PackageName, &ObjectName))
        {
            return PackageName;
        }

        return PackageName;
    }

    FString InspectToObjectPath(const FString& AssetPath)
    {
        if (AssetPath.Contains(TEXT(".")))
        {
            return AssetPath;
        }

        const FString PackageName = InspectToLongPackageName(AssetPath);
        return FString::Printf(TEXT("%s.%s"), *PackageName, *FPackageName::GetShortName(PackageName));
    }

    bool IsAllowedBlueprintPath(const FString& AssetPath)
    {
        return InspectToLongPackageName(AssetPath).StartsWith(AllowedBlueprintPathPrefix, ESearchCase::CaseSensitive)
            && !AssetPath.Contains(TEXT(".."));
    }

    TSharedRef<FJsonObject> SerializeGraph(const UEdGraph* Graph)
    {
        TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
        Object->SetStringField(TEXT("name"), Graph ? Graph->GetName() : TEXT(""));
        Object->SetStringField(TEXT("class"), Graph && Graph->GetClass() ? Graph->GetClass()->GetName() : TEXT(""));
        Object->SetNumberField(TEXT("nodeCount"), Graph ? Graph->Nodes.Num() : 0);

        TArray<TSharedPtr<FJsonValue>> Nodes;
        if (Graph)
        {
            constexpr int32 MaxNodes = 80;
            for (int32 Index = 0; Index < Graph->Nodes.Num() && Index < MaxNodes; ++Index)
            {
                const UEdGraphNode* Node = Graph->Nodes[Index];
                TSharedRef<FJsonObject> NodeObject = MakeShared<FJsonObject>();
                NodeObject->SetStringField(TEXT("name"), Node ? Node->GetName() : TEXT(""));
                NodeObject->SetStringField(TEXT("class"), Node && Node->GetClass() ? Node->GetClass()->GetName() : TEXT(""));
                NodeObject->SetStringField(TEXT("title"), Node ? Node->GetNodeTitle(ENodeTitleType::ListView).ToString() : TEXT(""));
                Nodes.Add(MakeShared<FJsonValueObject>(NodeObject));
            }
        }

        Object->SetArrayField(TEXT("nodes"), Nodes);
        return Object;
    }

    void AddGraphArray(TSharedRef<FJsonObject> Result, const TCHAR* FieldName, const TArray<UEdGraph*>& Graphs, bool bIncludeGraphSummary)
    {
        TArray<TSharedPtr<FJsonValue>> Values;
        for (const UEdGraph* Graph : Graphs)
        {
            if (bIncludeGraphSummary)
            {
                Values.Add(MakeShared<FJsonValueObject>(SerializeGraph(Graph)));
            }
            else
            {
                Values.Add(MakeShared<FJsonValueString>(Graph ? Graph->GetName() : TEXT("")));
            }
        }
        Result->SetArrayField(FieldName, Values);
    }

    TSharedRef<FJsonObject> SerializeVariable(const FBPVariableDescription& Variable)
    {
        TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
        Object->SetStringField(TEXT("name"), Variable.VarName.ToString());
        Object->SetStringField(TEXT("category"), Variable.Category.ToString());
        Object->SetStringField(TEXT("type"), Variable.VarType.PinCategory.ToString());
        Object->SetStringField(TEXT("subCategory"), Variable.VarType.PinSubCategory.ToString());
        if (Variable.VarType.PinSubCategoryObject.IsValid())
        {
            Object->SetStringField(TEXT("subCategoryObject"), Variable.VarType.PinSubCategoryObject->GetPathName());
        }
        Object->SetBoolField(TEXT("isArray"), Variable.VarType.IsArray());
        Object->SetBoolField(TEXT("isSet"), Variable.VarType.IsSet());
        Object->SetBoolField(TEXT("isMap"), Variable.VarType.IsMap());
        return Object;
    }

    TSharedRef<FJsonObject> SerializeSCSNode(const USCS_Node* Node)
    {
        TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
        Object->SetStringField(TEXT("variableName"), Node ? Node->GetVariableName().ToString() : TEXT(""));
        Object->SetStringField(TEXT("componentClass"), Node && Node->ComponentClass ? Node->ComponentClass->GetPathName() : TEXT(""));
        Object->SetStringField(TEXT("templateName"), Node && Node->ComponentTemplate ? Node->ComponentTemplate->GetName() : TEXT(""));
        return Object;
    }

    void AddClassDefaultSummary(TSharedRef<FJsonObject> Result, const UClass* GeneratedClass)
    {
        TArray<TSharedPtr<FJsonValue>> Defaults;
        const UObject* CDO = GeneratedClass ? GeneratedClass->GetDefaultObject(false) : nullptr;
        if (CDO)
        {
            for (TFieldIterator<FProperty> It(GeneratedClass); It; ++It)
            {
                const FProperty* Property = *It;
                if (!Property || Property->HasAnyPropertyFlags(CPF_Transient))
                {
                    continue;
                }

                TSharedRef<FJsonObject> PropertyObject = MakeShared<FJsonObject>();
                PropertyObject->SetStringField(TEXT("name"), Property->GetName());
                PropertyObject->SetStringField(TEXT("class"), Property->GetClass() ? Property->GetClass()->GetName() : TEXT(""));
                Defaults.Add(MakeShared<FJsonValueObject>(PropertyObject));
            }
        }

        Result->SetArrayField(TEXT("classDefaults"), Defaults);
    }
}

TSharedRef<FJsonObject> FMWBBlueprintInspectService::InspectBlueprint(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    FString AssetPath;
    FString Error;
    if (!FMWBJson::GetRequiredString(Payload, TEXT("assetPath"), AssetPath, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_REQUEST"), Error);
    }

    if (!IsAllowedBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(TransactionId, TEXT("ASSET_PATH_NOT_ALLOWED"), TEXT("assetPath must be under /Game/ and must not contain '..'."));
    }

    bool bIncludeGraphSummary = true;
    bool bIncludeClassDefaults = false;
    if (Payload.IsValid())
    {
        Payload->TryGetBoolField(TEXT("includeGraphSummary"), bIncludeGraphSummary);
        Payload->TryGetBoolField(TEXT("includeClassDefaults"), bIncludeClassDefaults);
    }

    UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *InspectToObjectPath(AssetPath));
    if (!Blueprint)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(TransactionId, TEXT("BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No UBlueprint was found at '%s'."), *AssetPath));
    }

    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("assetPath"), AssetPath);
    Result->SetStringField(TEXT("name"), Blueprint->GetName());
    Result->SetStringField(TEXT("blueprintClass"), Blueprint->GetClass() ? Blueprint->GetClass()->GetPathName() : TEXT(""));
    Result->SetStringField(TEXT("parentClass"), Blueprint->ParentClass ? Blueprint->ParentClass->GetPathName() : TEXT(""));
    Result->SetStringField(TEXT("generatedClass"), Blueprint->GeneratedClass ? Blueprint->GeneratedClass->GetPathName() : TEXT(""));
    Result->SetStringField(TEXT("status"), StaticEnum<EBlueprintStatus>()->GetNameStringByValue(Blueprint->Status));

    TArray<TSharedPtr<FJsonValue>> Variables;
    for (const FBPVariableDescription& Variable : Blueprint->NewVariables)
    {
        Variables.Add(MakeShared<FJsonValueObject>(SerializeVariable(Variable)));
    }
    Result->SetArrayField(TEXT("variables"), Variables);

    AddGraphArray(Result, TEXT("functionGraphs"), Blueprint->FunctionGraphs, bIncludeGraphSummary);
    AddGraphArray(Result, TEXT("eventGraphs"), Blueprint->UbergraphPages, bIncludeGraphSummary);
    AddGraphArray(Result, TEXT("macroGraphs"), Blueprint->MacroGraphs, bIncludeGraphSummary);
    AddGraphArray(Result, TEXT("delegateGraphs"), Blueprint->DelegateSignatureGraphs, bIncludeGraphSummary);

    TArray<TSharedPtr<FJsonValue>> Components;
    if (Blueprint->SimpleConstructionScript)
    {
        TArray<USCS_Node*> Nodes = Blueprint->SimpleConstructionScript->GetAllNodes();
        for (const USCS_Node* Node : Nodes)
        {
            Components.Add(MakeShared<FJsonValueObject>(SerializeSCSNode(Node)));
        }
    }
    Result->SetArrayField(TEXT("components"), Components);

    if (bIncludeClassDefaults)
    {
        AddClassDefaultSummary(Result, Blueprint->GeneratedClass);
    }

    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBBlueprintInspectService::Failure(
    const FString& TransactionId,
    const FString& Code,
    const FString& Message,
    bool bRetryable)
{
    TSharedRef<FJsonObject> Object = FMWBJson::Failure(Code, Message, bRetryable);
    Object->SetStringField(TEXT("transactionId"), TransactionId);
    return Object;
}
