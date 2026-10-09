# Shared UI component review

Open `/design-system` in the web app. The task preview runs at
[localhost:3020/design-system](http://localhost:3020/design-system).
Use the section links and the theme toggle at the top. Example interactions
update local preview state; they do not send enquiries or change account data.

The gallery covers all 35 shared component files, including the new
`RecognitionBadge`. Common compound exports are exercised within their parent examples.
Theme values and missing Figma controls are documented in the
[Figma specification](../architecture/ui-refresh/README.md).

## Components and behavior

| Component                  | Gallery section           | Behavior to review                                                                                                                                                              |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ThemeProvider              | Theme & type              | Applies saved light/dark preference through the existing root provider; all sections change together.                                                                           |
| ModeToggle                 | Header                    | Switches light/dark appearance; has a keyboard-accessible icon button.                                                                                                          |
| Button                     | Buttons                   | Click changes the example status. Hover, pressed, disabled, link, focus, pill/rounded shapes, every variant and size are shown.                                                 |
| Badge                      | Badges & crowns           | Static status chips, intent colors, soft treatment, compact code and square shape.                                                                                              |
| RecognitionBadge           | Badges & crowns           | Six original crown/laurel exports with live labels/metadata inside and descriptions below; presentation only, no eligibility or awarding logic.                                 |
| Card                       | Cards & feedback; forms   | Standard, muted, subtle and inverse surfaces; header, title, description, body and footer; new card/feature radii. Existing accent/ghost and radius overrides remain supported. |
| Alert                      | Cards & feedback          | Default, success, info, warning and destructive messages retain alert semantics.                                                                                                |
| TipCallout                 | Cards & feedback          | Tip and info variants retain the indicator structure introduced on current main.                                                                                                |
| ReUI Rating                | Cards & feedback          | Read-only zero, fractional and full star ratings with accessible numeric descriptions and optional value.                                                                       |
| Input                      | Form controls             | Type into empty/default fields; compare focused, invalid, disabled and read-only states. Native form validation remains available.                                              |
| Textarea                   | Form controls             | Multiline editing and resizing; placeholder, default and disabled states.                                                                                                       |
| Select                     | Form controls; overlays   | Shared Radix popup with themed options, selected checkmark, disabled options, typeahead, arrows/Home/End, Escape and return focus; works inside dialogs.                        |
| SelectField                | Form controls             | Composes Select with label/error. City and optional-filter examples; optional clear choice, invalid and disabled states; controlled values and form submission/reset.           |
| NumberInput                | Form controls             | Native number input with minimum value; decorative increment/decrement icon, keyboard arrows and shared input states.                                                           |
| MonthPickerField           | Form controls             | Opens a month overlay, changes year, selects YYYY-MM, clears selection, closes on outside pointer/Escape.                                                                       |
| TagCombobox                | Form controls             | Search options, create a tag, select with arrows/Enter, remove a chip, Backspace removes the last tag, Escape dismisses suggestions.                                            |
| Label                      | Form controls; navigation | Labels associate controls with their accessible names; pointer activation focuses or toggles the associated control.                                                            |
| Field                      | Form controls             | Field/group/fieldset/legend/content/description/error compositions; horizontal checkbox/switch rows and vertical inputs.                                                        |
| RequiredFieldIndicator     | Project name label        | Required marker with context available on hover or keyboard focus; the input itself remains required.                                                                           |
| Checkbox                   | Form controls             | Toggles publish preference; checked/unchecked and disabled checked states.                                                                                                      |
| Switch                     | Form controls             | Toggles notification preference; checked/unchecked and disabled states.                                                                                                         |
| Slider                     | Form controls             | Pointer drag and keyboard arrows update percentage; disabled example remains unavailable.                                                                                       |
| Dialog                     | Overlays                  | Focus stays inside; Escape, close icon or Cancel dismisses; confirmation updates status; focus returns to trigger.                                                              |
| DropdownMenu               | Overlays                  | Keyboard/pointer items, disabled item, checkbox, radio group, separator, label and destructive style. Selection updates preview state.                                          |
| Tooltip                    | Overlays                  | Context appears on hover or focus and dismisses with Escape; inverse surface and arrow.                                                                                         |
| AnimatedCollapsibleContent | Overlays                  | Toggle expands/collapses; closing unmounts content after transition. Reduced-motion mode removes animation.                                                                     |
| Tabs                       | Tabs & tables             | Segmented and underlined styles switch panels. Arrow keys cycle enabled tabs and skip disabled Private tab.                                                                     |
| Table                      | Tabs & tables             | Real column headers, rows/cells, caption; hover treatment and container-owned horizontal scrolling when needed.                                                                 |
| Pagination                 | Tabs & tables             | Page 1/2 buttons change displayed rows; active page exposes `aria-current="page"`.                                                                                              |
| Carousel                   | Media & empty states      | Next/previous buttons move slides; unavailable directions are disabled; pointer swipe supported by existing Embla implementation.                                               |
| EmptyState                 | Media & empty states      | Reuses ReUI Icon Stack and an action; Add sample project updates heading/description, Reset restores the empty state.                                                           |
| ReUI IconStack             | Empty state               | Installed decorative SVG composition is preserved; it inherits semantic theme colors.                                                                                           |
| Avatar                     | Media & empty states      | Image example and initials fallback; circular crop uses object-fit cover.                                                                                                       |
| Skeleton                   | Media & empty states      | Loading placeholders; pulse becomes static with reduced motion.                                                                                                                 |
| Separator                  | Theme & type; media       | Horizontal and vertical separators inherit the shared border color.                                                                                                             |

## Review checklist

- [ ] Review every gallery section in light mode.
- [ ] Switch to dark mode and review form/overlay/status contrast.
- [ ] Compare at desktop, tablet and 390px mobile widths.
- [ ] Tab through controls and inspect focus indicators.
- [ ] Exercise form editing, selections, validation, save and reset.
- [ ] Exercise dialog dismissal and return focus; dropdown selections; tooltips.
- [ ] Exercise both tab styles, pagination, carousel and empty-state action.
- [ ] Review crown artwork and live labels without treating examples as earned awards.
- [ ] Confirm the shared component design before the phase PR is published or updated.

## Scope and known deviations

Inter 500 is the available fallback for Figma's Helvetica Neue Medium.
Dark mode and form controls absent from the supplied frame are inferred.
Loaded font variables live on the root HTML element so the theme resolves Inter
and JetBrains Mono correctly. Buttons and status badges use centered single-line
labels across sizes. The month field uses editable text with YYYY-MM validation
and one component picker; it does not also launch a native browser month picker.
The project editor also validates completion months against the shared contract
before creating or saving a draft, since its buttons do not submit a native form.
Invalid or incomplete month text produces a correction message without a request.
This gallery verifies the shared foundation; full designer-profile layout,
mobile/footer extraction, production recognition mapping, and role-page
migrations remain in the [phased handoff](./ui-refresh-handoff.md).

Generated browser screenshots and reports stay outside committed source.
The task's latest validation status is recorded in the handoff.
