# Figma Widget Import

The UI MCP server imports a Figma root node into Widget Design IR, compiles it to the existing UMG layout payload, validates the layout, and writes it through WidgetBridge.

Use native Figma nodes. AI/Figma integrations should provide the target root node JSON to `ue.ui.review_figma_widget` before using `ue.ui.apply_figma_widget`.

## Semantic Layer Names

Name layers as `Role/WidgetName` so conversion is explicit:

- `Panel/SettingsFrame`
- `VerticalBox/SettingsRows`
- `HorizontalBox/ActionRow`
- `Scroll/InventoryScroll`
- `Text/TitleText`
- `Button/ApplyButton`
- `Slider/VolumeSlider`
- `Toggle/FullscreenToggle` or `CheckBox/FullscreenCheckBox`
- `Select/ResolutionSelect` or `ComboBox/ResolutionComboBox`

Figma `FRAME`, `COMPONENT`, and `INSTANCE` nodes convert to layout containers; `TEXT` converts to `TextBlock`; `RECTANGLE` converts to a panel. Unsupported nodes are returned as diagnostics and block apply rather than being silently dropped.
