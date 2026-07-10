# Widget DSL

Widget TSX is the source protocol for local UI MCP designs. The DSL should describe the intended Unreal UMG widget tree directly. HTML is preview output only and must not be treated as the canonical design source.

The compiler should preserve UMG semantics first, then emit a browser Review Console from the same source. The DSL remains canonical; the Review Console is a controlled inspection surface, not a second widget editor.

## Review Console

The generated HTML supports normal control interaction such as tabs, sliders, toggles, and selects. To inspect a specific widget without triggering it, Alt-click it. The console shows and can copy its stable Widget name, then the user can ask AI for a focused change such as "make `ApplyButton` wider and add a Hover glow". AI changes the DSL, reruns review, and only applies to Unreal after approval.

The console can simulate `Normal`, `Hover`, `Pressed`, and `Disabled` visual states for the selected widget. These are review-only state simulations; they do not alter DSL or Unreal assets.

## File Shape

Use a `.widget.tsx` file with simple JSX-like tags:

```tsx
<Canvas name="SettingsScreen">
  <Border name="SettingsRoot" fill backgroundColor="panel" padding={[28, 24, 28, 24]}>
    <Text name="TitleText" text="SETTINGS" variant="title" />
  </Border>
</Canvas>
```

Omit root `Canvas` width/height for normal full-screen widgets. A root child with `fill`
maps to fill-parent anchors in UMG and renders as a browser full-screen review. Add
numeric root dimensions only when intentionally reviewing a fixed-size widget.

The planned parser subset is intentionally small:

- Tags are simple component names.
- Props are strings, numbers, booleans, or JSON-ish arrays in braces.
- Children are nested tags.
- Avoid imports, variables, functions, spreads, comments inside tags, and arbitrary JavaScript expressions.

## Component Mapping

The component registry in `src/widgetDslRegistry.ts` is the diagnostic source of truth for known components, planned components, and allowed prop categories. Keep this table focused on current mapping behavior and use the registry when tooling needs the full component/prop surface.

| DSL component | UMG target | Notes |
| --- | --- | --- |
| `Canvas` | `CanvasPanel` | Root screen or explicit absolute-layout container. |
| `Border` | `Border` | Panel/frame with background, padding, and one content slot. Multiple children may be wrapped in a box. |
| `VerticalBox` | `VerticalBox` | Ordered vertical layout. |
| `HorizontalBox` | `HorizontalBox` | Ordered horizontal layout, including action rows. |
| `Tabs` | `HorizontalBox` + tab button column + `WidgetSwitcher` | Produces tab buttons and pages. |
| `Tab` | `Button` + switcher page | Child of `Tabs`; `buttonName` and `pageName` should be stable Unreal names. |
| `Panel` | `Border` | Semantic alias for a content panel. Prefer `Panel` when the intent is a settings group rather than a generic border. |
| `SettingRow` | `HorizontalBox` with sized label/control slots | Semantic two-column settings row. |
| `Text` | `TextBlock` | Use `variant="title"` or `variant="muted"` for common text styles. |
| `Button` | `Button` + child `TextBlock` | `variant="primary"` maps to the primary theme color; otherwise secondary. |
| `Slider` | `Slider` | `value` is normalized unless a later schema adds explicit ranges. |
| `Toggle` | `CheckBox` | `checked` controls initial state. |
| `Select` | `ComboBoxString` | `options` is an array of strings. |

## Conversion Policy

Conversion is rule-first:

1. Match a known semantic component by name.
2. Apply its explicit mapping to UMG.
3. Preserve stable `name` values as Unreal widget names.
4. Apply supported layout props such as `padding`, `margin`, `width`, `height`, `fill`, `auto`, `labelWidth`, and `controlWidth`.
5. Emit a loss report for unsupported styling or unsupported component props.

Semantic fallback is allowed only when a component is not recognized:

- Prefer a neutral UMG container such as `Border` or `VerticalBox`.
- Preserve children so the design remains inspectable.
- Keep the original `name`.
- Record a loss entry explaining the unsupported component or prop.
- Never infer gameplay behavior, bindings, or Blueprint events from visual markup.

## Settings Example

See `fixtures/wbp-setting-fullscreen.widget.tsx` in the public tool repository for a compact fullscreen settings example. For production screens, first gather project UI context and then adapt the DSL to the target project's visual language.
