#include "MWBWidgetBlueprintService.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/CheckBox.h"
#include "Components/ComboBoxString.h"
#include "Components/ContentWidget.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/Image.h"
#include "Components/NamedSlotInterface.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Components/PanelWidget.h"
#include "Components/ScrollBox.h"
#include "Components/SizeBox.h"
#include "Components/SlateWrapperTypes.h"
#include "Components/Slider.h"
#include "Components/Spacer.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/WidgetSwitcher.h"
#include "Dom/JsonObject.h"
#include "FileHelpers.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/CompilerResultsLog.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Logging/TokenizedMessage.h"
#include "Misc/PackageName.h"
#include "MWBBlueprintInspectService.h"
#include "MWBBlueprintGraphService.h"
#include "MWBJson.h"
#include "ScopedTransaction.h"
#include "UObject/Package.h"
#include "Blueprint/UserWidget.h"
#include "WidgetBlueprint.h"
#include "WidgetBlueprintFactory.h"

namespace
{
    constexpr TCHAR AllowedWidgetBlueprintPathPrefix[] = TEXT("/Game/MistyPlanet/UI/");

    FString ToLongPackageName(const FString& AssetPath)
    {
        FString PackageName = AssetPath;
        FString ObjectName;
        if (AssetPath.Split(TEXT("."), &PackageName, &ObjectName))
        {
            return PackageName;
        }

        return PackageName;
    }

    FString ToObjectPath(const FString& AssetPath)
    {
        if (AssetPath.Contains(TEXT(".")))
        {
            return AssetPath;
        }

        const FString PackageName = ToLongPackageName(AssetPath);
        return FString::Printf(TEXT("%s.%s"), *PackageName, *FPackageName::GetShortName(PackageName));
    }

    bool SplitAssetPath(const FString& AssetPath, FString& OutPackagePath, FString& OutAssetName, FString& OutError)
    {
        const FString PackageName = ToLongPackageName(AssetPath);
        FText PackageNameError;
        if (!FPackageName::IsValidLongPackageName(PackageName, false, &PackageNameError))
        {
            OutError = PackageNameError.ToString();
            return false;
        }

        OutPackagePath = FPackageName::GetLongPackagePath(PackageName);
        OutAssetName = FPackageName::GetShortName(PackageName);
        if (OutPackagePath.IsEmpty() || OutAssetName.IsEmpty())
        {
            OutError = TEXT("assetPath must include a package path and asset name.");
            return false;
        }

        return true;
    }

    UClass* ResolveParentClass(const TSharedPtr<FJsonObject>& Payload, FString& OutError)
    {
        FString ParentClassPath;
        if (!Payload.IsValid() || !Payload->TryGetStringField(TEXT("parentClass"), ParentClassPath) || ParentClassPath.IsEmpty())
        {
            return UUserWidget::StaticClass();
        }

        UClass* ParentClass = LoadObject<UClass>(nullptr, *ParentClassPath);
        if (!ParentClass)
        {
            OutError = FString::Printf(TEXT("Could not load parentClass '%s'."), *ParentClassPath);
            return nullptr;
        }

        if (!ParentClass->IsChildOf(UUserWidget::StaticClass()))
        {
            OutError = FString::Printf(TEXT("parentClass '%s' must derive from UUserWidget."), *ParentClassPath);
            return nullptr;
        }

        return ParentClass;
    }

    bool TryGetNumber(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, double& OutValue)
    {
        return Object.IsValid() && Object->TryGetNumberField(Field, OutValue);
    }

    bool TryGetVector2D(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, FVector2D& OutValue)
    {
        if (!Object.IsValid())
        {
            return false;
        }

        const TSharedPtr<FJsonObject>* VectorObject = nullptr;
        if (Object->TryGetObjectField(Field, VectorObject) && VectorObject && VectorObject->IsValid())
        {
            double X = 0.0;
            double Y = 0.0;
            const bool bHasX = (*VectorObject)->TryGetNumberField(TEXT("x"), X);
            const bool bHasY = (*VectorObject)->TryGetNumberField(TEXT("y"), Y);
            if (bHasX || bHasY)
            {
                OutValue = FVector2D(X, Y);
                return true;
            }
        }

        const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
        if (Object->TryGetArrayField(Field, Array) && Array && Array->Num() >= 2)
        {
            OutValue = FVector2D((*Array)[0]->AsNumber(), (*Array)[1]->AsNumber());
            return true;
        }

        return false;
    }

    bool TryGetMargin(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, FMargin& OutValue)
    {
        if (!Object.IsValid())
        {
            return false;
        }

        double Uniform = 0.0;
        if (Object->TryGetNumberField(Field, Uniform))
        {
            OutValue = FMargin(Uniform);
            return true;
        }

        const TSharedPtr<FJsonObject>* MarginObject = nullptr;
        if (Object->TryGetObjectField(Field, MarginObject) && MarginObject && MarginObject->IsValid())
        {
            double Left = 0.0;
            double Top = 0.0;
            double Right = 0.0;
            double Bottom = 0.0;
            const bool bHasLeft = (*MarginObject)->TryGetNumberField(TEXT("left"), Left);
            const bool bHasTop = (*MarginObject)->TryGetNumberField(TEXT("top"), Top);
            const bool bHasRight = (*MarginObject)->TryGetNumberField(TEXT("right"), Right);
            const bool bHasBottom = (*MarginObject)->TryGetNumberField(TEXT("bottom"), Bottom);
            if (bHasLeft || bHasTop || bHasRight || bHasBottom)
            {
                OutValue = FMargin(Left, Top, Right, Bottom);
                return true;
            }
        }

        const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
        if (Object->TryGetArrayField(Field, Array) && Array)
        {
            if (Array->Num() == 1)
            {
                OutValue = FMargin((*Array)[0]->AsNumber());
                return true;
            }
            if (Array->Num() >= 4)
            {
                OutValue = FMargin((*Array)[0]->AsNumber(), (*Array)[1]->AsNumber(), (*Array)[2]->AsNumber(), (*Array)[3]->AsNumber());
                return true;
            }
        }

        return false;
    }

    bool TryGetLinearColor(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, FLinearColor& OutValue)
    {
        if (!Object.IsValid())
        {
            return false;
        }

        FString ColorString;
        if (Object->TryGetStringField(Field, ColorString))
        {
            OutValue = FLinearColor::FromSRGBColor(FColor::FromHex(ColorString));
            return true;
        }

        const TSharedPtr<FJsonObject>* ColorObject = nullptr;
        if (Object->TryGetObjectField(Field, ColorObject) && ColorObject && ColorObject->IsValid())
        {
            double R = 1.0;
            double G = 1.0;
            double B = 1.0;
            double A = 1.0;
            const bool bHasR = (*ColorObject)->TryGetNumberField(TEXT("r"), R);
            const bool bHasG = (*ColorObject)->TryGetNumberField(TEXT("g"), G);
            const bool bHasB = (*ColorObject)->TryGetNumberField(TEXT("b"), B);
            (*ColorObject)->TryGetNumberField(TEXT("a"), A);
            if (bHasR || bHasG || bHasB)
            {
                OutValue = FLinearColor(static_cast<float>(R), static_cast<float>(G), static_cast<float>(B), static_cast<float>(A));
                return true;
            }
        }

        const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
        if (Object->TryGetArrayField(Field, Array) && Array && Array->Num() >= 3)
        {
            const double A = Array->Num() >= 4 ? (*Array)[3]->AsNumber() : 1.0;
            OutValue = FLinearColor(
                static_cast<float>((*Array)[0]->AsNumber()),
                static_cast<float>((*Array)[1]->AsNumber()),
                static_cast<float>((*Array)[2]->AsNumber()),
                static_cast<float>(A));
            return true;
        }

        return false;
    }

    bool TryGetAnchors(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, FAnchors& OutValue)
    {
        if (!Object.IsValid())
        {
            return false;
        }

        const TSharedPtr<FJsonObject>* AnchorsObject = nullptr;
        if (Object->TryGetObjectField(Field, AnchorsObject) && AnchorsObject && AnchorsObject->IsValid())
        {
            FVector2D Minimum;
            FVector2D Maximum;
            const bool bHasMin = TryGetVector2D(*AnchorsObject, TEXT("minimum"), Minimum)
                || TryGetVector2D(*AnchorsObject, TEXT("min"), Minimum);
            const bool bHasMax = TryGetVector2D(*AnchorsObject, TEXT("maximum"), Maximum)
                || TryGetVector2D(*AnchorsObject, TEXT("max"), Maximum);

            double MinX = Minimum.X;
            double MinY = Minimum.Y;
            double MaxX = Maximum.X;
            double MaxY = Maximum.Y;
            const bool bHasMinX = (*AnchorsObject)->TryGetNumberField(TEXT("minX"), MinX);
            const bool bHasMinY = (*AnchorsObject)->TryGetNumberField(TEXT("minY"), MinY);
            const bool bHasMaxX = (*AnchorsObject)->TryGetNumberField(TEXT("maxX"), MaxX);
            const bool bHasMaxY = (*AnchorsObject)->TryGetNumberField(TEXT("maxY"), MaxY);

            if (bHasMin || bHasMax || bHasMinX || bHasMinY || bHasMaxX || bHasMaxY)
            {
                OutValue = FAnchors(static_cast<float>(MinX), static_cast<float>(MinY), static_cast<float>(MaxX), static_cast<float>(MaxY));
                return true;
            }
        }

        const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
        if (Object->TryGetArrayField(Field, Array) && Array && Array->Num() >= 4)
        {
            OutValue = FAnchors(
                static_cast<float>((*Array)[0]->AsNumber()),
                static_cast<float>((*Array)[1]->AsNumber()),
                static_cast<float>((*Array)[2]->AsNumber()),
                static_cast<float>((*Array)[3]->AsNumber()));
            return true;
        }

        return false;
    }

    bool TryGetHorizontalAlignment(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, EHorizontalAlignment& OutValue)
    {
        FString Value;
        if (!Object.IsValid() || !Object->TryGetStringField(Field, Value))
        {
            return false;
        }

        if (Value.Equals(TEXT("Left"), ESearchCase::IgnoreCase))
        {
            OutValue = HAlign_Left;
            return true;
        }
        if (Value.Equals(TEXT("Center"), ESearchCase::IgnoreCase))
        {
            OutValue = HAlign_Center;
            return true;
        }
        if (Value.Equals(TEXT("Right"), ESearchCase::IgnoreCase))
        {
            OutValue = HAlign_Right;
            return true;
        }
        if (Value.Equals(TEXT("Fill"), ESearchCase::IgnoreCase))
        {
            OutValue = HAlign_Fill;
            return true;
        }

        return false;
    }

    bool TryGetVerticalAlignment(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, EVerticalAlignment& OutValue)
    {
        FString Value;
        if (!Object.IsValid() || !Object->TryGetStringField(Field, Value))
        {
            return false;
        }

        if (Value.Equals(TEXT("Top"), ESearchCase::IgnoreCase))
        {
            OutValue = VAlign_Top;
            return true;
        }
        if (Value.Equals(TEXT("Center"), ESearchCase::IgnoreCase))
        {
            OutValue = VAlign_Center;
            return true;
        }
        if (Value.Equals(TEXT("Bottom"), ESearchCase::IgnoreCase))
        {
            OutValue = VAlign_Bottom;
            return true;
        }
        if (Value.Equals(TEXT("Fill"), ESearchCase::IgnoreCase))
        {
            OutValue = VAlign_Fill;
            return true;
        }

        return false;
    }

    bool TryGetTextJustification(const TSharedPtr<FJsonObject>& Object, ETextJustify::Type& OutValue)
    {
        FString Value;
        if (!Object.IsValid() || !Object->TryGetStringField(TEXT("justification"), Value))
        {
            return false;
        }

        if (Value.Equals(TEXT("Left"), ESearchCase::IgnoreCase))
        {
            OutValue = ETextJustify::Left;
            return true;
        }
        if (Value.Equals(TEXT("Center"), ESearchCase::IgnoreCase))
        {
            OutValue = ETextJustify::Center;
            return true;
        }
        if (Value.Equals(TEXT("Right"), ESearchCase::IgnoreCase))
        {
            OutValue = ETextJustify::Right;
            return true;
        }

        return false;
    }

    bool TryGetSlateChildSize(const TSharedPtr<FJsonObject>& Object, FSlateChildSize& OutValue)
    {
        if (!Object.IsValid())
        {
            return false;
        }

        TSharedPtr<FJsonObject> SizeObject;
        const TSharedPtr<FJsonObject>* NestedSizeObject = nullptr;
        if (Object->TryGetObjectField(TEXT("slotSize"), NestedSizeObject) && NestedSizeObject && NestedSizeObject->IsValid())
        {
            SizeObject = *NestedSizeObject;
        }
        else if (Object->TryGetObjectField(TEXT("size"), NestedSizeObject) && NestedSizeObject && NestedSizeObject->IsValid())
        {
            SizeObject = *NestedSizeObject;
        }
        else
        {
            SizeObject = Object;
        }

        FSlateChildSize Size;
        bool bHasValue = false;

        FString Rule;
        if (SizeObject->TryGetStringField(TEXT("sizeRule"), Rule) || SizeObject->TryGetStringField(TEXT("rule"), Rule))
        {
            if (Rule.Equals(TEXT("Automatic"), ESearchCase::IgnoreCase) || Rule.Equals(TEXT("Auto"), ESearchCase::IgnoreCase))
            {
                Size.SizeRule = ESlateSizeRule::Automatic;
                bHasValue = true;
            }
            else if (Rule.Equals(TEXT("Fill"), ESearchCase::IgnoreCase))
            {
                Size.SizeRule = ESlateSizeRule::Fill;
                bHasValue = true;
            }
        }

        double FillValue = 0.0;
        if (TryGetNumber(SizeObject, TEXT("fillValue"), FillValue) || TryGetNumber(SizeObject, TEXT("value"), FillValue))
        {
            Size.Value = static_cast<float>(FillValue);
            bHasValue = true;
        }

        if (bHasValue)
        {
            OutValue = Size;
            return true;
        }

        return false;
    }

    bool TryGetVisibility(const TSharedPtr<FJsonObject>& Object, ESlateVisibility& OutValue)
    {
        FString Value;
        if (!Object.IsValid() || !Object->TryGetStringField(TEXT("visibility"), Value))
        {
            return false;
        }

        if (Value.Equals(TEXT("Visible"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateVisibility::Visible;
            return true;
        }
        if (Value.Equals(TEXT("Collapsed"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateVisibility::Collapsed;
            return true;
        }
        if (Value.Equals(TEXT("Hidden"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateVisibility::Hidden;
            return true;
        }
        if (Value.Equals(TEXT("HitTestInvisible"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateVisibility::HitTestInvisible;
            return true;
        }
        if (Value.Equals(TEXT("SelfHitTestInvisible"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateVisibility::SelfHitTestInvisible;
            return true;
        }

        return false;
    }

    UClass* ResolveWidgetClass(const FString& Type)
    {
        if (Type == TEXT("CanvasPanel"))
        {
            return UCanvasPanel::StaticClass();
        }
        if (Type == TEXT("TextBlock"))
        {
            return UTextBlock::StaticClass();
        }
        if (Type == TEXT("Button"))
        {
            return UButton::StaticClass();
        }
        if (Type == TEXT("Image"))
        {
            return UImage::StaticClass();
        }
        if (Type == TEXT("Border"))
        {
            return UBorder::StaticClass();
        }
        if (Type == TEXT("Overlay"))
        {
            return UOverlay::StaticClass();
        }
        if (Type == TEXT("VerticalBox"))
        {
            return UVerticalBox::StaticClass();
        }
        if (Type == TEXT("HorizontalBox"))
        {
            return UHorizontalBox::StaticClass();
        }
        if (Type == TEXT("ScrollBox"))
        {
            return UScrollBox::StaticClass();
        }
        if (Type == TEXT("WidgetSwitcher"))
        {
            return UWidgetSwitcher::StaticClass();
        }
        if (Type == TEXT("Slider"))
        {
            return USlider::StaticClass();
        }
        if (Type == TEXT("CheckBox"))
        {
            return UCheckBox::StaticClass();
        }
        if (Type == TEXT("ComboBoxString"))
        {
            return UComboBoxString::StaticClass();
        }
        if (Type == TEXT("SizeBox"))
        {
            return USizeBox::StaticClass();
        }
        if (Type == TEXT("Spacer"))
        {
            return USpacer::StaticClass();
        }

        return nullptr;
    }

    void ApplyCanvasSlotProperties(UPanelSlot* Slot, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        UCanvasPanelSlot* CanvasSlot = Cast<UCanvasPanelSlot>(Slot);
        if (!CanvasSlot || !WidgetObject.IsValid())
        {
            return;
        }

        TSharedPtr<FJsonObject> SlotObject = WidgetObject;
        const TSharedPtr<FJsonObject>* NestedSlotObject = nullptr;
        if (WidgetObject->TryGetObjectField(TEXT("slot"), NestedSlotObject) && NestedSlotObject && NestedSlotObject->IsValid())
        {
            SlotObject = *NestedSlotObject;
        }

        FVector2D Position;
        if (TryGetVector2D(SlotObject, TEXT("position"), Position))
        {
            CanvasSlot->SetPosition(Position);
        }

        FVector2D Size;
        if (TryGetVector2D(SlotObject, TEXT("size"), Size))
        {
            CanvasSlot->SetSize(Size);
        }

        double ZOrder = 0.0;
        if (TryGetNumber(SlotObject, TEXT("zOrder"), ZOrder))
        {
            CanvasSlot->SetZOrder(static_cast<int32>(ZOrder));
        }

        FAnchors Anchors;
        if (TryGetAnchors(SlotObject, TEXT("anchors"), Anchors))
        {
            CanvasSlot->SetAnchors(Anchors);
        }

        FMargin Offsets;
        if (TryGetMargin(SlotObject, TEXT("offsets"), Offsets))
        {
            CanvasSlot->SetOffsets(Offsets);
        }

        FVector2D Alignment;
        if (TryGetVector2D(SlotObject, TEXT("alignment"), Alignment))
        {
            CanvasSlot->SetAlignment(Alignment);
        }

        bool bAutoSize = false;
        if (SlotObject->TryGetBoolField(TEXT("autoSize"), bAutoSize))
        {
            CanvasSlot->SetAutoSize(bAutoSize);
        }
    }

    void ApplyPanelSlotProperties(UPanelSlot* Slot, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        ApplyCanvasSlotProperties(Slot, WidgetObject);
        if (Cast<UCanvasPanelSlot>(Slot) || !WidgetObject.IsValid())
        {
            return;
        }

        TSharedPtr<FJsonObject> SlotObject = WidgetObject;
        const TSharedPtr<FJsonObject>* NestedSlotObject = nullptr;
        if (WidgetObject->TryGetObjectField(TEXT("slot"), NestedSlotObject) && NestedSlotObject && NestedSlotObject->IsValid())
        {
            SlotObject = *NestedSlotObject;
        }

        FMargin Padding;
        if (UHorizontalBoxSlot* HorizontalBoxSlot = Cast<UHorizontalBoxSlot>(Slot))
        {
            if (TryGetMargin(SlotObject, TEXT("padding"), Padding))
            {
                HorizontalBoxSlot->SetPadding(Padding);
            }

            EHorizontalAlignment HorizontalAlignment;
            if (TryGetHorizontalAlignment(SlotObject, TEXT("horizontalAlignment"), HorizontalAlignment))
            {
                HorizontalBoxSlot->SetHorizontalAlignment(HorizontalAlignment);
            }

            EVerticalAlignment VerticalAlignment;
            if (TryGetVerticalAlignment(SlotObject, TEXT("verticalAlignment"), VerticalAlignment))
            {
                HorizontalBoxSlot->SetVerticalAlignment(VerticalAlignment);
            }

            FSlateChildSize Size;
            if (TryGetSlateChildSize(SlotObject, Size))
            {
                HorizontalBoxSlot->SetSize(Size);
            }
        }
        else if (UVerticalBoxSlot* VerticalBoxSlot = Cast<UVerticalBoxSlot>(Slot))
        {
            if (TryGetMargin(SlotObject, TEXT("padding"), Padding))
            {
                VerticalBoxSlot->SetPadding(Padding);
            }

            EHorizontalAlignment HorizontalAlignment;
            if (TryGetHorizontalAlignment(SlotObject, TEXT("horizontalAlignment"), HorizontalAlignment))
            {
                VerticalBoxSlot->SetHorizontalAlignment(HorizontalAlignment);
            }

            EVerticalAlignment VerticalAlignment;
            if (TryGetVerticalAlignment(SlotObject, TEXT("verticalAlignment"), VerticalAlignment))
            {
                VerticalBoxSlot->SetVerticalAlignment(VerticalAlignment);
            }

            FSlateChildSize Size;
            if (TryGetSlateChildSize(SlotObject, Size))
            {
                VerticalBoxSlot->SetSize(Size);
            }
        }
        else if (UOverlaySlot* OverlaySlot = Cast<UOverlaySlot>(Slot))
        {
            if (TryGetMargin(SlotObject, TEXT("padding"), Padding))
            {
                OverlaySlot->SetPadding(Padding);
            }

            EHorizontalAlignment HorizontalAlignment;
            if (TryGetHorizontalAlignment(SlotObject, TEXT("horizontalAlignment"), HorizontalAlignment))
            {
                OverlaySlot->SetHorizontalAlignment(HorizontalAlignment);
            }

            EVerticalAlignment VerticalAlignment;
            if (TryGetVerticalAlignment(SlotObject, TEXT("verticalAlignment"), VerticalAlignment))
            {
                OverlaySlot->SetVerticalAlignment(VerticalAlignment);
            }
        }
    }

    void ApplyWidgetProperties(UWidget* Widget, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        if (!Widget || !WidgetObject.IsValid())
        {
            return;
        }

        bool bIsVariable = false;
        if (WidgetObject->TryGetBoolField(TEXT("isVariable"), bIsVariable))
        {
            Widget->bIsVariable = bIsVariable;
        }

        ESlateVisibility Visibility;
        if (TryGetVisibility(WidgetObject, Visibility))
        {
            Widget->SetVisibility(Visibility);
        }

        if (UTextBlock* TextBlock = Cast<UTextBlock>(Widget))
        {
            FString Text;
            if (WidgetObject->TryGetStringField(TEXT("text"), Text))
            {
                TextBlock->SetText(FText::FromString(Text));
            }

            FLinearColor Color;
            if (TryGetLinearColor(WidgetObject, TEXT("color"), Color))
            {
                TextBlock->SetColorAndOpacity(FSlateColor(Color));
            }

            double FontSize = 0.0;
            if (TryGetNumber(WidgetObject, TEXT("fontSize"), FontSize))
            {
                FSlateFontInfo Font = TextBlock->GetFont();
                Font.Size = static_cast<int32>(FontSize);
                TextBlock->SetFont(Font);
            }

            ETextJustify::Type Justification;
            if (TryGetTextJustification(WidgetObject, Justification))
            {
                TextBlock->SetJustification(Justification);
            }

            FLinearColor ShadowColor;
            if (TryGetLinearColor(WidgetObject, TEXT("shadowColor"), ShadowColor))
            {
                TextBlock->SetShadowColorAndOpacity(ShadowColor);
            }

            FVector2D ShadowOffset;
            if (TryGetVector2D(WidgetObject, TEXT("shadowOffset"), ShadowOffset))
            {
                TextBlock->SetShadowOffset(ShadowOffset);
            }
        }
        else if (UBorder* Border = Cast<UBorder>(Widget))
        {
            FLinearColor BrushColor;
            if (TryGetLinearColor(WidgetObject, TEXT("brushColor"), BrushColor)
                || TryGetLinearColor(WidgetObject, TEXT("backgroundColor"), BrushColor))
            {
                Border->SetBrushColor(BrushColor);
            }

            FMargin Padding;
            if (TryGetMargin(WidgetObject, TEXT("padding"), Padding))
            {
                Border->SetPadding(Padding);
            }

            EHorizontalAlignment HorizontalAlignment;
            if (TryGetHorizontalAlignment(WidgetObject, TEXT("horizontalAlignment"), HorizontalAlignment))
            {
                Border->SetHorizontalAlignment(HorizontalAlignment);
            }

            EVerticalAlignment VerticalAlignment;
            if (TryGetVerticalAlignment(WidgetObject, TEXT("verticalAlignment"), VerticalAlignment))
            {
                Border->SetVerticalAlignment(VerticalAlignment);
            }
        }
        else if (UButton* Button = Cast<UButton>(Widget))
        {
            FLinearColor Color;
            if (TryGetLinearColor(WidgetObject, TEXT("color"), Color))
            {
                Button->SetColorAndOpacity(Color);
            }

            FLinearColor BackgroundColor;
            if (TryGetLinearColor(WidgetObject, TEXT("backgroundColor"), BackgroundColor))
            {
                Button->SetBackgroundColor(BackgroundColor);
            }
        }
        else if (UImage* Image = Cast<UImage>(Widget))
        {
            FLinearColor Color;
            if (TryGetLinearColor(WidgetObject, TEXT("color"), Color)
                || TryGetLinearColor(WidgetObject, TEXT("brushColor"), Color))
            {
                Image->SetColorAndOpacity(Color);
            }
        }
        else if (UCheckBox* CheckBox = Cast<UCheckBox>(Widget))
        {
            bool bIsChecked = false;
            if (WidgetObject->TryGetBoolField(TEXT("isChecked"), bIsChecked))
            {
                CheckBox->SetIsChecked(bIsChecked);
            }
        }
        else if (USlider* Slider = Cast<USlider>(Widget))
        {
            double Number = 0.0;
            if (TryGetNumber(WidgetObject, TEXT("minValue"), Number))
            {
                Slider->SetMinValue(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("maxValue"), Number))
            {
                Slider->SetMaxValue(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("value"), Number))
            {
                Slider->SetValue(static_cast<float>(Number));
            }
        }
        else if (UComboBoxString* ComboBox = Cast<UComboBoxString>(Widget))
        {
            const TArray<TSharedPtr<FJsonValue>>* Options = nullptr;
            if (WidgetObject->TryGetArrayField(TEXT("options"), Options) && Options)
            {
                for (const TSharedPtr<FJsonValue>& OptionValue : *Options)
                {
                    if (OptionValue.IsValid())
                    {
                        ComboBox->AddOption(OptionValue->AsString());
                    }
                }
            }
        }
        else if (USizeBox* SizeBox = Cast<USizeBox>(Widget))
        {
            double Number = 0.0;
            if (TryGetNumber(WidgetObject, TEXT("widthOverride"), Number))
            {
                SizeBox->SetWidthOverride(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("heightOverride"), Number))
            {
                SizeBox->SetHeightOverride(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("minDesiredWidth"), Number))
            {
                SizeBox->SetMinDesiredWidth(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("minDesiredHeight"), Number))
            {
                SizeBox->SetMinDesiredHeight(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("maxDesiredWidth"), Number))
            {
                SizeBox->SetMaxDesiredWidth(static_cast<float>(Number));
            }
            if (TryGetNumber(WidgetObject, TEXT("maxDesiredHeight"), Number))
            {
                SizeBox->SetMaxDesiredHeight(static_cast<float>(Number));
            }
        }
        else if (USpacer* Spacer = Cast<USpacer>(Widget))
        {
            FVector2D Size;
            if (TryGetVector2D(WidgetObject, TEXT("size"), Size))
            {
                Spacer->SetSize(Size);
            }
        }
    }

    UWidget* BuildWidgetFromLayout(UWidgetTree* WidgetTree, const TSharedPtr<FJsonObject>& WidgetObject, FString& OutError)
    {
        if (!WidgetTree || !WidgetObject.IsValid())
        {
            OutError = TEXT("Each layout node must be an object.");
            return nullptr;
        }

        FString Type;
        if (!WidgetObject->TryGetStringField(TEXT("type"), Type) || Type.IsEmpty())
        {
            OutError = TEXT("Each layout node requires a non-empty string field 'type'.");
            return nullptr;
        }

        UClass* WidgetClass = ResolveWidgetClass(Type);
        if (!WidgetClass)
        {
            OutError = FString::Printf(TEXT("Unsupported widget type '%s'."), *Type);
            return nullptr;
        }

        FString Name;
        WidgetObject->TryGetStringField(TEXT("name"), Name);
        UWidget* Widget = WidgetTree->ConstructWidget<UWidget>(WidgetClass, Name.IsEmpty() ? NAME_None : FName(*Name));
        if (!Widget)
        {
            OutError = FString::Printf(TEXT("Failed to construct widget type '%s'."), *Type);
            return nullptr;
        }

        ApplyWidgetProperties(Widget, WidgetObject);

        const TArray<TSharedPtr<FJsonValue>>* Children = nullptr;
        if (WidgetObject->TryGetArrayField(TEXT("children"), Children) && Children)
        {
            for (const TSharedPtr<FJsonValue>& ChildValue : *Children)
            {
                const TSharedPtr<FJsonObject> ChildObject = ChildValue.IsValid() ? ChildValue->AsObject() : nullptr;
                UWidget* ChildWidget = BuildWidgetFromLayout(WidgetTree, ChildObject, OutError);
                if (!ChildWidget)
                {
                    return nullptr;
                }

                if (UPanelWidget* PanelWidget = Cast<UPanelWidget>(Widget))
                {
                    UPanelSlot* Slot = PanelWidget->AddChild(ChildWidget);
                    ApplyPanelSlotProperties(Slot, ChildObject);
                }
                else if (UContentWidget* ContentWidget = Cast<UContentWidget>(Widget))
                {
                    if (ContentWidget->GetContent())
                    {
                        OutError = FString::Printf(TEXT("Widget type '%s' supports only one child."), *Type);
                        return nullptr;
                    }
                    ContentWidget->SetContent(ChildWidget);
                }
                else
                {
                    OutError = FString::Printf(TEXT("Widget type '%s' cannot contain children."), *Type);
                    return nullptr;
                }
            }
        }

        return Widget;
    }

    TSharedRef<FJsonObject> CompileBlueprintToResult(UWidgetBlueprint* WidgetBlueprint)
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

    bool SaveWidgetBlueprintPackage(UWidgetBlueprint* WidgetBlueprint)
    {
        if (!WidgetBlueprint)
        {
            return false;
        }

        UPackage* Package = WidgetBlueprint->GetOutermost();
        if (!Package)
        {
            return false;
        }

        TArray<UPackage*> PackagesToSave;
        PackagesToSave.Add(Package);
        return UEditorLoadingAndSavingUtils::SavePackages(PackagesToSave, false);
    }
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::HandleCommand(
    const FString& Command,
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    if (Command == TEXT("inspectWidgetTree"))
    {
        return InspectWidgetTree(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("createWidgetBlueprint"))
    {
        return CreateWidgetBlueprint(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("setWidgetParentClass"))
    {
        return SetWidgetParentClass(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("applyWidgetLayout"))
    {
        return ApplyWidgetLayout(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("compileWidget"))
    {
        return CompileWidget(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("finalizeWidget"))
    {
        return FinalizeWidget(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("inspectBlueprint"))
    {
        return FMWBBlueprintInspectService::InspectBlueprint(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("bindButtonClickedToFunction"))
    {
        return FMWBBlueprintGraphService::BindButtonClickedToFunction(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("bindSliderValueChangedToFunction"))
    {
        return FMWBBlueprintGraphService::BindSliderValueChangedToFunction(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("bindCheckBoxChangedToFunction"))
    {
        return FMWBBlueprintGraphService::BindCheckBoxChangedToFunction(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("bindComboBoxSelectionChangedToFunction"))
    {
        return FMWBBlueprintGraphService::BindComboBoxSelectionChangedToFunction(TransactionId, Payload, OutStatusCode);
    }

    OutStatusCode = EHttpServerResponseCodes::BadRequest;
    return Failure(TransactionId, TEXT("UNKNOWN_COMMAND"), FString::Printf(TEXT("Unknown command '%s'."), *Command));
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::InspectWidgetTree(
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

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("ASSET_PATH_NOT_ALLOWED"),
            FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(
            TransactionId,
            TEXT("WIDGET_BLUEPRINT_NOT_FOUND"),
            FString::Printf(TEXT("No UWidgetBlueprint was found at '%s'."), *AssetPath));
    }

    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("assetPath"), AssetPath);

    if (WidgetBlueprint->WidgetTree && WidgetBlueprint->WidgetTree->RootWidget)
    {
        Result->SetObjectField(TEXT("rootWidget"), SerializeWidget(WidgetBlueprint->WidgetTree->RootWidget));
    }
    else
    {
        Result->SetObjectField(TEXT("rootWidget"), MakeShared<FJsonObject>());
    }

    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::CreateWidgetBlueprint(
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

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("ASSET_PATH_NOT_ALLOWED"),
            FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    FString PackagePath;
    FString AssetName;
    if (!SplitAssetPath(AssetPath, PackagePath, AssetName, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_ASSET_PATH"), Error);
    }

    UClass* ParentClass = ResolveParentClass(Payload, Error);
    if (!ParentClass)
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_PARENT_CLASS"), Error);
    }

    bool bCreated = false;
    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint)
    {
        const FScopedTransaction Transaction(NSLOCTEXT("WidgetBridge", "CreateWidgetBlueprint", "Create Widget Blueprint"));
        UWidgetBlueprintFactory* Factory = NewObject<UWidgetBlueprintFactory>();
        Factory->BlueprintType = BPTYPE_Normal;
        Factory->ParentClass = ParentClass;

        FAssetToolsModule& AssetToolsModule = FModuleManager::LoadModuleChecked<FAssetToolsModule>(TEXT("AssetTools"));
        UObject* NewAsset = AssetToolsModule.Get().CreateAsset(AssetName, PackagePath, UWidgetBlueprint::StaticClass(), Factory);
        WidgetBlueprint = Cast<UWidgetBlueprint>(NewAsset);
        if (!WidgetBlueprint)
        {
            OutStatusCode = EHttpServerResponseCodes::ServerError;
            return Failure(TransactionId, TEXT("ASSET_CREATE_FAILED"), FString::Printf(TEXT("Failed to create Widget Blueprint '%s'."), *AssetPath));
        }

        WidgetBlueprint->Modify();
        if (WidgetBlueprint->WidgetTree)
        {
            WidgetBlueprint->WidgetTree->Modify();
            WidgetBlueprint->WidgetTree->RootWidget = WidgetBlueprint->WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("RootCanvas"));
        }

        FAssetRegistryModule::AssetCreated(WidgetBlueprint);
        FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
        WidgetBlueprint->MarkPackageDirty();
        bCreated = true;
    }

    TSharedRef<FJsonObject> Result = CompileBlueprintToResult(WidgetBlueprint);
    Result->SetBoolField(TEXT("created"), bCreated);

    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::SetWidgetParentClass(
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

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("ASSET_PATH_NOT_ALLOWED"),
            FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(TransactionId, TEXT("WIDGET_BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No UWidgetBlueprint was found at '%s'."), *AssetPath));
    }

    UClass* ParentClass = ResolveParentClass(Payload, Error);
    if (!ParentClass)
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_PARENT_CLASS"), Error);
    }

    const FScopedTransaction Transaction(NSLOCTEXT("WidgetBridge", "SetWidgetParentClass", "Set Widget Parent Class"));
    WidgetBlueprint->Modify();
    WidgetBlueprint->ParentClass = ParentClass;
    FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
    WidgetBlueprint->MarkPackageDirty();

    TSharedRef<FJsonObject> Result = CompileBlueprintToResult(WidgetBlueprint);
    Result->SetStringField(TEXT("parentClass"), ParentClass->GetPathName());

    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::ApplyWidgetLayout(
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

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("ASSET_PATH_NOT_ALLOWED"),
            FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(TransactionId, TEXT("WIDGET_BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No UWidgetBlueprint was found at '%s'."), *AssetPath));
    }

    const TSharedPtr<FJsonObject>* LayoutObject = nullptr;
    if (!Payload.IsValid() || !Payload->TryGetObjectField(TEXT("layout"), LayoutObject) || !LayoutObject || !LayoutObject->IsValid())
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_REQUEST"), TEXT("Missing required object field 'layout'."));
    }

    TSharedPtr<FJsonObject> RootObject = *LayoutObject;
    const TSharedPtr<FJsonObject>* NestedRootObject = nullptr;
    if ((*LayoutObject)->TryGetObjectField(TEXT("root"), NestedRootObject) && NestedRootObject && NestedRootObject->IsValid())
    {
        RootObject = *NestedRootObject;
    }

    if (!WidgetBlueprint->WidgetTree)
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("WIDGET_TREE_MISSING"), FString::Printf(TEXT("Widget Blueprint '%s' has no WidgetTree."), *AssetPath));
    }

    FScopedTransaction Transaction(NSLOCTEXT("WidgetBridge", "ApplyWidgetLayout", "Apply Widget Layout"));
    WidgetBlueprint->Modify();
    WidgetBlueprint->WidgetTree->Modify();

    UWidget* NewRootWidget = BuildWidgetFromLayout(WidgetBlueprint->WidgetTree, RootObject, Error);
    if (!NewRootWidget)
    {
        Transaction.Cancel();
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_LAYOUT"), Error);
    }

    WidgetBlueprint->WidgetTree->RootWidget = NewRootWidget;
    FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
    WidgetBlueprint->MarkPackageDirty();

    TSharedRef<FJsonObject> Result = CompileBlueprintToResult(WidgetBlueprint);
    if (WidgetBlueprint->WidgetTree && WidgetBlueprint->WidgetTree->RootWidget)
    {
        Result->SetObjectField(TEXT("rootWidget"), SerializeWidget(WidgetBlueprint->WidgetTree->RootWidget));
    }

    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::CompileWidget(
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

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("ASSET_PATH_NOT_ALLOWED"),
            FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(TransactionId, TEXT("WIDGET_BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No UWidgetBlueprint was found at '%s'."), *AssetPath));
    }

    TSharedRef<FJsonObject> Result = CompileBlueprintToResult(WidgetBlueprint);
    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::FinalizeWidget(
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

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("ASSET_PATH_NOT_ALLOWED"),
            FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(TransactionId, TEXT("WIDGET_BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No UWidgetBlueprint was found at '%s'."), *AssetPath));
    }

    bool bCompile = true;
    bool bSave = true;
    bool bInspect = true;
    if (Payload.IsValid())
    {
        Payload->TryGetBoolField(TEXT("compile"), bCompile);
        Payload->TryGetBoolField(TEXT("save"), bSave);
        Payload->TryGetBoolField(TEXT("inspect"), bInspect);
    }

    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("assetPath"), AssetPath);
    Result->SetBoolField(TEXT("compiled"), false);
    Result->SetNumberField(TEXT("errorCount"), 0);
    Result->SetNumberField(TEXT("warningCount"), 0);
    Result->SetArrayField(TEXT("messages"), TArray<TSharedPtr<FJsonValue>>());

    if (bCompile)
    {
        Result = CompileBlueprintToResult(WidgetBlueprint);
    }

    const bool bWasDirtyBeforeSave = WidgetBlueprint->GetOutermost() && WidgetBlueprint->GetOutermost()->IsDirty();
    bool bSaved = false;
    if (bSave)
    {
        bSaved = SaveWidgetBlueprintPackage(WidgetBlueprint);
    }

    Result->SetBoolField(TEXT("saveRequested"), bSave);
    Result->SetBoolField(TEXT("saved"), bSave ? bSaved : false);
    Result->SetBoolField(TEXT("packageDirtyBeforeSave"), bWasDirtyBeforeSave);
    Result->SetBoolField(TEXT("packageDirtyAfterSave"), WidgetBlueprint->GetOutermost() && WidgetBlueprint->GetOutermost()->IsDirty());

    if (bInspect)
    {
        if (WidgetBlueprint->WidgetTree && WidgetBlueprint->WidgetTree->RootWidget)
        {
            Result->SetObjectField(TEXT("rootWidget"), SerializeWidget(WidgetBlueprint->WidgetTree->RootWidget));
        }
        else
        {
            Result->SetObjectField(TEXT("rootWidget"), MakeShared<FJsonObject>());
        }
    }

    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::Failure(
    const FString& TransactionId,
    const FString& Code,
    const FString& Message,
    bool bRetryable)
{
    TSharedRef<FJsonObject> Object = FMWBJson::Failure(Code, Message, bRetryable);
    Object->SetStringField(TEXT("transactionId"), TransactionId);
    return Object;
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::SerializeWidget(const UWidget* Widget)
{
    TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
    if (!Widget)
    {
        Object->SetStringField(TEXT("name"), TEXT(""));
        Object->SetStringField(TEXT("class"), TEXT(""));
        Object->SetStringField(TEXT("path"), TEXT(""));
        Object->SetArrayField(TEXT("children"), {});
        return Object;
    }

    Object->SetStringField(TEXT("name"), Widget->GetName());
    Object->SetStringField(TEXT("class"), Widget->GetClass() ? Widget->GetClass()->GetName() : TEXT(""));
    Object->SetStringField(TEXT("path"), Widget->GetPathName());

    TArray<TSharedPtr<FJsonValue>> Children;
    if (const INamedSlotInterface* NamedSlotHost = Cast<INamedSlotInterface>(Widget))
    {
        TArray<FName> SlotNames;
        NamedSlotHost->GetSlotNames(SlotNames);

        for (const FName SlotName : SlotNames)
        {
            if (UWidget* SlotContent = NamedSlotHost->GetContentForSlot(SlotName))
            {
                Children.Add(MakeShared<FJsonValueObject>(SerializeWidget(SlotContent)));
            }
        }
    }

    if (const UPanelWidget* PanelWidget = Cast<UPanelWidget>(Widget))
    {
        const int32 ChildCount = PanelWidget->GetChildrenCount();
        Children.Reserve(Children.Num() + ChildCount);
        for (int32 ChildIndex = 0; ChildIndex < ChildCount; ++ChildIndex)
        {
            Children.Add(MakeShared<FJsonValueObject>(SerializeWidget(PanelWidget->GetChildAt(ChildIndex))));
        }
    }

    Object->SetArrayField(TEXT("children"), Children);
    return Object;
}

UWidgetBlueprint* FMWBWidgetBlueprintService::LoadWidgetBlueprint(const FString& AssetPath)
{
    return LoadObject<UWidgetBlueprint>(nullptr, *ToObjectPath(AssetPath));
}

bool FMWBWidgetBlueprintService::IsAllowedWidgetBlueprintPath(const FString& AssetPath)
{
    return ToLongPackageName(AssetPath).StartsWith(AllowedWidgetBlueprintPathPrefix, ESearchCase::CaseSensitive)
        && !AssetPath.Contains(TEXT(".."));
}
