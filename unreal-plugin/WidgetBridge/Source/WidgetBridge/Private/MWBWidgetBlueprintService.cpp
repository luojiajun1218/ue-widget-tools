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
#include "EditorFramework/AssetImportData.h"
#include "Engine/Font.h"
#include "Engine/Texture2D.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Materials/MaterialInterface.h"
#include "FileHelpers.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/CompilerResultsLog.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Logging/TokenizedMessage.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "MWBBlueprintInspectService.h"
#include "MWBBlueprintGraphService.h"
#include "MWBJson.h"
#include "ScopedTransaction.h"
#include "Slate/WidgetRenderer.h"
#include "Styling/SlateTypes.h"
#include "Tasks/Task.h"
#include "UObject/Package.h"
#include "UObject/SoftObjectPath.h"
#include "AssetImportTask.h"
#include "Brushes/SlateColorBrush.h"
#include "Blueprint/UserWidget.h"
#include "WidgetBlueprint.h"
#include "WidgetBlueprintEditorUtils.h"
#include "WidgetBlueprintFactory.h"

namespace
{
    constexpr TCHAR AllowedWidgetBlueprintPathPrefix[] = TEXT("/Game/MistyPlanet/UI/");
    constexpr int32 PreviewWidth = 1920;
    constexpr int32 PreviewHeight = 1080;

    FString PreviewDirectory()
    {
        return FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("WidgetBridge/Previews"));
    }

    bool IsSafeFileStem(const FString& Value)
    {
        if (Value.IsEmpty() || Value.Len() > 96)
        {
            return false;
        }

        for (const TCHAR Character : Value)
        {
            if (!FChar::IsAlnum(Character) && Character != TEXT('_') && Character != TEXT('-'))
            {
                return false;
            }
        }
        return true;
    }

    FString NormalizeAbsolutePath(const FString& Value)
    {
        FString Result = FPaths::ConvertRelativePathToFull(Value);
        FPaths::NormalizeFilename(Result);
        return Result;
    }

    FString ResolveProjectPath(const FString& Value)
    {
        return NormalizeAbsolutePath(FPaths::IsRelative(Value) ? FPaths::ProjectDir() / Value : Value);
    }

    bool IsPathWithin(const FString& Path, const FString& Root)
    {
        FString NormalizedPath = NormalizeAbsolutePath(Path);
        FString NormalizedRoot = NormalizeAbsolutePath(Root);
        if (!NormalizedRoot.EndsWith(TEXT("/")))
        {
            NormalizedRoot += TEXT("/");
        }
        return NormalizedPath.StartsWith(NormalizedRoot, ESearchCase::IgnoreCase);
    }

    bool IsPngPath(const FString& Path)
    {
        return FPaths::GetExtension(Path).Equals(TEXT("png"), ESearchCase::IgnoreCase);
    }

    bool SavePng(const TArray<FColor>& Pixels, const int32 Width, const int32 Height, const FString& FilePath, FString& OutError)
    {
        IImageWrapperModule& ImageWrapperModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
        const TSharedPtr<IImageWrapper> ImageWrapper = ImageWrapperModule.CreateImageWrapper(EImageFormat::PNG);
        if (!ImageWrapper.IsValid() || !ImageWrapper->SetRaw(Pixels.GetData(), Pixels.Num() * sizeof(FColor), Width, Height, ERGBFormat::BGRA, 8))
        {
            OutError = TEXT("Could not encode PNG pixel data.");
            return false;
        }

        const TArray64<uint8> Compressed = ImageWrapper->GetCompressed(100);
        if (Compressed.IsEmpty() || !FFileHelper::SaveArrayToFile(Compressed, *FilePath))
        {
            OutError = FString::Printf(TEXT("Could not write PNG '%s'."), *FilePath);
            return false;
        }
        return true;
    }

    bool LoadPng(const FString& FilePath, TArray<FColor>& OutPixels, int32& OutWidth, int32& OutHeight, FString& OutError)
    {
        TArray64<uint8> Compressed;
        if (!FFileHelper::LoadFileToArray(Compressed, *FilePath))
        {
            OutError = FString::Printf(TEXT("Could not read PNG '%s'."), *FilePath);
            return false;
        }

        IImageWrapperModule& ImageWrapperModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
        const TSharedPtr<IImageWrapper> ImageWrapper = ImageWrapperModule.CreateImageWrapper(EImageFormat::PNG);
        if (!ImageWrapper.IsValid() || !ImageWrapper->SetCompressed(Compressed.GetData(), Compressed.Num()))
        {
            OutError = FString::Printf(TEXT("Could not decode PNG '%s'."), *FilePath);
            return false;
        }

        OutWidth = ImageWrapper->GetWidth();
        OutHeight = ImageWrapper->GetHeight();
        TArray64<uint8> Raw;
        if (!ImageWrapper->GetRaw(ERGBFormat::BGRA, 8, Raw))
        {
            OutError = FString::Printf(TEXT("Could not decompress PNG '%s'."), *FilePath);
            return false;
        }
        const int64 ExpectedBytes = static_cast<int64>(OutWidth) * static_cast<int64>(OutHeight) * sizeof(FColor);
        if (OutWidth <= 0 || OutHeight <= 0 || Raw.Num() != ExpectedBytes)
        {
            OutError = FString::Printf(TEXT("PNG '%s' has unsupported pixel data."), *FilePath);
            return false;
        }

        OutPixels.SetNumUninitialized(OutWidth * OutHeight);
        FMemory::Memcpy(OutPixels.GetData(), Raw.GetData(), ExpectedBytes);
        return true;
    }

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

    bool IsAllowedUiAssetPath(const FString& AssetPath)
    {
        return AssetPath.StartsWith(TEXT("/Game/MistyPlanet/UI/"), ESearchCase::CaseSensitive)
            && !AssetPath.Contains(TEXT(".."));
    }

    bool TryResolveUiImportSource(const FString& RequestedPath, FString& OutSourcePath)
    {
        if (RequestedPath.IsEmpty() || !FPaths::GetExtension(RequestedPath).Equals(TEXT("png"), ESearchCase::IgnoreCase))
        {
            return false;
        }

        const FString ProjectRoot = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
        const FString SourcePath = FPaths::ConvertRelativePathToFull(
            FPaths::IsRelative(RequestedPath) ? FPaths::Combine(ProjectRoot, RequestedPath) : RequestedPath);
        const FString CodexRoot = FPaths::Combine(ProjectRoot, TEXT(".codex-local"));
        const FString ReviewRoot = FPaths::Combine(ProjectRoot, TEXT(".superpowers"));
        const FString UiSourceRoot = FPaths::Combine(ProjectRoot, TEXT("Content/MistyPlanet/UI/SourceArt"));

        if (!FPaths::FileExists(SourcePath)
            || (!FPaths::IsUnderDirectory(SourcePath, CodexRoot)
                && !FPaths::IsUnderDirectory(SourcePath, ReviewRoot)
                && !FPaths::IsUnderDirectory(SourcePath, UiSourceRoot)))
        {
            return false;
        }

        OutSourcePath = SourcePath;
        return true;
    }

    bool TryGetUiResourceObject(const FString& AssetPath, UObject*& OutResource)
    {
        OutResource = nullptr;
        if (!IsAllowedUiAssetPath(AssetPath))
        {
            return false;
        }

        UObject* Resource = LoadObject<UObject>(nullptr, *AssetPath);
        if (!Resource)
        {
            Resource = LoadObject<UObject>(nullptr, *ToObjectPath(AssetPath));
        }
        if (!Resource || (!Resource->IsA<UTexture2D>() && !Resource->IsA<UMaterialInterface>()))
        {
            return false;
        }

        OutResource = Resource;
        return true;
    }

    bool TryGetBrushDrawType(const FString& Value, ESlateBrushDrawType::Type& OutValue)
    {
        if (Value.Equals(TEXT("Image"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateBrushDrawType::Image;
            return true;
        }
        if (Value.Equals(TEXT("Box"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateBrushDrawType::Box;
            return true;
        }
        if (Value.Equals(TEXT("Border"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateBrushDrawType::Border;
            return true;
        }
        if (Value.Equals(TEXT("RoundedBox"), ESearchCase::IgnoreCase))
        {
            OutValue = ESlateBrushDrawType::RoundedBox;
            return true;
        }
        return false;
    }

    bool TryGetBrush(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, FSlateBrush& OutBrush)
    {
        if (!Object.IsValid())
        {
            return false;
        }

        const TSharedPtr<FJsonObject>* BrushObject = nullptr;
        if (!Object->TryGetObjectField(Field, BrushObject) || !BrushObject || !BrushObject->IsValid())
        {
            return false;
        }

        FString DrawAs;
        ESlateBrushDrawType::Type DrawType = ESlateBrushDrawType::Image;
        if ((*BrushObject)->TryGetStringField(TEXT("drawAs"), DrawAs))
        {
            TryGetBrushDrawType(DrawAs, DrawType);
        }

        FLinearColor Tint = FLinearColor::White;
        TryGetLinearColor(*BrushObject, TEXT("tint"), Tint);

        bool bSolidColor = false;
        (*BrushObject)->TryGetBoolField(TEXT("solidColor"), bSolidColor);
        if (bSolidColor)
        {
            FSlateColorBrush SolidBrush(Tint);
            SolidBrush.DrawAs = DrawType;

            FMargin Margin;
            if (TryGetMargin(*BrushObject, TEXT("margin"), Margin))
            {
                SolidBrush.Margin = Margin;
            }

            FVector2D ImageSize;
            if (TryGetVector2D(*BrushObject, TEXT("imageSize"), ImageSize))
            {
                SolidBrush.ImageSize = ImageSize;
            }

            OutBrush = SolidBrush;
            return true;
        }

        FString ResourcePath;
        if (!(*BrushObject)->TryGetStringField(TEXT("resource"), ResourcePath))
        {
            (*BrushObject)->TryGetStringField(TEXT("assetPath"), ResourcePath);
        }

        UObject* Resource = nullptr;
        if (!TryGetUiResourceObject(ResourcePath, Resource))
        {
            return false;
        }

        FSlateBrush Brush;
        Brush.SetResourceObject(Resource);

        Brush.DrawAs = DrawType;

        FMargin Margin;
        if (TryGetMargin(*BrushObject, TEXT("margin"), Margin))
        {
            Brush.Margin = Margin;
        }

        Brush.TintColor = FSlateColor(Tint);

        FVector2D ImageSize;
        if (TryGetVector2D(*BrushObject, TEXT("imageSize"), ImageSize))
        {
            Brush.ImageSize = ImageSize;
        }

        OutBrush = Brush;
        return true;
    }

    void ApplyRenderProperties(UWidget* Widget, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        if (!Widget || !WidgetObject.IsValid())
        {
            return;
        }

        double Opacity = 1.0;
        if (TryGetNumber(WidgetObject, TEXT("opacity"), Opacity))
        {
            Widget->SetRenderOpacity(static_cast<float>(Opacity));
        }

        const TSharedPtr<FJsonObject>* TransformObject = nullptr;
        if (!WidgetObject->TryGetObjectField(TEXT("renderTransform"), TransformObject) || !TransformObject || !TransformObject->IsValid())
        {
            return;
        }

        FVector2D Value;
        if (TryGetVector2D(*TransformObject, TEXT("translation"), Value))
        {
            Widget->SetRenderTranslation(Value);
        }
        if (TryGetVector2D(*TransformObject, TEXT("scale"), Value))
        {
            Widget->SetRenderScale(Value);
        }
        if (TryGetVector2D(*TransformObject, TEXT("shear"), Value))
        {
            Widget->SetRenderShear(Value);
        }

        double Angle = 0.0;
        if (TryGetNumber(*TransformObject, TEXT("angle"), Angle))
        {
            Widget->SetRenderTransformAngle(static_cast<float>(Angle));
        }
    }

    void ApplyButtonStyle(UButton* Button, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        const TSharedPtr<FJsonObject>* StyleObject = nullptr;
        if (!Button || !WidgetObject.IsValid() || !WidgetObject->TryGetObjectField(TEXT("buttonStyle"), StyleObject) || !StyleObject || !StyleObject->IsValid())
        {
            return;
        }

        FButtonStyle Style = Button->GetStyle();
        FSlateBrush Brush;
        if (TryGetBrush(*StyleObject, TEXT("normal"), Brush)) Style.Normal = Brush;
        if (TryGetBrush(*StyleObject, TEXT("hovered"), Brush)) Style.Hovered = Brush;
        if (TryGetBrush(*StyleObject, TEXT("pressed"), Brush)) Style.Pressed = Brush;
        if (TryGetBrush(*StyleObject, TEXT("disabled"), Brush)) Style.Disabled = Brush;

        FMargin Padding;
        if (TryGetMargin(*StyleObject, TEXT("normalPadding"), Padding)) Style.NormalPadding = Padding;
        if (TryGetMargin(*StyleObject, TEXT("pressedPadding"), Padding)) Style.PressedPadding = Padding;
        Button->SetStyle(Style);
    }

    void ApplySliderStyle(USlider* Slider, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        const TSharedPtr<FJsonObject>* StyleObject = nullptr;
        if (!Slider || !WidgetObject.IsValid() || !WidgetObject->TryGetObjectField(TEXT("sliderStyle"), StyleObject) || !StyleObject || !StyleObject->IsValid())
        {
            return;
        }

        FSliderStyle Style = Slider->GetWidgetStyle();
        FSlateBrush Brush;
        if (TryGetBrush(*StyleObject, TEXT("normalBar"), Brush)) Style.NormalBarImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("hoveredBar"), Brush)) Style.HoveredBarImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("disabledBar"), Brush)) Style.DisabledBarImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("normalThumb"), Brush)) Style.NormalThumbImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("hoveredThumb"), Brush)) Style.HoveredThumbImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("disabledThumb"), Brush)) Style.DisabledThumbImage = Brush;

        double BarThickness = 0.0;
        if (TryGetNumber(*StyleObject, TEXT("barThickness"), BarThickness)) Style.BarThickness = static_cast<float>(BarThickness);
        Slider->SetWidgetStyle(Style);
    }

    void ApplyCheckBoxStyle(UCheckBox* CheckBox, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        const TSharedPtr<FJsonObject>* StyleObject = nullptr;
        if (!CheckBox || !WidgetObject.IsValid() || !WidgetObject->TryGetObjectField(TEXT("checkBoxStyle"), StyleObject) || !StyleObject || !StyleObject->IsValid())
        {
            return;
        }

        FCheckBoxStyle Style = CheckBox->GetWidgetStyle();
        FSlateBrush Brush;
        if (TryGetBrush(*StyleObject, TEXT("unchecked"), Brush)) Style.UncheckedImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("uncheckedHovered"), Brush)) Style.UncheckedHoveredImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("uncheckedPressed"), Brush)) Style.UncheckedPressedImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("checked"), Brush)) Style.CheckedImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("checkedHovered"), Brush)) Style.CheckedHoveredImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("checkedPressed"), Brush)) Style.CheckedPressedImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("undetermined"), Brush)) Style.UndeterminedImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("background"), Brush)) Style.BackgroundImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("backgroundHovered"), Brush)) Style.BackgroundHoveredImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("backgroundPressed"), Brush)) Style.BackgroundPressedImage = Brush;

        FMargin Padding;
        if (TryGetMargin(*StyleObject, TEXT("padding"), Padding)) Style.Padding = Padding;
        CheckBox->SetWidgetStyle(Style);
    }

    void ApplyComboBoxStyle(UComboBoxString* ComboBox, const TSharedPtr<FJsonObject>& WidgetObject)
    {
        const TSharedPtr<FJsonObject>* StyleObject = nullptr;
        if (!ComboBox || !WidgetObject.IsValid() || !WidgetObject->TryGetObjectField(TEXT("comboBoxStyle"), StyleObject) || !StyleObject || !StyleObject->IsValid())
        {
            return;
        }

        FComboBoxStyle Style = ComboBox->GetWidgetStyle();
        FSlateBrush Brush;
        if (TryGetBrush(*StyleObject, TEXT("normal"), Brush)) Style.ComboButtonStyle.ButtonStyle.Normal = Brush;
        if (TryGetBrush(*StyleObject, TEXT("hovered"), Brush)) Style.ComboButtonStyle.ButtonStyle.Hovered = Brush;
        if (TryGetBrush(*StyleObject, TEXT("pressed"), Brush)) Style.ComboButtonStyle.ButtonStyle.Pressed = Brush;
        if (TryGetBrush(*StyleObject, TEXT("disabled"), Brush)) Style.ComboButtonStyle.ButtonStyle.Disabled = Brush;
        if (TryGetBrush(*StyleObject, TEXT("downArrow"), Brush)) Style.ComboButtonStyle.DownArrowImage = Brush;
        if (TryGetBrush(*StyleObject, TEXT("menuBorder"), Brush)) Style.ComboButtonStyle.MenuBorderBrush = Brush;

        FMargin Padding;
        if (TryGetMargin(*StyleObject, TEXT("contentPadding"), Padding)) Style.ComboButtonStyle.ContentPadding = Padding;
        if (TryGetMargin(*StyleObject, TEXT("menuBorderPadding"), Padding)) Style.ComboButtonStyle.MenuBorderPadding = Padding;
        if (TryGetMargin(*StyleObject, TEXT("menuRowPadding"), Padding)) Style.MenuRowPadding = Padding;
        ComboBox->SetWidgetStyle(Style);

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

        ApplyRenderProperties(Widget, WidgetObject);

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
            FString FontAssetPath;
            FString Typeface;
            double LetterSpacing = 0.0;
            const bool bHasFontSize = TryGetNumber(WidgetObject, TEXT("fontSize"), FontSize);
            const bool bHasFontAsset = WidgetObject->TryGetStringField(TEXT("fontAsset"), FontAssetPath) && IsAllowedUiAssetPath(FontAssetPath);
            const bool bHasTypeface = WidgetObject->TryGetStringField(TEXT("fontTypeface"), Typeface) && !Typeface.IsEmpty();
            const bool bHasLetterSpacing = TryGetNumber(WidgetObject, TEXT("letterSpacing"), LetterSpacing);
            if (bHasFontSize || bHasFontAsset || bHasTypeface || bHasLetterSpacing)
            {
                FSlateFontInfo Font = TextBlock->GetFont();
                if (bHasFontSize)
                {
                    Font.Size = static_cast<int32>(FontSize);
                }

                if (bHasFontAsset)
                {
                    if (UFont* FontAsset = LoadObject<UFont>(nullptr, *FontAssetPath))
                    {
                        Font.FontObject = FontAsset;
                    }
                }

                if (bHasTypeface)
                {
                    Font.TypefaceFontName = FName(*Typeface);
                }

                if (bHasLetterSpacing)
                {
                    Font.LetterSpacing = static_cast<int32>(LetterSpacing);
                }
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
            FSlateBrush Brush;
            if (TryGetBrush(WidgetObject, TEXT("brush"), Brush))
            {
                Border->SetBrush(Brush);
            }

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

            ApplyButtonStyle(Button, WidgetObject);
        }
        else if (UImage* Image = Cast<UImage>(Widget))
        {
            FSlateBrush Brush;
            if (TryGetBrush(WidgetObject, TEXT("brush"), Brush)
                || TryGetBrush(WidgetObject, TEXT("brushStyle"), Brush))
            {
                Image->SetBrush(Brush);
            }

            FString BrushPath;
            if (WidgetObject->TryGetStringField(TEXT("brush"), BrushPath) && !BrushPath.IsEmpty())
            {
                if (UTexture2D* Texture = LoadObject<UTexture2D>(nullptr, *BrushPath))
                {
                    Image->SetBrushFromTexture(Texture, true);
                }
            }

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

            ApplyCheckBoxStyle(CheckBox, WidgetObject);
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

        FLinearColor SliderColor;
        if (TryGetLinearColor(WidgetObject, TEXT("barColor"), SliderColor))
        {
            Slider->SetSliderBarColor(SliderColor);
        }
        if (TryGetLinearColor(WidgetObject, TEXT("handleColor"), SliderColor))
        {
            Slider->SetSliderHandleColor(SliderColor);
        }

        ApplySliderStyle(Slider, WidgetObject);
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

            ApplyComboBoxStyle(ComboBox, WidgetObject);

            double SelectedIndex = 0.0;
            TryGetNumber(WidgetObject, TEXT("selectedIndex"), SelectedIndex);
            if (ComboBox->GetOptionCount() > 0)
            {
                ComboBox->SetSelectedIndex(FMath::Clamp(static_cast<int32>(SelectedIndex), 0, ComboBox->GetOptionCount() - 1));
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

    if (Command == TEXT("importUiPng"))
    {
        return ImportUiPng(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("captureWidgetPreview"))
    {
        return CaptureWidgetPreview(TransactionId, Payload, OutStatusCode);
    }

    if (Command == TEXT("compareUiImages"))
    {
        return CompareUiImages(TransactionId, Payload, OutStatusCode);
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

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::CaptureWidgetPreview(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    FString AssetPath;
    FString CaptureId;
    FString Error;
    if (!FMWBJson::GetRequiredString(Payload, TEXT("assetPath"), AssetPath, Error)
        || !FMWBJson::GetRequiredString(Payload, TEXT("captureId"), CaptureId, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_REQUEST"), Error);
    }

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(TransactionId, TEXT("ASSET_PATH_NOT_ALLOWED"), FString::Printf(TEXT("assetPath must be under %s."), AllowedWidgetBlueprintPathPrefix));
    }

    if (!IsSafeFileStem(CaptureId))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_CAPTURE_ID"), TEXT("captureId must be 1-96 letters, numbers, underscores, or hyphens."));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprint(AssetPath);
    if (!WidgetBlueprint || !WidgetBlueprint->GeneratedClass)
    {
        OutStatusCode = EHttpServerResponseCodes::NotFound;
        return Failure(TransactionId, TEXT("WIDGET_BLUEPRINT_NOT_FOUND"), FString::Printf(TEXT("No compiled UWidgetBlueprint was found at '%s'."), *AssetPath));
    }

    const FString OutputDirectory = PreviewDirectory();
    const FString OutputPath = NormalizeAbsolutePath(OutputDirectory / (CaptureId + TEXT(".png")));
    if (!IsPathWithin(OutputPath, OutputDirectory))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(TransactionId, TEXT("OUTPUT_PATH_NOT_ALLOWED"), TEXT("Preview output must stay inside Saved/WidgetBridge/Previews."));
    }

    if (!IFileManager::Get().MakeDirectory(*OutputDirectory, true))
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PREVIEW_DIRECTORY_CREATE_FAILED"), FString::Printf(TEXT("Could not create '%s'."), *OutputDirectory));
    }

    FWidgetBlueprintEditorUtils::FCreateWidgetFromBlueprintParams Params;
    Params.FlagsToApply = EWidgetDesignFlags::Designing;
    UUserWidget* PreviewWidget = FWidgetBlueprintEditorUtils::CreateUserWidgetFromBlueprint(GetTransientPackage(), WidgetBlueprint, Params);
    if (!PreviewWidget)
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PREVIEW_WIDGET_CREATE_FAILED"), TEXT("Could not create a design-time widget preview."));
    }

    PreviewWidget->AddToRoot();
    UTextureRenderTarget2D* RenderTarget = FWidgetRenderer::CreateTargetFor(FVector2D(PreviewWidth, PreviewHeight), TF_Bilinear, true);
    if (RenderTarget)
    {
        RenderTarget->AddToRoot();
    }

    bool bCaptured = false;
    TArray<FColor> Pixels;
    if (RenderTarget)
    {
        FWidgetRenderer Renderer(true);
        Renderer.DrawWidget(RenderTarget, PreviewWidget->TakeWidget(), FVector2D(PreviewWidth, PreviewHeight), 0.0f);
        FlushRenderingCommands();
        bCaptured = RenderTarget->GameThread_GetRenderTargetResource()->ReadPixels(Pixels);
    }

    if (RenderTarget)
    {
        RenderTarget->RemoveFromRoot();
    }
    PreviewWidget->RemoveFromRoot();
    FWidgetBlueprintEditorUtils::DestroyUserWidget(PreviewWidget);

    if (!bCaptured || Pixels.Num() != PreviewWidth * PreviewHeight)
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PREVIEW_CAPTURE_FAILED"), TEXT("Could not read the rendered Widget preview pixels."));
    }

    if (!SavePng(Pixels, PreviewWidth, PreviewHeight, OutputPath, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PREVIEW_PNG_WRITE_FAILED"), Error);
    }

    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("assetPath"), AssetPath);
    Result->SetStringField(TEXT("captureId"), CaptureId);
    Result->SetStringField(TEXT("outputPath"), OutputPath);
    Result->SetNumberField(TEXT("width"), PreviewWidth);
    Result->SetNumberField(TEXT("height"), PreviewHeight);
    Result->SetNumberField(TEXT("bytes"), IFileManager::Get().FileSize(*OutputPath));
    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::CompareUiImages(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    FString ReferencePath;
    FString CandidatePath;
    FString ComparisonId;
    FString Error;
    if (!FMWBJson::GetRequiredString(Payload, TEXT("referencePath"), ReferencePath, Error)
        || !FMWBJson::GetRequiredString(Payload, TEXT("candidatePath"), CandidatePath, Error)
        || !FMWBJson::GetRequiredString(Payload, TEXT("comparisonId"), ComparisonId, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_REQUEST"), Error);
    }

    double PixelThreshold = 12.0;
    Payload->TryGetNumberField(TEXT("pixelThreshold"), PixelThreshold);
    if (!IsSafeFileStem(ComparisonId) || PixelThreshold < 0.0 || PixelThreshold > 255.0)
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_COMPARE_INPUT"), TEXT("comparisonId must be safe and pixelThreshold must be between 0 and 255."));
    }

    ReferencePath = ResolveProjectPath(ReferencePath);
    CandidatePath = ResolveProjectPath(CandidatePath);
    const FString OutputDirectory = PreviewDirectory();
    if (!IsPngPath(ReferencePath) || !IsPngPath(CandidatePath)
        || !IsPathWithin(ReferencePath, FPaths::ProjectDir())
        || !IsPathWithin(CandidatePath, OutputDirectory))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(TransactionId, TEXT("IMAGE_PATH_NOT_ALLOWED"), TEXT("referencePath must be a project PNG and candidatePath must be a PNG in Saved/WidgetBridge/Previews."));
    }

    TArray<FColor> ReferencePixels;
    TArray<FColor> CandidatePixels;
    int32 ReferenceWidth = 0;
    int32 ReferenceHeight = 0;
    int32 CandidateWidth = 0;
    int32 CandidateHeight = 0;
    if (!LoadPng(ReferencePath, ReferencePixels, ReferenceWidth, ReferenceHeight, Error)
        || !LoadPng(CandidatePath, CandidatePixels, CandidateWidth, CandidateHeight, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("IMAGE_LOAD_FAILED"), Error);
    }

    if (ReferenceWidth != CandidateWidth || ReferenceHeight != CandidateHeight)
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("IMAGE_DIMENSIONS_MISMATCH"), FString::Printf(TEXT("Reference is %dx%d while candidate is %dx%d."), ReferenceWidth, ReferenceHeight, CandidateWidth, CandidateHeight));
    }

    TArray<FColor> Heatmap;
    Heatmap.SetNumUninitialized(ReferencePixels.Num());
    int64 MismatchedPixels = 0;
    int64 TotalChannelError = 0;
    const int32 Threshold = FMath::RoundToInt(PixelThreshold);
    for (int32 Index = 0; Index < ReferencePixels.Num(); ++Index)
    {
        const FColor& Reference = ReferencePixels[Index];
        const FColor& Candidate = CandidatePixels[Index];
        const int32 RedError = FMath::Abs(static_cast<int32>(Reference.R) - static_cast<int32>(Candidate.R));
        const int32 GreenError = FMath::Abs(static_cast<int32>(Reference.G) - static_cast<int32>(Candidate.G));
        const int32 BlueError = FMath::Abs(static_cast<int32>(Reference.B) - static_cast<int32>(Candidate.B));
        const int32 AlphaError = FMath::Abs(static_cast<int32>(Reference.A) - static_cast<int32>(Candidate.A));
        const int32 MaxError = FMath::Max(FMath::Max(RedError, GreenError), FMath::Max(BlueError, AlphaError));
        TotalChannelError += RedError + GreenError + BlueError + AlphaError;
        if (MaxError > Threshold)
        {
            ++MismatchedPixels;
        }
        Heatmap[Index] = FColor(FMath::Min(255, RedError * 4), FMath::Min(255, GreenError * 4), FMath::Min(255, BlueError * 4), 255);
    }

    if (!IFileManager::Get().MakeDirectory(*OutputDirectory, true))
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PREVIEW_DIRECTORY_CREATE_FAILED"), FString::Printf(TEXT("Could not create '%s'."), *OutputDirectory));
    }
    const FString HeatmapPath = NormalizeAbsolutePath(OutputDirectory / (ComparisonId + TEXT("-heatmap.png")));
    if (!IsPathWithin(HeatmapPath, OutputDirectory) || !SavePng(Heatmap, ReferenceWidth, ReferenceHeight, HeatmapPath, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("HEATMAP_WRITE_FAILED"), Error.IsEmpty() ? TEXT("Could not write comparison heatmap.") : Error);
    }

    const int64 PixelCount = ReferencePixels.Num();
    const double MismatchRatio = PixelCount == 0 ? 0.0 : static_cast<double>(MismatchedPixels) / static_cast<double>(PixelCount);
    const double MeanAbsoluteChannelError = PixelCount == 0 ? 0.0 : static_cast<double>(TotalChannelError) / static_cast<double>(PixelCount * 4);
    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("referencePath"), ReferencePath);
    Result->SetStringField(TEXT("candidatePath"), CandidatePath);
    Result->SetStringField(TEXT("heatmapPath"), HeatmapPath);
    Result->SetNumberField(TEXT("width"), ReferenceWidth);
    Result->SetNumberField(TEXT("height"), ReferenceHeight);
    Result->SetNumberField(TEXT("pixelThreshold"), Threshold);
    Result->SetNumberField(TEXT("mismatchedPixels"), MismatchedPixels);
    Result->SetNumberField(TEXT("mismatchRatio"), MismatchRatio);
    Result->SetNumberField(TEXT("meanAbsoluteChannelError"), MeanAbsoluteChannelError);
    OutStatusCode = EHttpServerResponseCodes::Ok;
    return FMWBJson::Success(TransactionId, Result);
}

TSharedRef<FJsonObject> FMWBWidgetBlueprintService::ImportUiPng(
    const FString& TransactionId,
    const TSharedPtr<FJsonObject>& Payload,
    EHttpServerResponseCodes& OutStatusCode)
{
    FString AssetPath;
    FString RequestedSourcePath;
    FString Error;
    if (!FMWBJson::GetRequiredString(Payload, TEXT("assetPath"), AssetPath, Error)
        || !FMWBJson::GetRequiredString(Payload, TEXT("sourceFilePath"), RequestedSourcePath, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_REQUEST"), Error);
    }

    if (!IsAllowedWidgetBlueprintPath(AssetPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(TransactionId, TEXT("ASSET_PATH_NOT_ALLOWED"), TEXT("assetPath must be under /Game/MistyPlanet/UI/."));
    }

    FString SourcePath;
    if (!TryResolveUiImportSource(RequestedSourcePath, SourcePath))
    {
        OutStatusCode = EHttpServerResponseCodes::Forbidden;
        return Failure(
            TransactionId,
            TEXT("IMPORT_SOURCE_NOT_ALLOWED"),
            TEXT("sourceFilePath must be an existing .png under .codex-local/, .superpowers/, or Content/MistyPlanet/UI/SourceArt/."));
    }

    FString DestinationPath;
    FString DestinationName;
    if (!SplitAssetPath(AssetPath, DestinationPath, DestinationName, Error))
    {
        OutStatusCode = EHttpServerResponseCodes::BadRequest;
        return Failure(TransactionId, TEXT("INVALID_ASSET_PATH"), Error);
    }

    bool bReplaceExisting = false;
    Payload->TryGetBoolField(TEXT("replaceExisting"), bReplaceExisting);
    const FString ExistingObjectPath = ToObjectPath(AssetPath);
    if (!bReplaceExisting && LoadObject<UObject>(nullptr, *ExistingObjectPath))
    {
        OutStatusCode = EHttpServerResponseCodes::Conflict;
        return Failure(TransactionId, TEXT("ASSET_ALREADY_EXISTS"), FString::Printf(TEXT("'%s' already exists; set replaceExisting to true to replace it."), *AssetPath));
    }

    UAssetImportTask* ImportTask = NewObject<UAssetImportTask>();
    ImportTask->Filename = SourcePath;
    ImportTask->DestinationPath = DestinationPath;
    ImportTask->DestinationName = DestinationName;
    ImportTask->bAutomated = true;
    ImportTask->bSave = true;
    ImportTask->bReplaceExisting = bReplaceExisting;
    ImportTask->bReplaceExistingSettings = false;

    TArray<UAssetImportTask*> Tasks;
    Tasks.Add(ImportTask);
    FAssetToolsModule::GetModule().Get().ImportAssetTasks(Tasks);

    const TArray<UObject*>& ImportedObjects = ImportTask->GetObjects();
    UObject* ImportedAsset = ImportedObjects.IsEmpty() ? nullptr : ImportedObjects[0];
    UTexture2D* ImportedTexture = Cast<UTexture2D>(ImportedAsset);
    if (!ImportedTexture)
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PNG_IMPORT_FAILED"), FString::Printf(TEXT("Could not import '%s' as a UI texture."), *SourcePath));
    }

    // UI reference PNGs are authored in sRGB.  Explicitly preserve that
    // interpretation after automated import/reimport so Slate does not treat
    // browser-encoded pixels as linear color values.
    ImportedTexture->SRGB = true;
    ImportedTexture->LODGroup = TEXTUREGROUP_UI;
    ImportedTexture->PostEditChange();
    ImportedTexture->MarkPackageDirty();
    TArray<UPackage*> TexturePackagesToSave;
    TexturePackagesToSave.Add(ImportedTexture->GetOutermost());
    if (!UEditorLoadingAndSavingUtils::SavePackages(TexturePackagesToSave, false))
    {
        OutStatusCode = EHttpServerResponseCodes::ServerError;
        return Failure(TransactionId, TEXT("PNG_IMPORT_SAVE_FAILED"), FString::Printf(TEXT("Could not save imported UI texture '%s'."), *ImportedTexture->GetPathName()));
    }

    TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
    Result->SetStringField(TEXT("assetPath"), ImportedTexture->GetPathName());
    Result->SetStringField(TEXT("sourceFilePath"), SourcePath);
    Result->SetBoolField(TEXT("replacedExisting"), bReplaceExisting);
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
