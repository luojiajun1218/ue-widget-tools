#include "MWBBlueprintGraphService.h"

#include "Blueprint/WidgetTree.h"
#include "Components/Button.h"
#include "Components/CheckBox.h"
#include "Components/ComboBoxString.h"
#include "Components/Slider.h"
#include "Dom/JsonObject.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphPin.h"
#include "EdGraphSchema_K2.h"
#include "EdGraphSchema_K2_Actions.h"
#include "K2Node_CallFunction.h"
#include "K2Node_ComponentBoundEvent.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/CompilerResultsLog.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Logging/TokenizedMessage.h"
#include "Misc/PackageName.h"
#include "MWBJson.h"
#include "ScopedTransaction.h"
#include "UObject/FieldIterator.h"
#include "UObject/UnrealType.h"
#include "WidgetBlueprint.h"

namespace
{
    constexpr TCHAR GraphAllowedWidgetBlueprintPathPrefix[] = TEXT("/Game/MistyPlanet/UI/");
    const FName ButtonClickedDelegateName(TEXT("OnClicked"));
    const FName SliderValueChangedDelegateName(TEXT("OnValueChanged"));
    const FName CheckBoxChangedDelegateName(TEXT("OnCheckStateChanged"));
    const FName ComboBoxSelectionChangedDelegateName(TEXT("OnSelectionChanged"));

    enum class EMWBGraphPayloadType
    {
        None,
        Float,
        Bool,
        String
    };

    struct FMWBGraphBindingSpec
    {
        const TCHAR* CommandName;
        const TCHAR* TransactionDescription;
        const TCHAR* WidgetFieldName;
        const TCHAR* ResultWidgetFieldName;
        const TCHAR* WidgetDisplayName;
        UClass* WidgetClass;
        FName DelegateName;
        FName PayloadPinName;
        EMWBGraphPayloadType PayloadType;
    };

    FString GraphToLongPackageName(const FString& AssetPath)
    {
        FString PackageName = AssetPath;
        FString ObjectName;
        if (AssetPath.Split(TEXT("."), &PackageName, &ObjectName))
        {
            return PackageName;
        }

        return PackageName;
    }

    FString GraphToObjectPath(const FString& AssetPath)
    {
        if (AssetPath.Contains(TEXT(".")))
        {
            return AssetPath;
        }

        const FString PackageName = GraphToLongPackageName(AssetPath);
        return FString::Printf(TEXT("%s.%s"), *PackageName, *FPackageName::GetShortName(PackageName));
    }

    bool IsGraphAllowedWidgetBlueprintPath(const FString& AssetPath)
    {
        return GraphToLongPackageName(AssetPath).StartsWith(GraphAllowedWidgetBlueprintPathPrefix, ESearchCase::CaseSensitive)
            && !AssetPath.Contains(TEXT(".."));
    }

    TSharedRef<FJsonObject> Failure(
        const FString& TransactionId,
        const FString& Code,
        const FString& Message,
        const bool bRetryable = false)
    {
        TSharedRef<FJsonObject> Object = FMWBJson::Failure(Code, Message, bRetryable);
        Object->SetStringField(TEXT("transactionId"), TransactionId);
        return Object;
    }

    TSharedRef<FJsonObject> CompileGraphBlueprintToResult(UWidgetBlueprint* WidgetBlueprint)
    {
        FCompilerResultsLog CompileLog;
        CompileLog.bSilentMode = true;
        FKismetEditorUtilities::CompileBlueprint(WidgetBlueprint, EBlueprintCompileOptions::None, &CompileLog);

        TArray<TSharedPtr<FJsonValue>> Messages;
        for (const TSharedRef<FTokenizedMessage>& Message : CompileLog.Messages)
        {
            Messages.Add(MakeShared<FJsonValueString>(Message->ToText().ToString()));
        }

        TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
        Result->SetStringField(TEXT("assetPath"), WidgetBlueprint->GetPathName());
        Result->SetBoolField(TEXT("compiled"), CompileLog.NumErrors == 0);
        Result->SetNumberField(TEXT("errorCount"), CompileLog.NumErrors);
        Result->SetNumberField(TEXT("warningCount"), CompileLog.NumWarnings);
        Result->SetArrayField(TEXT("messages"), Messages);
        return Result;
    }

    UFunction* FindCallableFunction(UWidgetBlueprint* WidgetBlueprint, const FName FunctionName)
    {
        if (WidgetBlueprint->GeneratedClass)
        {
            if (UFunction* Function = WidgetBlueprint->GeneratedClass->FindFunctionByName(FunctionName))
            {
                return Function;
            }
        }

        if (WidgetBlueprint->SkeletonGeneratedClass)
        {
            return WidgetBlueprint->SkeletonGeneratedClass->FindFunctionByName(FunctionName);
        }

        return nullptr;
    }

    bool HasUnsupportedRequiredInputParams(const UFunction* Function, FString& OutReason)
    {
        if (Function->HasAnyFunctionFlags(FUNC_BlueprintPure))
        {
            OutReason = TEXT("Pure functions do not expose exec pins for this MVP.");
            return true;
        }

        for (TFieldIterator<FProperty> It(Function); It && It->HasAnyPropertyFlags(CPF_Parm); ++It)
        {
            const FProperty* Param = *It;
            if (Param->HasAnyPropertyFlags(CPF_ReturnParm) || Param->HasAnyPropertyFlags(CPF_OutParm))
            {
                continue;
            }

            const FString DefaultMetadataKey = FString::Printf(TEXT("CPP_Default_%s"), *Param->GetName());
            if (!Function->HasMetaData(*DefaultMetadataKey))
            {
                OutReason = FString::Printf(TEXT("Parameter '%s' requires a value."), *Param->GetName());
                return true;
            }
        }

        return false;
    }

    bool IsSupportedPayloadProperty(const FProperty* Param, const EMWBGraphPayloadType PayloadType, FString& OutExpectedType)
    {
        switch (PayloadType)
        {
        case EMWBGraphPayloadType::Float:
            OutExpectedType = TEXT("float");
            return Param && Param->IsA<FFloatProperty>();
        case EMWBGraphPayloadType::Bool:
            OutExpectedType = TEXT("bool");
            return Param && Param->IsA<FBoolProperty>();
        case EMWBGraphPayloadType::String:
            OutExpectedType = TEXT("FString");
            return Param && Param->IsA<FStrProperty>();
        case EMWBGraphPayloadType::None:
        default:
            OutExpectedType = TEXT("no input parameters");
            return false;
        }
    }

    bool ValidateFunctionSignature(
        const UFunction* Function,
        const EMWBGraphPayloadType PayloadType,
        FName& OutPayloadParamName,
        FString& OutReason)
    {
        if (PayloadType == EMWBGraphPayloadType::None)
        {
            return !HasUnsupportedRequiredInputParams(Function, OutReason);
        }

        if (Function->HasAnyFunctionFlags(FUNC_BlueprintPure))
        {
            OutReason = TEXT("Pure functions do not expose exec pins for this MVP.");
            return false;
        }

        const FProperty* PayloadParam = nullptr;
        int32 InputParamCount = 0;
        for (TFieldIterator<FProperty> It(Function); It && It->HasAnyPropertyFlags(CPF_Parm); ++It)
        {
            const FProperty* Param = *It;
            if (Param->HasAnyPropertyFlags(CPF_ReturnParm) || Param->HasAnyPropertyFlags(CPF_OutParm))
            {
                continue;
            }

            ++InputParamCount;
            PayloadParam = Param;
        }

        if (InputParamCount != 1 || !PayloadParam)
        {
            FString ExpectedType;
            IsSupportedPayloadProperty(nullptr, PayloadType, ExpectedType);
            OutReason = FString::Printf(TEXT("Expected exactly one %s input parameter, found %d."), *ExpectedType, InputParamCount);
            return false;
        }

        FString ExpectedType;
        if (!IsSupportedPayloadProperty(PayloadParam, PayloadType, ExpectedType))
        {
            OutReason = FString::Printf(TEXT("Parameter '%s' must be %s."), *PayloadParam->GetName(), *ExpectedType);
            return false;
        }

        OutPayloadParamName = PayloadParam->GetFName();
        return true;
    }

    FObjectProperty* FindWidgetObjectProperty(UWidgetBlueprint* WidgetBlueprint, const FName WidgetName)
    {
        if (WidgetBlueprint->SkeletonGeneratedClass)
        {
            if (FObjectProperty* Property = FindFProperty<FObjectProperty>(WidgetBlueprint->SkeletonGeneratedClass, WidgetName))
            {
                return Property;
            }
        }

        if (WidgetBlueprint->GeneratedClass)
        {
            return FindFProperty<FObjectProperty>(WidgetBlueprint->GeneratedClass, WidgetName);
        }

        return nullptr;
    }

    UEdGraph* FindOrCreateEventGraph(UWidgetBlueprint* WidgetBlueprint)
    {
        if (UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(WidgetBlueprint))
        {
            return EventGraph;
        }

        UEdGraph* EventGraph = FBlueprintEditorUtils::CreateNewGraph(
            WidgetBlueprint,
            UEdGraphSchema_K2::GN_EventGraph,
            UEdGraph::StaticClass(),
            UEdGraphSchema_K2::StaticClass());
        FBlueprintEditorUtils::AddUbergraphPage(WidgetBlueprint, EventGraph);
        return EventGraph;
    }

    bool IsCallToFunction(const UEdGraphPin* LinkedPin, const FName FunctionName)
    {
        const UK2Node_CallFunction* CallNode = LinkedPin ? Cast<UK2Node_CallFunction>(LinkedPin->GetOwningNode()) : nullptr;
        return CallNode && CallNode->FunctionReference.GetMemberName() == FunctionName;
    }

    UEdGraphPin* FindPayloadPin(UEdGraphNode* Node, const FName PinName, const EEdGraphPinDirection Direction)
    {
        return Node ? Node->FindPin(PinName, Direction) : nullptr;
    }

    TSharedRef<FJsonObject> BindWidgetEventToFunction(
        const FString& TransactionId,
        const TSharedPtr<FJsonObject>& Payload,
        EHttpServerResponseCodes& OutStatusCode,
        const FMWBGraphBindingSpec& Spec)
    {
        FString AssetPath;
        FString WidgetName;
        FString FunctionNameString;
        FString Error;
        if (!FMWBJson::GetRequiredString(Payload, TEXT("assetPath"), AssetPath, Error)
            || !FMWBJson::GetRequiredString(Payload, Spec.WidgetFieldName, WidgetName, Error)
            || !FMWBJson::GetRequiredString(Payload, TEXT("functionName"), FunctionNameString, Error))
        {
            OutStatusCode = EHttpServerResponseCodes::BadRequest;
            return Failure(TransactionId, TEXT("INVALID_REQUEST"), Error);
        }

        if (!IsGraphAllowedWidgetBlueprintPath(AssetPath))
        {
            OutStatusCode = EHttpServerResponseCodes::Forbidden;
            return Failure(
                TransactionId,
                TEXT("ASSET_PATH_NOT_ALLOWED"),
                FString::Printf(TEXT("assetPath must be under %s."), GraphAllowedWidgetBlueprintPathPrefix));
        }

        UWidgetBlueprint* WidgetBlueprint = LoadObject<UWidgetBlueprint>(nullptr, *GraphToObjectPath(AssetPath));
        if (!WidgetBlueprint)
        {
            OutStatusCode = EHttpServerResponseCodes::NotFound;
            return Failure(TransactionId, TEXT("WIDGET_BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No UWidgetBlueprint was found at '%s'."), *AssetPath));
        }

        if (!WidgetBlueprint->WidgetTree)
        {
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(TransactionId, TEXT("WIDGET_TREE_MISSING"), FString::Printf(TEXT("Widget Blueprint '%s' has no WidgetTree."), *AssetPath));
        }

        UWidget* Widget = WidgetBlueprint->WidgetTree->FindWidget(FName(*WidgetName));
        if (!Widget || !Widget->IsA(Spec.WidgetClass))
        {
            OutStatusCode = Widget ? EHttpServerResponseCodes::BadRequest : EHttpServerResponseCodes::NotFound;
            return Failure(
                TransactionId,
                Widget ? TEXT("WIDGET_CLASS_MISMATCH") : TEXT("WIDGET_NOT_FOUND"),
                Widget
                    ? FString::Printf(TEXT("Widget '%s' is not a %s."), *WidgetName, Spec.WidgetDisplayName)
                    : FString::Printf(TEXT("Widget '%s' was not found in the WidgetTree."), *WidgetName));
        }

        const FName FunctionName(*FunctionNameString);
        UFunction* TargetFunction = FindCallableFunction(WidgetBlueprint, FunctionName);
        if (!TargetFunction || !TargetFunction->HasAnyFunctionFlags(FUNC_BlueprintCallable))
        {
            OutStatusCode = EHttpServerResponseCodes::BadRequest;
            return Failure(TransactionId, TEXT("FUNCTION_NOT_BLUEPRINT_CALLABLE"), FString::Printf(TEXT("Function '%s' was not found as a BlueprintCallable function."), *FunctionNameString));
        }

        FName FunctionPayloadParamName;
        FString UnsupportedReason;
        if (!ValidateFunctionSignature(TargetFunction, Spec.PayloadType, FunctionPayloadParamName, UnsupportedReason))
        {
            OutStatusCode = EHttpServerResponseCodes::BadRequest;
            return Failure(
                TransactionId,
                TEXT("UNSUPPORTED_FUNCTION_SIGNATURE"),
                FString::Printf(TEXT("Function '%s' is not supported: %s"), *FunctionNameString, *UnsupportedReason));
        }

        FObjectProperty* WidgetProperty = FindWidgetObjectProperty(WidgetBlueprint, FName(*WidgetName));
        if (!WidgetProperty || !WidgetProperty->PropertyClass || !WidgetProperty->PropertyClass->IsChildOf(Spec.WidgetClass))
        {
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(
                TransactionId,
                TEXT("WIDGET_PROPERTY_NOT_FOUND"),
                FString::Printf(TEXT("Could not resolve generated widget property for %s '%s'. Compile the Widget Blueprint and retry."), Spec.WidgetDisplayName, *WidgetName));
        }

        FMulticastDelegateProperty* DelegateProperty = FindFProperty<FMulticastDelegateProperty>(Spec.WidgetClass, Spec.DelegateName);
        if (!DelegateProperty)
        {
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(
                TransactionId,
                TEXT("WIDGET_DELEGATE_NOT_FOUND"),
                FString::Printf(TEXT("%s::%s delegate property was not found."), *Spec.WidgetClass->GetName(), *Spec.DelegateName.ToString()));
        }

        FScopedTransaction Transaction(FText::FromString(Spec.TransactionDescription));
        WidgetBlueprint->Modify();
        WidgetBlueprint->WidgetTree->Modify();

        UEdGraph* EventGraph = FindOrCreateEventGraph(WidgetBlueprint);
        if (!EventGraph)
        {
            Transaction.Cancel();
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(TransactionId, TEXT("EVENT_GRAPH_UNAVAILABLE"), TEXT("Could not find or create the Widget Blueprint event graph."));
        }
        EventGraph->Modify();

        bool bCreatedEventNode = false;
        bool bCreatedCallNode = false;
        bool bAlreadyBound = false;
        UK2Node_ComponentBoundEvent* EventNode = const_cast<UK2Node_ComponentBoundEvent*>(
            FKismetEditorUtilities::FindBoundEventForComponent(WidgetBlueprint, Spec.DelegateName, WidgetProperty->GetFName()));

        if (!EventNode)
        {
            EventNode = FEdGraphSchemaAction_K2NewNode::SpawnNode<UK2Node_ComponentBoundEvent>(
                EventGraph,
                EventGraph->GetGoodPlaceForNewNode(),
                EK2NewNodeFlags::None,
                [&WidgetProperty, &DelegateProperty](UK2Node_ComponentBoundEvent* NewInstance)
                {
                    NewInstance->InitializeComponentBoundEventParams(WidgetProperty, DelegateProperty);
                });
            bCreatedEventNode = EventNode != nullptr;
        }

        if (!EventNode)
        {
            Transaction.Cancel();
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(TransactionId, TEXT("BOUND_EVENT_CREATE_FAILED"), FString::Printf(TEXT("Failed to create a component-bound %s event node."), *Spec.DelegateName.ToString()));
        }

        UEdGraphPin* EventThenPin = EventNode->FindPin(UEdGraphSchema_K2::PN_Then, EGPD_Output);
        if (!EventThenPin)
        {
            Transaction.Cancel();
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(TransactionId, TEXT("BOUND_EVENT_EXEC_PIN_MISSING"), FString::Printf(TEXT("The %s bound event node has no exec output pin."), *Spec.DelegateName.ToString()));
        }

        for (UEdGraphPin* LinkedPin : EventThenPin->LinkedTo)
        {
            if (IsCallToFunction(LinkedPin, FunctionName))
            {
                bAlreadyBound = true;
                break;
            }
        }

        if (!bAlreadyBound && EventThenPin->LinkedTo.Num() > 0)
        {
            Transaction.Cancel();
            OutStatusCode = EHttpServerResponseCodes::BadRequest;
            return Failure(
                TransactionId,
                TEXT("UNSUPPORTED_EXISTING_BINDING"),
                FString::Printf(TEXT("The %s event already has an exec connection. This MVP does not insert into existing execution chains."), *Spec.DelegateName.ToString()));
        }

        if (!bAlreadyBound)
        {
            UK2Node_CallFunction* CallNode = FEdGraphSchemaAction_K2NewNode::SpawnNode<UK2Node_CallFunction>(
                EventGraph,
                FVector2D(EventNode->NodePosX + 320.0f, EventNode->NodePosY),
                EK2NewNodeFlags::None,
                [TargetFunction, WidgetBlueprint](UK2Node_CallFunction* NewInstance)
                {
                    NewInstance->FunctionReference.SetFromField<UFunction>(TargetFunction, WidgetBlueprint->GeneratedClass);
                });

            if (!CallNode)
            {
                Transaction.Cancel();
                OutStatusCode = EHttpServerResponseCodes::ServerError;
                return Failure(TransactionId, TEXT("CALL_NODE_CREATE_FAILED"), FString::Printf(TEXT("Failed to create call node for function '%s'."), *FunctionNameString));
            }

            UEdGraphPin* CallExecPin = CallNode->GetExecPin();
            if (!CallExecPin)
            {
                Transaction.Cancel();
                OutStatusCode = EHttpServerResponseCodes::ServerError;
                return Failure(TransactionId, TEXT("CALL_NODE_EXEC_PIN_MISSING"), FString::Printf(TEXT("Call node for function '%s' has no exec input pin."), *FunctionNameString));
            }

            const UEdGraphSchema_K2* Schema = GetDefault<UEdGraphSchema_K2>();
            if (!Schema || !Schema->TryCreateConnection(EventThenPin, CallExecPin))
            {
                Transaction.Cancel();
                OutStatusCode = EHttpServerResponseCodes::ServerError;
                return Failure(TransactionId, TEXT("EXEC_CONNECTION_FAILED"), FString::Printf(TEXT("Failed to connect %s exec output to the function call exec input."), *Spec.DelegateName.ToString()));
            }

            if (Spec.PayloadType != EMWBGraphPayloadType::None)
            {
                UEdGraphPin* EventPayloadPin = FindPayloadPin(EventNode, Spec.PayloadPinName, EGPD_Output);
                UEdGraphPin* CallPayloadPin = FindPayloadPin(CallNode, FunctionPayloadParamName, EGPD_Input);
                if (!EventPayloadPin || !CallPayloadPin)
                {
                    Transaction.Cancel();
                    OutStatusCode = EHttpServerResponseCodes::ServerError;
                    return Failure(
                        TransactionId,
                        TEXT("PAYLOAD_PIN_MISSING"),
                        FString::Printf(TEXT("Could not resolve payload pins for %s -> %s."), *Spec.DelegateName.ToString(), *FunctionNameString));
                }

                if (!Schema->TryCreateConnection(EventPayloadPin, CallPayloadPin))
                {
                    Transaction.Cancel();
                    OutStatusCode = EHttpServerResponseCodes::ServerError;
                    return Failure(
                        TransactionId,
                        TEXT("PAYLOAD_CONNECTION_FAILED"),
                        FString::Printf(TEXT("Failed to connect %s payload pin '%s' to function parameter '%s'."), *Spec.DelegateName.ToString(), *Spec.PayloadPinName.ToString(), *FunctionPayloadParamName.ToString()));
                }
            }

            bCreatedCallNode = true;
        }

        FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
        WidgetBlueprint->MarkPackageDirty();

        TSharedRef<FJsonObject> Result = CompileGraphBlueprintToResult(WidgetBlueprint);
        Result->SetStringField(Spec.ResultWidgetFieldName, WidgetName);
        Result->SetStringField(TEXT("functionName"), FunctionNameString);
        Result->SetStringField(TEXT("delegateName"), Spec.DelegateName.ToString());
        Result->SetBoolField(TEXT("createdEventNode"), bCreatedEventNode);
        Result->SetBoolField(TEXT("createdCallNode"), bCreatedCallNode);
        Result->SetBoolField(TEXT("alreadyBound"), bAlreadyBound);

        OutStatusCode = EHttpServerResponseCodes::Ok;
        return FMWBJson::Success(TransactionId, Result);
    }
}

TSharedRef<FJsonObject> FMWBBlueprintGraphService::BindButtonClickedToFunction(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    const FMWBGraphBindingSpec Spec{
        TEXT("bindButtonClickedToFunction"),
        TEXT("Bind Button Clicked To Function"),
        TEXT("buttonName"),
        TEXT("buttonName"),
        TEXT("UButton"),
        UButton::StaticClass(),
        ButtonClickedDelegateName,
        NAME_None,
        EMWBGraphPayloadType::None
    };
    return BindWidgetEventToFunction(TransactionId, Payload, OutStatusCode, Spec);
}

TSharedRef<FJsonObject> FMWBBlueprintGraphService::BindSliderValueChangedToFunction(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    const FMWBGraphBindingSpec Spec{
        TEXT("bindSliderValueChangedToFunction"),
        TEXT("Bind Slider Value Changed To Function"),
        TEXT("sliderName"),
        TEXT("sliderName"),
        TEXT("USlider"),
        USlider::StaticClass(),
        SliderValueChangedDelegateName,
        TEXT("Value"),
        EMWBGraphPayloadType::Float
    };
    return BindWidgetEventToFunction(TransactionId, Payload, OutStatusCode, Spec);
}

TSharedRef<FJsonObject> FMWBBlueprintGraphService::BindCheckBoxChangedToFunction(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    const FMWBGraphBindingSpec Spec{
        TEXT("bindCheckBoxChangedToFunction"),
        TEXT("Bind Check Box Changed To Function"),
        TEXT("checkBoxName"),
        TEXT("checkBoxName"),
        TEXT("UCheckBox"),
        UCheckBox::StaticClass(),
        CheckBoxChangedDelegateName,
        TEXT("bIsChecked"),
        EMWBGraphPayloadType::Bool
    };
    return BindWidgetEventToFunction(TransactionId, Payload, OutStatusCode, Spec);
}

TSharedRef<FJsonObject> FMWBBlueprintGraphService::BindComboBoxSelectionChangedToFunction(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    const FMWBGraphBindingSpec Spec{
        TEXT("bindComboBoxSelectionChangedToFunction"),
        TEXT("Bind Combo Box Selection Changed To Function"),
        TEXT("comboBoxName"),
        TEXT("comboBoxName"),
        TEXT("UComboBoxString"),
        UComboBoxString::StaticClass(),
        ComboBoxSelectionChangedDelegateName,
        TEXT("SelectedItem"),
        EMWBGraphPayloadType::String
    };
    return BindWidgetEventToFunction(TransactionId, Payload, OutStatusCode, Spec);
}
