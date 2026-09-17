# Design System & Visual Direction

## Product Design Brief

This document is the visual design source of truth for the forecasting
and supply-chain analytics frontend.

The product is an analytical enterprise web application that helps users
move from operational data to demand forecasts, inventory risk, and
recommended actions.

The intended visual direction is:

> **Professional enterprise analytics + fresh pastel color + restrained
> Liquid Glass + human-designed editorial clarity.**

The interface must look polished, credible, calm, and modern without
looking like an "AI product" template.

The visual language should communicate:

-   trust,
-   analytical precision,
-   freshness,
-   clarity,
-   operational usefulness,
-   and a sense of premium software quality.

It should NOT communicate:

-   sci-fi,
-   cyberpunk,
-   generative AI,
-   cryptocurrency,
-   gaming,
-   "AI assistant" aesthetics,
-   excessive neon,
-   excessive gradients,
-   excessive glow,
-   or a generic SaaS template.

The product should look like a serious forecasting and supply-chain
platform that happens to have a contemporary interface.

------------------------------------------------------------------------

# Confirmed Product Decisions

The following decisions were confirmed during product/design
interview and should be treated as requirements unless explicitly
changed later.

## Target User

The system is intended for a mid-sized to large company. The primary
users are expected to be planners and managers who need to monitor
demand, understand forecast outputs, investigate operational implications,
and eventually support supply-chain decisions. The interface should
therefore feel like a professional enterprise planning workstation, not
a consumer analytics app.

The user is assumed to value fast scanning at the overview level and
detailed investigation when entering an analytical page. Numbers, trends, exceptions, and recommended actions should be easy to locate
without sacrificing analytical depth.

## Hackathon Product Priority

For the hackathon prototype, demand forecasting is the main product
story. Sales and broader supply-chain capabilities are supporting
context and future expansion areas. Visual hierarchy should therefore
make forecast outputs, forecast confidence/uncertainty, forecast
accuracy, and demand patterns more prominent than secondary business
metrics.

This does not mean sales or supply-chain information should be removed.
It means those areas should support the forecasting workflow instead of
competing with it for attention.

## Confirmed Visual Direction

Liquid Glass should be subtle and professional. It should read as a
modern functional material used for navigation, filters, floating
controls, drawers, and transient UI rather than as the default surface
for every card. The product should remain recognizable as a serious
enterprise analytics system even if the glass effects are removed.

The overall environment should be light and fresh, with a mostly white
content foundation and a noticeable but restrained pale-blue atmosphere
using `#CFE8F5` and related near-white tints. The background should not
become a large gradient or decorative color field.

Purple, using `#DA9DFD` and `#C76CFC`, is a general secondary accent. It
may support forecasting, selections, highlights, and visual emphasis,
but it is not reserved exclusively for forecasting. The blue palette
remains the primary product identity.

## Confirmed Navigation Architecture

The dashboard uses three persistent top-level tabs:

``` text
Overview
Demand & Sales
Supply Chain
```

Forecasting is integrated into Demand & Sales. There should not be a
separate Forecast tab in the current hackathon architecture. The
Demand & Sales page should therefore be designed as the main analytical
workspace, with forecasting as its dominant workflow and sales/demand
views as supporting analysis.

# 1. Research Basis

This design direction is informed by current platform guidance around
Liquid Glass and established interface hierarchy principles.

Apple's current Liquid Glass guidance describes Liquid Glass as a
dynamic material that combines translucency, depth, and fluidity, while
emphasizing hierarchy, harmony, and consistency. Apple specifically
recommends using Liquid Glass primarily for the functional/navigation
layer rather than applying glass indiscriminately to content surfaces.

Source: Apple Developer, "Liquid Glass"
https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass

Apple's Human Interface Guidelines also emphasize that materials create
depth and hierarchy, and explicitly recommend keeping Liquid Glass
primarily in the functional layer such as navigation, tab bars,
sidebars, and controls. Content should generally remain on standard
surfaces rather than becoming a collection of glass panels.

Source: Apple Human Interface Guidelines, "Materials"
https://developer.apple.com/design/human-interface-guidelines/materials

Apple's current guidance also stresses that Liquid Glass should be used
sparingly, that glass-on-glass layering should be avoided, and that the
content beneath the material should remain visually important.

Source: Apple Developer, "Meet Liquid Glass"
https://developer.apple.com/videos/play/wwdc2025/219/

Apple's layout guidance emphasizes visual hierarchy, alignment,
grouping, and placing important information where users naturally begin
reading.

Source: Apple Human Interface Guidelines, "Layout"
https://developer.apple.com/design/human-interface-guidelines/layout

These principles are adopted here, but this product is NOT intended to
imitate Apple's interface literally.

The goal is to borrow the useful material principles:

-   translucent functional surfaces,
-   subtle depth,
-   controlled blur,
-   hierarchy,
-   fluid interaction,
-   restrained tint,
-   and separation between navigation and content,

while creating a distinct visual identity around the provided blue and
pastel-purple palette.

------------------------------------------------------------------------

# 2. Core Design Statement

The interface should feel like:

> **A clean forecasting workstation sitting inside a soft, translucent
> environment.**

The user should notice the information first and the visual effects
second.

A good implementation should make someone think:

> "This is a very polished analytics product."

It should NOT make them think:

> "This is an AI landing page."

The interface should therefore prioritize:

1.  Information hierarchy
2.  Legibility
3.  Data visualization
4.  Navigation clarity
5.  Operational scanning
6.  Subtle material depth
7.  Brand color
8.  Decorative effects

In that order.

------------------------------------------------------------------------

# 3. The Non-AI Design Rule

This is one of the most important requirements in the entire design
system.

The product must intentionally avoid common visual signals associated
with generic AI interfaces.

Avoid:

-   glowing purple/blue blobs behind every section,
-   giant gradient text,
-   excessive glass cards,
-   "magic" sparkles,
-   robotic icons,
-   abstract neural-network backgrounds,
-   holographic effects,
-   excessive particle effects,
-   animated waves,
-   excessive rounded pills,
-   rainbow gradients,
-   "AI" badges everywhere,
-   glowing buttons,
-   excessive use of the word "intelligent",
-   chatbot-like floating assistants unless there is a real product
    need,
-   decorative model diagrams on the main dashboard,
-   futuristic dark-mode-only interfaces,
-   excessive use of purple as the dominant color.

The product's intelligence should be communicated through the quality of
its analysis, not through visual clichés.

The user should be looking at:

-   demand,
-   forecast,
-   inventory,
-   risk,
-   recommendation,
-   and evidence.

The UI should not constantly remind them that "AI" exists.

------------------------------------------------------------------------

# 4. Desired Personality

The visual personality should sit between:

``` text
Enterprise
    +
Modern
    +
Fresh
    +
Premium
    +
Approachable
```

The interface should not be:

``` text
Corporate
+
Cold
+
Dense
+
Old-fashioned
```

and should not be:

``` text
Playful
+
Glowy
+
Futuristic
+
AI-generated
```

The target is a mature product with a youthful visual treatment.

The color palette gives the freshness.

The layout gives the professionalism.

The glass gives the contemporary feel.

The typography and information density give the credibility.

------------------------------------------------------------------------

# 5. Color Palette

The canonical palette is:

  Token       Hex         Intended role
  ----------- ----------- ----------------------------------
  Palette 1   `#03436D`   Deep primary blue
  Palette 2   `#288DCE`   Primary blue / active state
  Palette 3   `#CFE8F5`   Pale blue background / tint
  Palette 4   `#DA9DFD`   Soft lavender accent
  Palette 5   `#C76CFC`   Strong purple accent
  Palette 6   `#EEEEEE`   Neutral surface
  Palette 7   `#000000`   Primary text / high-contrast ink

These colors are the identity of the product.

Do not introduce a large number of unrelated colors.

Additional semantic colors may be required for status communication, but
they should be introduced carefully and should not compete with the
brand palette.

------------------------------------------------------------------------

# 6. Color Roles

## 6.1 Deep Blue: `#03436D`

This is the most important dark brand color.

Use it for:

-   primary headings when a strong branded emphasis is appropriate,
-   important navigation states,
-   selected navigation icons,
-   high-priority data labels,
-   primary chart series,
-   important controls,
-   strong borders when a border is actually necessary,
-   and brand elements.

It should feel authoritative.

Do not use it as the background of every section.

It is a grounding color.

The interface should have enough deep blue to establish identity without
becoming visually heavy.

------------------------------------------------------------------------

# 7. Primary Blue: `#288DCE`

This is the active and interactive blue.

Use it for:

-   links,
-   active states,
-   selected tabs,
-   interactive chart elements,
-   primary buttons where appropriate,
-   focus indicators,
-   progress states,
-   and positive informational emphasis.

It should generally represent:

> "This is interactive or currently selected."

It should not be used as the fill color of every card.

------------------------------------------------------------------------

# 8. Pale Blue: `#CFE8F5`

This is the primary freshness color.

Use it for:

-   page background tint,
-   large soft background areas,
-   subtle section backgrounds,
-   selected filter backgrounds,
-   low-emphasis information blocks,
-   chart backgrounds when appropriate,
-   and atmospheric depth behind the interface.

This should contribute to the feeling of freshness without becoming
childish.

A large part of the page can use this color very subtly.

It should never make text difficult to read.

Because the pale blue is very light, dark text should be used on top of
it.

------------------------------------------------------------------------

# 9. Soft Lavender: `#DA9DFD`

This is a secondary accent.

Use it sparingly for:

-   forecast-related secondary signals,
-   comparison series,
-   subtle highlights,
-   secondary chart elements,
-   selected-but-not-primary states,
-   and occasional decorative background light.

The lavender should feel like a supporting accent rather than the
product's main identity.

------------------------------------------------------------------------

# 10. Strong Purple: `#C76CFC`

This is the high-energy accent.

Use it carefully.

Appropriate uses include:

-   a secondary primary action,
-   a strong forecast-related visual distinction,
-   a small highlighted state,
-   a selected data series,
-   or a controlled gradient accent.

Do not use it for every button.

Do not use it as the default text color.

Do not make the dashboard predominantly purple.

The purple exists to make the blue palette feel fresh and contemporary.

------------------------------------------------------------------------

# 11. Neutral Gray: `#EEEEEE`

`#EEEEEE` is a structural neutral.

Use it for:

-   subtle borders,
-   separators,
-   inactive surfaces,
-   table row divisions,
-   skeleton states,
-   neutral backgrounds,
-   and low-emphasis containers.

It should not become the entire background if the goal is a fresh,
atmospheric interface.

It should support the blue-tinted environment.

------------------------------------------------------------------------

# 12. Black: `#000000`

Black is the strongest text and contrast color.

Use it for:

-   major body text,
-   important numerical values,
-   table values,
-   headings where strong contrast is needed,
-   and high-priority information.

Do not use pure black for every text element.

Secondary text should use controlled opacity or a dark neutral derived
from black, provided the resulting contrast remains accessible.

------------------------------------------------------------------------

# 13. Color Ratio and Accessibility

The palette must be used with contrast in mind.

Important observations from the supplied palette:

-   `#03436D` has strong contrast against white.
-   `#000000` has very strong contrast against `#CFE8F5`, `#DA9DFD`, and
    `#EEEEEE`.
-   `#288DCE` should not automatically receive white text for small text
    because its contrast against white is relatively limited.
-   `#DA9DFD` should not be used as a background for white text.
-   `#C76CFC` should not be assumed to support white text for small
    text.
-   Pale colors should generally use dark text.
-   Strong blue/purple fills should be checked for contrast before using
    white labels.

The interface should never sacrifice readability to preserve the
palette.

The palette is a visual identity, not a reason to ignore accessibility.

------------------------------------------------------------------------

# 14. Background Direction

The background should be light, fresh, and slightly atmospheric.

Preferred direction:

``` text
Very light blue-tinted environment
        ↓
Soft white / pale-blue content plane
        ↓
Translucent navigation layer
        ↓
Dark blue and black typography
        ↓
Blue / purple analytical accents
```

The background can contain extremely subtle color variation.

For example:

``` text
#CFE8F5
      ↓
very low-opacity blue
      +
very low-opacity lavender
      ↓
near-white analytical canvas
```

However, the background should never look like a giant gradient poster.

The user should be able to read a table comfortably.

------------------------------------------------------------------------

# 15. Background Decoration

Subtle atmospheric shapes are allowed.

Good:

-   a very soft blurred blue circle far behind the dashboard,
-   a faint lavender light source behind a navigation area,
-   a barely visible gradient wash,
-   subtle depth around the outer page boundary.

Bad:

-   large glowing blobs behind every card,
-   visible neon orbs,
-   multiple overlapping gradients,
-   animated particles,
-   glowing waves,
-   aurora backgrounds,
-   galaxy effects.

The background should support the interface rather than compete with it.

------------------------------------------------------------------------

# 16. Liquid Glass Philosophy

Liquid Glass is a material treatment, not a card template.

This distinction is critical.

Do NOT turn every card into:

``` text
backdrop-blur
+
semi-transparent white
+
border
+
shadow
```

If every element becomes glass, nothing feels special.

The design should instead use three conceptual layers:

``` text
BACKGROUND LAYER
    soft color + atmosphere

CONTENT LAYER
    charts + tables + analytical content

FUNCTIONAL GLASS LAYER
    navigation + selected controls + transient overlays
```

This follows the central principle in Apple's current Liquid Glass
guidance: glass is most useful when it establishes a distinct functional
layer above content rather than being applied indiscriminately to the
content itself.

------------------------------------------------------------------------

# 17. Where Liquid Glass Should Be Used

Primary Liquid Glass candidates:

-   top navigation,
-   sidebar if used,
-   dashboard tab navigation,
-   floating filter controls,
-   compact action controls,
-   contextual menus,
-   modal surfaces,
-   floating toolbars,
-   temporary interaction elements.

The effect should be restrained.

The user should feel that these elements are floating slightly above the
analytical content.

------------------------------------------------------------------------

# 18. Where Liquid Glass Should NOT Be Used

Do not use Liquid Glass as the default material for:

-   large data tables,
-   every KPI card,
-   every chart container,
-   every page section,
-   dense analytical panels,
-   long text blocks,
-   large forms,
-   full-page backgrounds.

The analytical content should generally use clear, stable surfaces.

This improves hierarchy and readability.

A table needs to feel like a table.

A chart needs to feel like a chart.

A navigation control can feel like glass.

------------------------------------------------------------------------

# 19. Avoid Glass-on-Glass

Do not create:

``` text
Glass page
    ↓
Glass card
        ↓
Glass button
            ↓
Glass tooltip
```

This creates visual noise and weakens hierarchy.

Prefer:

``` text
Soft background
    ↓
Stable content surface
    ↓
Glass navigation/control layer
```

If a button sits inside a normal content card, it does not automatically
need another glass effect.

------------------------------------------------------------------------

# 20. Glass Material Characteristics

A Liquid Glass element should generally have:

-   translucency,
-   background blur,
-   subtle border definition,
-   soft depth,
-   restrained shadow,
-   mild highlight,
-   rounded geometry,
-   and adaptive interaction feedback.

It should not have:

-   strong outer glow,
-   thick white borders,
-   excessive blur,
-   high-opacity gradients,
-   heavy drop shadows,
-   or exaggerated 3D beveling.

The glass should look physical but subtle.

Think:

> polished translucent material

not:

> glowing futuristic hologram.

------------------------------------------------------------------------

# 21. Glass Opacity

Do not use a single opacity value for every glass element.

The material should respond to context.

General direction:

``` text
Navigation glass:
more opaque

Floating controls:
medium opacity

Transient overlay:
medium-high opacity

Media-rich decorative area:
more translucent
```

Legibility takes priority.

If a translucent element sits over text, imagery, or a dense chart,
increase separation rather than forcing excessive transparency.

------------------------------------------------------------------------

# 22. Glass Blur

Blur should be noticeable only when looking for it.

The blur should:

-   soften the background,
-   separate navigation from content,
-   preserve the feeling of transparency,
-   and reduce visual noise.

It should not:

-   turn the background into an unreadable fog,
-   make text fuzzy,
-   or make every panel appear detached from the page.

Use blur as a depth tool, not as decoration.

------------------------------------------------------------------------

# 23. Glass Borders

Glass surfaces may use extremely subtle borders.

The border should communicate:

> "This is a distinct floating surface."

It should not look like:

> "This component has a 2px white outline."

Prefer low-contrast borders.

The border can use a translucent version of white, `#03436D`, or
`#EEEEEE` depending on the underlying surface.

------------------------------------------------------------------------

# 24. Glass Shadows

Shadows should be soft and broad.

Avoid:

``` text
large dark shadow
```

Prefer:

``` text
small separation
+
soft ambient shadow
```

The user should perceive elevation without seeing an obvious artificial
shadow.

------------------------------------------------------------------------

# 25. Glass Highlights

A very subtle highlight can be used on the upper edge of glass controls.

For example:

``` text
top edge:
very subtle light reflection

body:
translucent material

bottom:
soft shadow
```

Do not use a visible shiny strip across every card.

Highlights should be occasional and functional.

------------------------------------------------------------------------

# 26. Shape Language

The shape language should be soft but professional.

Use:

-   rounded rectangles,
-   moderate corner radii,
-   pill shapes only for compact statuses/filters,
-   consistent radii across the system.

Avoid:

-   extremely round cards,
-   giant capsules,
-   circles everywhere,
-   random radius values,
-   playful blob shapes.

A professional analytics application should have a controlled geometric
vocabulary.

------------------------------------------------------------------------

# 27. Suggested Corner Radius System

Use a small radius scale.

Conceptually:

``` text
XS = 6px
SM = 10px
MD = 14px
LG = 18px
XL = 24px
```

Use:

-   10px to 14px for standard controls,
-   14px to 18px for cards,
-   18px to 24px for major floating surfaces,
-   pills only where the component is inherently compact.

Do not make every object 24px rounded.

The more rounded the interface becomes, the more playful it feels.

The target is polished, not toy-like.

------------------------------------------------------------------------

# 28. Typography

Typography should be clean, highly readable, and relatively understated.

The interface should use a modern sans-serif with excellent numerical
readability.

Good candidates include:

-   Inter,
-   Geist,
-   IBM Plex Sans,
-   SF Pro where platform licensing/context permits,
-   or another highly legible system sans-serif.

The final font should be selected based on implementation constraints.

Typography should not look futuristic.

Avoid:

-   sci-fi fonts,
-   geometric display fonts for body content,
-   oversized gradient headings,
-   extremely thin text,
-   excessive letter spacing.

------------------------------------------------------------------------

# 29. Typography Hierarchy

The hierarchy should be obvious without being theatrical.

Suggested hierarchy:

``` text
Page title
20–28px
Strong weight

Section title
15–18px
Medium/Semibold

Metric value
24–36px
Semibold/Bold

Body
13–15px
Regular

Secondary metadata
11–13px
Regular/Medium
```

These are starting points, not absolute values.

The design should be calibrated to the actual application density.

------------------------------------------------------------------------

# 30. Numbers Are First-Class Content

This is a forecasting dashboard.

Numbers must be extremely readable.

Important metrics should have:

-   sufficient size,
-   strong contrast,
-   consistent decimal formatting,
-   consistent units,
-   enough surrounding whitespace.

For example:

``` text
84,200
units
```

is preferable to:

``` text
84,200 units
```

when the metric needs strong visual hierarchy.

For financial values:

``` text
Rp 2.4B
Inventory Value
```

can be used if the scale is clearly communicated.

------------------------------------------------------------------------

# 31. Navigation Design

The navigation is one of the strongest places to use Liquid Glass.

The dashboard navigation should feel like a floating functional layer.

Possible structure:

``` text
┌──────────────────────────────────────────────────────┐
│  Project                     Overview Demand ...     │
│  Dataset                      Forecast  Supply Chain │
└──────────────────────────────────────────────────────┘
```

or a floating side navigation.

The exact architecture follows the UX flow document.

The visual treatment should make navigation clearly distinct from
content.

------------------------------------------------------------------------

# 32. Main Dashboard Tabs

The confirmed dashboard architecture for the hackathon prototype uses
three persistent top-level tabs:

``` text
Overview
Demand & Sales
Supply Chain
```

Forecasting is NOT a separate top-level tab. Forecasting is the central
analytical workflow inside Demand & Sales. This keeps the product
focused on its core hackathon value: turning demand history and related
data into an understandable, actionable forecast.

The three tabs should not look like three unrelated applications.

They should share:

-   navigation,
-   typography,
-   spacing,
-   filter conventions,
-   chart language,
-   status semantics,
-   and interaction behavior.

------------------------------------------------------------------------

# 33. Overview Design Direction

Overview should be the cleanest and most spacious dashboard page.

It should feel like:

> "I can understand the state of the business in under a minute."

Suggested hierarchy:

``` text
Page Header
    ↓
Primary KPI row
    ↓
Main Actual vs Forecast chart
    ↓
Inventory / risk summary
    ↓
Priority actions
```

Do not fill the page with tiny cards.

Fewer, stronger components are preferred.

------------------------------------------------------------------------

# 34. KPI Card Design

KPI cards should be stable content surfaces, not necessarily glass.

A KPI card can have:

-   pale-blue tint,
-   white or near-white surface,
-   subtle border,
-   small accent,
-   large number,
-   concise label,
-   contextual comparison.

Example:

``` text
Demand Forecast
84,200
next 30 days

↑ 8.4% vs previous period
```

The card should not have:

-   a giant icon,
-   a gradient background,
-   glow,
-   3D illustration,
-   or decorative AI imagery.

------------------------------------------------------------------------

# 35. KPI Accent System

Use accent color to communicate category.

For example:

``` text
Demand
Blue

Forecast
Purple

Inventory
Pale Blue / Deep Blue

Risk
Blue with semantic warning color where needed
```

Do not make every KPI a different rainbow color.

The palette should feel coherent.

------------------------------------------------------------------------

# 36. Chart Design Philosophy

Charts are the product.

The visual system should not overwhelm them.

Charts should use:

-   restrained lines,
-   minimal gridlines,
-   strong axis labels,
-   clear legends,
-   consistent series colors,
-   subtle hover states,
-   and adequate whitespace.

Do not put a glass effect directly over the chart unless there is a
strong functional reason.

The chart should remain the primary visual object.

------------------------------------------------------------------------

# 37. Forecast Chart Colors

The exact mapping should remain consistent across the application.

Recommended semantic mapping:

``` text
Actual
#03436D

Forecast
#C76CFC

Forecast uncertainty
#DA9DFD with transparency

Secondary comparison
#288DCE

Neutral/reference
#EEEEEE
```

The forecast should be visually distinct from actuals.

The distinction should remain understandable even without color, using
line style, markers, or position where appropriate.

------------------------------------------------------------------------

# 38. Chart Backgrounds

Charts should generally sit on:

-   white,
-   very pale blue,
-   or a very subtle neutral surface.

Avoid:

``` text
purple gradient chart backgrounds
```

or:

``` text
glass chart panels
```

that make data harder to inspect.

The chart container can have a soft surface and rounded corners, but the
visualization itself should remain clean.

------------------------------------------------------------------------

# 39. Actual vs Forecast Visual Hierarchy

The user should immediately understand:

``` text
Past = actual
Future = forecast
```

Use a clear transition marker.

For example:

``` text
historical line
───────────────│
               │ NOW
               │
               └──────── forecast
```

The forecast region can have a very subtle pale-purple background.

Do not make the forecast region neon or dramatically different.

------------------------------------------------------------------------

# 40. Demand & Sales Page

This page should be denser than Overview.

Its visual personality should be:

> analytical workstation.

The layout should prioritize:

``` text
Filter controls
    ↓
Main comparison chart
    ↓
Supporting visualizations
    ↓
Demand pattern analysis
```

The user should have enough control to investigate a product or location
without feeling overwhelmed.

------------------------------------------------------------------------

# 41. Filter Bar

Filters should use compact, highly legible controls.

Example:

``` text
[ Date Range ] [ Product ] [ Location ] [ Compare ]
```

The filter bar can use a glass treatment because it is a functional
control layer.

However, the filter controls should not all glow.

The selected state can use:

``` text
#CFE8F5
```

with:

``` text
#03436D
```

text.

The primary active action can use `#288DCE`.

------------------------------------------------------------------------

# 42. Filter Behavior

Filters should feel like tools, not decoration.

A filter should clearly communicate:

-   current selection,
-   whether multiple values are selected,
-   whether the result is filtered,
-   and how to clear it.

Avoid tiny ambiguous icons.

Use clear labels.

For example:

``` text
Location
Jakarta
```

is better than:

``` text
⌄ Jakarta
```

if the context is not obvious.

------------------------------------------------------------------------

# 43. Forecasting Within Demand & Sales

Forecasting is a primary section of the Demand & Sales tab, not a
separate navigation destination. The page should make the forecast
output immediately understandable while still providing enough detail
for a planner or manager to investigate the result.

The forecasting section can contain:

``` text
Forecast controls
Forecast summary
Historical vs forecast chart
Forecast uncertainty
Accuracy metrics
Forecast table
Model information, kept subordinate
```

The visual hierarchy should always put the forecast result first, then
explanation and supporting diagnostics. The design should avoid turning
the product into a machine-learning console. The user is there to make
sense of the forecast and its operational implications, not inspect
model internals.

Because the hackathon is primarily judged on demand forecasting, the
forecast result should receive the strongest visual hierarchy within
this tab. Sales analysis is supporting context rather than the main
story.

------------------------------------------------------------------------

# 44. Model Information Design

Model metadata should be visually subordinate to the forecast.

For example:

``` text
Forecast
84,200 units

Model
TSB

WAPE
12.8%

Bias
+1.9%
```

The model name should not be the biggest object.

The forecast output is the main result.

------------------------------------------------------------------------

# 45. ADI and CV² Visual Design

ADI and CV² should be presented as analytical metadata.

Avoid giant circular gauges.

Avoid:

``` text
ADI
████████████
87%
```

unless the value genuinely represents a percentage.

Prefer compact analytical blocks:

``` text
Demand Pattern
Intermittent

ADI
4.8 periods

CV²
1.7
```

The user should understand the classification before seeing the
technical numbers.

------------------------------------------------------------------------

# 46. Demand Pattern Classification

The four conceptual demand classes can have subtle visual identities:

``` text
Smooth
Blue

Erratic
Blue-purple

Intermittent
Lavender

Lumpy
Deep purple
```

These should remain within the supplied palette.

If semantic warning colors are required, they may be added sparingly.

Do not turn demand classification into a rainbow chart.

------------------------------------------------------------------------

# 47. Supply Chain Page

The Supply Chain Management page should be the most operationally dense
page.

It should feel like:

> a professional control room for inventory decisions

but not like a military dashboard.

The primary element should be the table.

The user should be able to scan many rows quickly.

------------------------------------------------------------------------

# 48. Supply Chain Table

The table should use a clean neutral surface.

Recommended structure:

``` text
Product
Location
Current Stock
Forecast Demand
Coverage
Risk
Recommended Order
```

The header should be visually distinct but restrained.

Rows should use subtle separators rather than heavy borders.

Hover states can use pale blue.

Selected rows can use a slightly stronger blue tint.

------------------------------------------------------------------------

# 49. Risk Status

Risk should be easy to scan.

However, do not make the entire row red.

The product palette is primarily blue and purple.

Semantic status colors can be introduced only where necessary.

For example:

``` text
Healthy
subtle blue/neutral

Watch
soft amber if semantic color is approved

At Risk
soft warm semantic accent

Stockout Risk
stronger semantic treatment
```

The status should be communicated by:

-   label,
-   icon,
-   and color.

Color should never be the only signal.

------------------------------------------------------------------------

# 50. Recommendation Design

Recommendations should look factual and analytical.

Good:

``` text
Recommended Order
3,500 units

Projected shortage
2,700 units

Lead-time demand
4,200 units
```

Bad:

``` text
AI MAGIC
Order Now!
```

The latter immediately creates an artificial AI aesthetic and reduces
trust.

The recommendation should feel like a result from an operational
planning system.

------------------------------------------------------------------------

# 51. Detail Drawer

When a user selects a product from the Supply Chain table, a side drawer
is a strong interaction pattern.

The drawer can contain:

``` text
Product identity
Risk status
Current inventory
Demand forecast
Stockout projection
Recommended order
Reasoning
Recent demand
```

The drawer can use Liquid Glass because it is a contextual functional
surface.

However, the content inside should remain stable and readable.

Do not stack multiple glass surfaces inside the drawer.

------------------------------------------------------------------------

# 52. Modal Design

Modals should be rare.

Use them for:

-   confirmation,
-   critical errors,
-   mapping review,
-   destructive actions,
-   or focused workflows.

Do not use modals for normal analytics.

Analytics should remain on the page.

------------------------------------------------------------------------

# 53. Data Upload Design

The upload screen should be calm and professional.

Avoid the stereotypical SaaS upload design:

``` text
huge cloud illustration
+
gradient background
+
"Upload your data with AI"
```

Instead:

``` text
Upload dataset

Drag and drop CSV
or
[ Choose file ]

Expected fields
Date · Product · Quantity · Location

Your data will be profiled before forecasting.
```

The interface should feel like a professional data workflow.

------------------------------------------------------------------------

# 54. Processing Screen

The processing screen can use subtle animation.

Good:

``` text
Processing dataset

✓ File uploaded
✓ Schema detected
● Checking data quality
○ Preparing forecast
○ Preparing inventory analysis
```

Bad:

``` text
AI THINKING...
████████████
Neural Engine Activated
```

The user needs operational status, not theatrical AI animation.

------------------------------------------------------------------------

# 55. Validation / Mapping Screen

The mapping screen should be highly functional.

Use a clean table:

``` text
Your Column       Detected Meaning       Confidence
---------------------------------------------------
tgl_order         Date                   High
kode_barang       Product ID             High
qty               Demand Quantity        Medium
cabang            Location               High
```

Potentially show a subtle confidence indicator.

The system should explain uncertain mappings.

The visual language should feel like data preparation software, not a
chatbot.

------------------------------------------------------------------------

# 56. Buttons

Buttons should be simple.

Primary button:

``` text
#288DCE
```

with strong readable text.

Secondary button:

``` text
light surface
+
deep blue text
```

Tertiary:

``` text
text-only
```

Purple can be used as an accent for selected special actions, but it
should not replace blue as the standard action color.

Avoid:

-   glowing buttons,
-   gradient buttons everywhere,
-   giant pills,
-   excessive shadows.

------------------------------------------------------------------------

# 57. Primary Action Hierarchy

Every page should have one visually dominant primary action where a
primary action exists.

Example:

Upload:

``` text
Choose file
```

Validation:

``` text
Confirm mapping
```

Forecast:

``` text
Generate forecast
```

Supply Chain:

Usually there may not be a global primary CTA because the page is
primarily for investigation.

Do not invent buttons just to make the page look interactive.

------------------------------------------------------------------------

# 58. Iconography

Icons should be simple and familiar.

Good:

-   line icons,
-   standard analytical icons,
-   simple arrows,
-   calendar,
-   filter,
-   search,
-   package,
-   chart,
-   alert,
-   location.

Avoid:

-   robotic heads,
-   sparkles,
-   neural network icons,
-   AI stars,
-   overly detailed 3D icons.

The icon system should support comprehension.

------------------------------------------------------------------------

# 59. Decorative Illustration

Illustrations should be used very sparingly.

The product is an analytics tool.

Large illustrations should not compete with data.

If illustrations are used on onboarding:

-   keep them abstract but simple,
-   use the palette,
-   avoid AI imagery,
-   avoid 3D floating objects,
-   avoid generic stock illustrations.

The interface should derive its visual identity from the material and
data, not from decorative artwork.

------------------------------------------------------------------------

# 60. Motion

Motion should be subtle and purposeful.

Good motion:

-   tab transition,
-   filter selection,
-   glass interaction feedback,
-   drawer opening,
-   chart transition,
-   progress updates,
-   hover elevation,
-   skeleton loading.

Bad motion:

-   constant floating blobs,
-   pulsing cards,
-   glowing dashboards,
-   infinite gradient animations,
-   decorative particles,
-   excessive spring effects.

The product should feel alive, not animated for the sake of animation.

------------------------------------------------------------------------

# 61. Glass Interaction

When interacting with a glass control, the material can respond subtly.

For example:

``` text
rest:
soft translucent surface

hover:
slightly stronger highlight

press:
slightly darker/tighter surface

selected:
blue or purple tint
```

This follows the principle that the material itself can provide
interaction feedback.

The effect should remain subtle enough that users do not consciously
notice the animation.

------------------------------------------------------------------------

# 62. Accessibility

Accessibility is part of the design system, not an afterthought.

The UI must support:

-   sufficient text contrast,
-   visible focus states,
-   keyboard navigation,
-   reduced motion,
-   reduced transparency where applicable,
-   clear status labels,
-   non-color indicators,
-   readable table density,
-   and meaningful semantic HTML.

Liquid Glass should never be allowed to make text unreadable.

If transparency is reduced, the interface should still look intentional.

If animations are reduced, the product should remain fully
understandable.

------------------------------------------------------------------------

# 63. Reduced Transparency

The application should have a fallback for users who prefer reduced
transparency or whose environment makes translucent materials difficult
to use.

The fallback can replace:

``` text
translucent glass
```

with:

``` text
opaque near-white / pale-blue surface
```

while preserving:

-   radius,
-   hierarchy,
-   spacing,
-   navigation structure,
-   and selected states.

The product should remain visually coherent without glass.

------------------------------------------------------------------------

# 64. Reduced Motion

If reduced motion is enabled:

-   remove floating animation,
-   reduce morphing,
-   remove decorative transitions,
-   use simple fades or immediate state changes,
-   preserve feedback through color and position.

No important information should depend on animation.

------------------------------------------------------------------------

# 65. Responsive Behavior

The primary target is desktop.

The product is an analytical workspace, so desktop layouts can use:

-   wide charts,
-   dense tables,
-   side-by-side panels,
-   persistent filters.

However, the system should remain responsive.

At narrower widths:

``` text
multi-column layout
      ↓
stacked sections

wide table
      ↓
horizontal scroll / responsive table strategy

full navigation
      ↓
compact navigation
```

Do not simply shrink everything.

Information hierarchy should determine what collapses.

------------------------------------------------------------------------

# 66. Spacing System

Spacing should feel generous enough to communicate hierarchy but dense
enough for analytics.

Suggested base unit:

``` text
4px
```

Use multiples of the base unit:

``` text
4
8
12
16
20
24
32
40
48
64
```

Do not use arbitrary spacing values throughout the interface.

------------------------------------------------------------------------

# 67. Page Width

The dashboard should use a controlled maximum content width where
appropriate.

The content should not stretch infinitely on large displays.

A wide desktop layout can use:

``` text
main content
+
comfortable outer margins
```

Large charts may use more width.

Tables can use available width.

The exact max-width should be tuned during implementation.

------------------------------------------------------------------------

# 68. Density

The application is not a marketing website.

It is an operational dashboard.

Therefore:

``` text
Too much whitespace = inefficient
Too little whitespace = overwhelming
```

The target is:

> dense enough for analysis, spacious enough for scanning.

Overview can be more spacious.

Supply Chain Management can be denser.

This difference is intentional.

------------------------------------------------------------------------

# 69. Tables vs Cards

Use cards for:

-   KPIs,
-   summaries,
-   focused metrics,
-   compact contextual information.

Use tables for:

-   many products,
-   inventory,
-   exact values,
-   operational comparison,
-   filtering,
-   sorting.

Do not turn every table row into a card on desktop.

Do not turn every KPI into a table.

Each representation should match the user's task.

------------------------------------------------------------------------

# 70. Empty States

Empty states should be visually calm.

Example:

``` text
No forecast available

Generate a forecast for this project
to see expected demand here.

[Generate forecast]
```

Do not use giant illustrations.

Do not use "AI is waiting" language.

------------------------------------------------------------------------

# 71. Error States

Error states should look like part of the product.

Example:

``` text
Forecast could not be loaded

The forecast result is temporarily unavailable.
Try again or return to the project overview.

[Try again]
```

Use semantic color carefully.

Do not flood the entire page with red.

------------------------------------------------------------------------

# 72. Success States

Success should also be subtle.

Example:

``` text
Dataset validated
```

with a small status indicator.

Avoid giant:

``` text
SUCCESS!!!
```

notifications.

The product should feel mature.

------------------------------------------------------------------------

# 73. Toasts

Toasts should be used for lightweight feedback.

Good:

``` text
Filters updated
Mapping saved
Forecast generation started
```

Bad:

``` text
AI HAS SUCCESSFULLY OPTIMIZED YOUR SUPPLY CHAIN
```

Keep copy factual.

------------------------------------------------------------------------

# 74. Content Tone

Interface copy should be:

-   concise,
-   direct,
-   factual,
-   professional,
-   human.

Avoid buzzwords.

Avoid excessive claims.

Avoid exaggerated AI language.

Prefer:

``` text
Forecast generated
```

over:

``` text
AI-powered predictive intelligence successfully unlocked
```

Prefer:

``` text
12 products at stockout risk
```

over:

``` text
12 intelligent risk opportunities detected
```

------------------------------------------------------------------------

# 75. Product Naming in the UI

The product should not repeatedly advertise its technology.

The user should see:

``` text
Forecast
Inventory
Demand
Risk
Recommendation
```

rather than:

``` text
AI Forecast
AI Inventory Intelligence
AI Demand Brain
AI Recommendation Engine
```

Technology is an implementation detail unless the user specifically
needs to understand it.

------------------------------------------------------------------------

# 76. Visual Hierarchy of Intelligence

The interface should communicate intelligence through sequence:

``` text
What happened?
        ↓
What is happening?
        ↓
What is expected?
        ↓
What is at risk?
        ↓
What should be investigated?
```

This is more credible than decorative AI symbolism.

------------------------------------------------------------------------

# 77. Freshness Without Playfulness

The pastel palette should make the interface fresh.

Freshness should come from:

-   pale blue environment,
-   soft lavender accents,
-   translucent navigation,
-   clean typography,
-   controlled whitespace,
-   gentle interaction states.

Do not make it fresh by using:

-   cartoon icons,
-   bright stickers,
-   giant rounded pills,
-   playful illustrations,
-   or excessive gradients.

The product should feel contemporary, not childish.

------------------------------------------------------------------------

# 78. Professionalism Without Coldness

Professionalism should come from:

-   consistency,
-   spacing,
-   typography,
-   alignment,
-   stable components,
-   predictable interactions,
-   strong data hierarchy.

Warmth should come from:

-   pastel blue,
-   lavender,
-   translucent materials,
-   subtle depth,
-   restrained softness.

This balance is central to the visual identity.

------------------------------------------------------------------------

# 79. The "Fresh Glass Analytics" Formula

The target visual formula can be summarized as:

``` text
60% clean analytical content
20% pale blue / neutral environment
10% Liquid Glass navigation and controls
7% deep blue branding
3% lavender / purple accent
```

This is a visual guideline, not a strict pixel-level requirement.

The important idea is that glass and purple remain accents.

The content remains dominant.

------------------------------------------------------------------------

# 80. Anti-Pattern: Everything Is Glass

Do not build:

``` text
glass navbar
glass sidebar
glass KPI
glass chart
glass table
glass filter
glass button
glass modal
glass drawer
```

That is not Liquid Glass design.

That is a glassmorphism template.

Instead:

``` text
Glass navigation
+
stable analytical content
+
occasional glass control
+
clear hierarchy
```

This distinction should be enforced during implementation.

------------------------------------------------------------------------

# 81. Anti-Pattern: Purple AI Dashboard

Do not create:

``` text
dark background
+
purple/blue neon gradient
+
glowing cards
+
sparkle icons
+
AI labels
```

This is explicitly outside the desired direction.

The product should remain light, calm, and operational.

------------------------------------------------------------------------

# 82. Anti-Pattern: Marketing Website Dashboard

Do not make the dashboard look like a SaaS landing page.

Avoid:

-   huge hero sections,
-   oversized marketing headlines,
-   testimonial sections,
-   decorative 3D graphics,
-   giant CTA blocks.

The dashboard is a working environment.

The user should reach data quickly.

------------------------------------------------------------------------

# 83. Dashboard Header

The dashboard header should be compact.

It can contain:

``` text
Page title
short contextual description
project / dataset context
```

Example:

``` text
Demand & Sales
Understand historical demand and sales behavior.

PT ABC Distribution · Sales 2026
```

Avoid large hero headers.

------------------------------------------------------------------------

# 84. Overview Header

Overview can have a slightly warmer introduction:

``` text
Good afternoon

Here's the current demand and inventory outlook
for PT ABC Distribution.
```

However, this should remain concise.

The product should not become a conversational AI assistant.

------------------------------------------------------------------------

# 85. Date and Time Language

Use clear dates.

Avoid ambiguous:

``` text
Last updated: recently
```

Prefer:

``` text
Last processed
17 Sep 2026, 13:42
```

Use local formatting consistently.

------------------------------------------------------------------------

# 86. Chart Tooltips

Tooltips should be clean and compact.

Example:

``` text
17 Sep 2026

Actual
2,840 units

Forecast
3,020 units
```

They can use a small stable surface or controlled translucent surface.

Avoid large glass popovers with excessive blur.

------------------------------------------------------------------------

# 87. Data Tables and Sticky Headers

For long tables, sticky headers are encouraged.

The header should gain enough visual separation from the scrolling
content.

A subtle material effect can be used, but it should not become a heavy
glass panel.

The header must remain readable when the user scrolls.

------------------------------------------------------------------------

# 88. Selected Row

Selected rows should use a subtle pale-blue background.

Example:

``` text
normal
white

hover
very light blue

selected
#CFE8F5 with strong text

critical
subtle semantic emphasis
```

Avoid bright purple selected rows.

------------------------------------------------------------------------

# 89. Search

Search should feel native and practical.

Use:

``` text
Search products...
```

rather than:

``` text
Ask AI...
```

unless the product actually provides natural-language search.

Do not turn every search field into an AI interaction.

------------------------------------------------------------------------

# 90. Filters vs Search

These are different concepts.

Search:

> Find this product.

Filter:

> Show only products matching this condition.

The UI should not merge them unnecessarily.

------------------------------------------------------------------------

# 91. Information Architecture Visual Signal

The user should always understand where they are.

For example:

``` text
Dashboard
/
Supply Chain Management
```

or an active tab indicator.

Navigation should remain persistent enough that users can move quickly
between analytical areas.

------------------------------------------------------------------------

# 92. Navigation Active State

The active tab should use:

-   stronger blue,
-   subtle pale-blue background,
-   or a controlled tint.

Do not use:

-   giant glowing underline,
-   neon border,
-   animated gradient.

The active state should be obvious but calm.

------------------------------------------------------------------------

# 93. Brand Identity

The brand should be strongly associated with:

``` text
Deep blue
+
fresh pale blue
+
soft purple
+
translucent material
+
analytical clarity
```

The visual identity should still work if the glass effect is disabled.

This is important.

A strong brand should not depend entirely on blur.

------------------------------------------------------------------------

# 94. Implementation Guidance for Tailwind

If the frontend uses Tailwind CSS, the palette should become semantic
design tokens rather than scattered arbitrary hex values.

Conceptually:

``` text
brand-deep
brand-blue
brand-pale
accent-lavender
accent-purple
surface-neutral
ink
```

Components should consume semantic tokens.

Avoid repeatedly writing arbitrary colors in JSX.

The same principle applies to spacing, radius, and shadows.

------------------------------------------------------------------------

# 95. Example Tailwind Token Direction

Conceptually:

``` js
colors: {
  brand: {
    deep: "#03436D",
    blue: "#288DCE",
    pale: "#CFE8F5",
  },
  accent: {
    lavender: "#DA9DFD",
    purple: "#C76CFC",
  },
  surface: {
    neutral: "#EEEEEE",
  },
  ink: "#000000",
}
```

The exact Tailwind configuration depends on the project's version and
architecture.

------------------------------------------------------------------------

# 96. Glass Utility Direction

A reusable glass utility should be preferred over manually rebuilding
glass effects.

Conceptually:

``` text
glass-navigation
glass-control
glass-overlay
```

Each should have controlled:

-   opacity,
-   blur,
-   border,
-   shadow,
-   highlight.

Do not create one universal `.glass` class and apply it to everything.

------------------------------------------------------------------------

# 97. Component Variants

Components should have meaningful variants.

Example:

``` text
Button
├── primary
├── secondary
└── ghost

Card
├── default
├── tinted
└── elevated

Status
├── neutral
├── healthy
├── warning
└── risk

Glass
├── navigation
├── control
└── overlay
```

This creates consistency without forcing every component to look
identical.

------------------------------------------------------------------------

# 98. Design Tokens

The system should eventually formalize:

``` text
Colors
Typography
Spacing
Radius
Shadow
Blur
Opacity
Motion
Z-index
```

The design should be tokenized rather than implemented as isolated
styling decisions.

------------------------------------------------------------------------

# 99. Z-Index and Layering

The visual hierarchy should have a predictable layer system.

Conceptually:

``` text
0   page background
10  content
20  sticky content
30  navigation glass
40  dropdowns / popovers
50  drawers
60  modal
70  critical overlays
```

Exact values can change.

The important point is that Liquid Glass navigation sits above the
content layer.

------------------------------------------------------------------------

# 100. Blur Performance

Glass effects can be expensive.

The implementation should avoid large numbers of simultaneous
backdrop-filter surfaces.

Especially avoid:

``` text
hundreds of glass table rows
```

or:

``` text
glass on every nested element
```

Use glass on a small number of meaningful surfaces.

This improves both visual quality and browser performance.

------------------------------------------------------------------------

# 101. Data Visualization Performance

Charts and tables can contain large datasets.

The visual design should not require expensive effects for every datum.

Avoid:

-   per-point blur,
-   per-row shadow,
-   animated gradients across thousands of values,
-   excessive SVG filters.

Use effects at the container level where possible.

------------------------------------------------------------------------

# 102. Interaction Performance

Interactions should feel immediate.

For filters:

``` text
click
→ state update
→ loading indicator if necessary
→ updated content
```

Do not create unnecessary animation between every filter state.

For navigation:

``` text
click
→ active state
→ content transition
```

The user should remain in control.

------------------------------------------------------------------------

# 103. Design QA Checklist

Before approving a page, inspect it at 100% zoom and ask:

1.  Can I immediately tell what page I am on?
2.  Can I find the main metric?
3.  Can I tell what is interactive?
4.  Can I read the table?
5.  Is the chart the visual priority rather than the glass?
6.  Is the navigation clearly separated from content?
7.  Is purple being used as an accent rather than the entire identity?
8.  Does the page look professional without the glass effect?
9.  Does the page still look good with reduced transparency?
10. Does the page look like an analytics product rather than an AI demo?
11. Are the numbers easier to see than the decoration?
12. Is there enough spacing to scan the content?
13. Are there any unnecessary gradients?
14. Are there any unnecessary glows?
15. Are any components using glass simply because they can?

If several answers are negative, simplify the page.

------------------------------------------------------------------------

# 104. Interview Before Final Visual Lock

This design direction is intentionally strong, but the final design
should be refined through stakeholder/user interviews.

Before locking the visual system, ask the product owner or target users
the following questions.

## Product context

1.  Who is the primary user of the dashboard?

    -   Supply-chain manager
    -   Demand planner
    -   Business owner
    -   Operations manager
    -   Data analyst
    -   Executive
    -   Other

2.  Who is the secondary user?

3.  How technically comfortable are the users with forecasting concepts
    such as WAPE, bias, ADI, and CV²?

4.  What is the most important decision the user makes after seeing the
    forecast?

5.  What is the most painful existing workflow this product is
    replacing?

------------------------------------------------------------------------

# 105. Interview: Overview

6.  If the user opens the dashboard for only 30 seconds, what three
    things must they understand?

7.  Which KPI matters most:

    -   demand,
    -   revenue,
    -   inventory,
    -   stockout risk,
    -   or another metric?

8.  Should Overview feel more executive or more operational?

9.  Should the Overview emphasize:

    -   future demand,
    -   current inventory,
    -   risk,
    -   or recommended action?

10. Which information should never require a click?

------------------------------------------------------------------------

# 106. Interview: Forecast

11. How much forecast detail does the typical user want?

12. Do users need to see the model name?

13. Do users need to see WAPE and bias?

14. Should forecast uncertainty be visible by default?

15. What forecast horizon matters most?

16. Do users typically analyze one SKU at a time or many SKUs
    simultaneously?

17. Is forecast comparison against actual demand the most important
    visualization?

------------------------------------------------------------------------

# 107. Interview: Supply Chain

18. What is the user's most important inventory question?

19. Do they think in:

-   units,
-   days of cover,
-   monetary value,
-   service level,
-   or another measure?

20. Which risk condition requires immediate attention?

21. What should happen when a user clicks a high-risk SKU?

22. Does the user need to see the reasoning behind recommended orders?

23. Are recommended orders directly actionable in the system, or are
    they recommendations that users manually execute elsewhere?

------------------------------------------------------------------------

# 108. Interview: Visual Preference

24. How much visual softness is appropriate for the target audience?

25. Does the audience prefer:

-   conservative enterprise,
-   modern enterprise,
-   premium modern,
-   or highly expressive?

26. Does the Liquid Glass effect feel appropriate for the
    company/product context?

27. Should the interface feel more:

-   Apple-like,
-   Bloomberg-like,
-   Linear-like,
-   Notion-like,
-   traditional enterprise,
-   or completely distinct?

These are reference points, not templates to copy.

28. Should the product feel more blue-dominant or blue-purple balanced?

29. Is the pastel direction acceptable for operational users?

30. Should the visual system have a dark mode in the MVP?

------------------------------------------------------------------------

# 109. Interview: Density

31. How many rows do users typically need to see at once in the Supply
    Chain table?

32. Do users prioritize scanning or detailed inspection?

33. Should the dashboard feel spacious or information-dense?

34. Are users likely to use a large external monitor?

35. Do users work with the dashboard for minutes at a time or several
    hours per day?

These answers affect spacing, font sizes, table density, and navigation
persistence.

------------------------------------------------------------------------

# 110. Interview: Existing Products

36. What dashboards do users currently use?

37. What do they like about those dashboards?

38. What do they hate?

39. Are there existing company colors or brand rules that must be
    preserved?

40. Are there existing terminology standards for:

-   inventory,
-   demand,
-   stockout,
-   forecast,
-   location,
-   product,
-   recommendation?

This is important because UX language should match the organization's
mental model.

------------------------------------------------------------------------

# 111. Interview: Trust

41. What would make users distrust the forecast?

42. Do users need to see data quality information before trusting the
    output?

43. How should uncertainty be communicated?

44. What explanation is necessary before a user accepts a reorder
    recommendation?

45. Should users be able to inspect historical forecast performance?

These answers should influence the hierarchy of the Forecast and Supply
Chain pages.

------------------------------------------------------------------------

# 112. Interview: Navigation

46. Does the three-tab structure feel natural: Overview, Demand &
    Sales, Supply Chain Management?

47. Is it clear that forecasting is the primary workflow inside Demand &
    Sales, rather than a separate navigation destination?

48. Which forecasting outputs should appear first for a planner or
    manager?

49. Which supporting sales or demand views are actually useful during
    forecast investigation?

50. Which page do users expect to open first?

The navigation structure should reflect the user's mental model rather
than adding tabs simply to make the navigation look balanced.

------------------------------------------------------------------------

# 113. Interview: Mobile

51. Will users actually use the dashboard on mobile?

52. If yes, which workflows matter on mobile?

53. Is mobile intended for monitoring only, while desktop is used for
    analysis?

54. Which tables or charts need to remain available on smaller screens?

These answers should determine whether mobile is a primary experience or
a responsive fallback.

------------------------------------------------------------------------

# 114. Interview Output

After the interview, record answers in this section:

``` text
Primary user:
-

Secondary user:
-

Primary decision:
-

Most important KPI:
-

Most important forecast view:
-

Most important supply-chain action:
-

Preferred density:
-

Preferred visual tone:
-

Liquid Glass intensity:
-

Dark mode:
-

Primary dashboard tabs:
-

Most important mobile workflow:
-

Existing product references:
-

Brand constraints:
-
```

The answers should be treated as product requirements and may override
assumptions made in this design document where appropriate.

------------------------------------------------------------------------

# 115. Final Visual North Star

The final interface should pass this mental test:

Imagine the user has never heard the phrase "AI forecasting platform."

They open the application.

They should see:

``` text
A calm, fresh analytical workspace.
```

They should immediately understand:

``` text
where they are,
what the current situation is,
what demand is expected to do,
what inventory is at risk,
and where to investigate next.
```

They should notice the blue and pastel-purple identity.

They should notice subtle translucent navigation.

They should feel that the application is polished.

But they should NOT feel:

``` text
"Wow, this is an AI interface."
```

Instead:

``` text
"This is a serious forecasting and supply-chain tool."
```

That is the target.

------------------------------------------------------------------------

# 116. Final Design Principles

The entire frontend should follow these principles:

### 1. Content before decoration

The data is the product.

### 2. Glass is a material, not a component style

Use it for functional layers, not everything.

### 3. Professional before trendy

The interface should remain credible even when visual trends change.

### 4. Fresh, not childish

Pastels provide freshness. Typography and structure provide maturity.

### 5. Blue is the foundation

`#03436D` and `#288DCE` establish the product identity.

### 6. Purple is an accent

`#DA9DFD` and `#C76CFC` provide contrast and freshness without taking
over.

### 7. Numbers deserve hierarchy

Forecasts, inventory, risk, and demand values should be easy to scan.

### 8. Navigation floats, content remains stable

This is the core Liquid Glass relationship.

### 9. Avoid AI visual clichés

No sparkles, neon brains, magic gradients, or futuristic dashboards.

### 10. Explain recommendations

Users should understand why an operational recommendation exists.

### 11. Use consistent semantics

The same concept should look and behave the same across the product.

### 12. Design for long sessions

The dashboard is a working environment, not a marketing page.

### 13. Accessibility is part of the visual system

Contrast, reduced motion, reduced transparency, keyboard navigation, and
non-color status indicators are required.

### 14. Keep the hierarchy obvious

Users should always know:

``` text
Where am I?
What am I looking at?
What matters?
What can I interact with?
What should I do next?
```

### 15. Let the intelligence live in the product

Do not visually advertise AI.

Make the analytical workflow itself feel intelligent.

------------------------------------------------------------------------

# 117. One-Sentence Design Specification

If a future frontend model needs a short instruction before reading the
rest of this document, use:

> **Build a professional, light, fresh enterprise forecasting dashboard
> using restrained Liquid Glass for navigation and functional controls,
> a blue-first pastel palette with soft lavender accents, clean
> analytical typography, strong data hierarchy, and subtle depth, while
> deliberately avoiding the visual clichés of AI products, excessive
> glassmorphism, neon gradients, glow effects, and decorative futuristic
> elements.**

------------------------------------------------------------------------

# 118. Relationship to frontend_user_flow.md

This document should be used together with `frontend_user_flow.md`.

`frontend_user_flow.md` defines:

-   user journey,
-   onboarding,
-   dashboard information architecture,
-   page responsibilities,
-   navigation,
-   filters,
-   drill-down,
-   data states,
-   and frontend/backend responsibilities.

This document defines:

-   visual language,
-   palette,
-   material behavior,
-   typography,
-   component styling,
-   spacing,
-   motion,
-   accessibility,
-   and visual quality standards.

Therefore:

``` text
frontend_user_flow.md
        +
design.md
        ↓
complete frontend specification
```

The flow document determines **what the user does and where information
belongs**.

This document determines **how that experience should look and feel**.

Neither document should be interpreted in isolation.

------------------------------------------------------------------------

# 119. Final Instruction to Future Design/Coding Models

Before implementing any screen:

1.  Read `frontend_user_flow.md`.
2.  Read this `design.md`.
3.  Identify the user's task on that screen.
4.  Identify whether the component belongs to navigation, content, or
    transient interaction.
5.  Apply Liquid Glass only when it strengthens that layer distinction.
6.  Use the provided palette as a semantic system, not as random
    decoration.
7.  Keep charts and tables visually stable and readable.
8.  Avoid generic AI aesthetics.
9.  Do not invent visual components simply to make the page look more
    futuristic.
10. Prefer a simpler professional solution when two designs communicate
    the same information.
11. Validate contrast and readability.
12. Check the design at realistic enterprise dashboard density.
13. Test the interface without glass effects.
14. Test reduced motion and reduced transparency behavior.
15. Ask whether the screen still looks credible as a professional
    forecasting and supply-chain application.

The desired result is not the most visually spectacular interface.

The desired result is the interface that users can trust, understand,
and work with for hours.

That is the standard for this product.
