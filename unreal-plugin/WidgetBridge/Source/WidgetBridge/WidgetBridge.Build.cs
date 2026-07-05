using UnrealBuildTool;

public class WidgetBridge : ModuleRules
{
    public WidgetBridge(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "Slate",
            "SlateCore",
            "UMG",
            "UMGEditor",
            "UnrealEd",
            "Kismet",
            "KismetCompiler",
            "BlueprintGraph",
            "AssetRegistry",
            "AssetTools",
            "EditorSubsystem",
            "HTTPServer",
            "Json",
            "JsonUtilities"
        });
    }
}
