# Frontend UX User Flow Context

## Purpose of This Document

This document is the canonical UX/frontend-flow context for the
forecasting and supply-chain analytics dashboard.

It is intentionally focused on the **user experience, information
architecture, navigation logic, page responsibilities, interaction flow,
and frontend behavior** rather than the visual design system itself.

For colors, typography, spacing, component styling, visual language,
iconography, shadows, borders, responsive treatment, and other visual
decisions, **always refer to `design.md` as the source of truth**. This
document should not override `design.md`. If a visual decision is not
specified here, the implementation should defer to `design.md`.

The purpose of this document is to give a future coding model or
frontend engineer enough context to understand not merely what pages
exist, but **why they exist, how users move between them, what
information belongs on each page, what information should remain hidden
until requested, and how the frontend should reflect the state of the
underlying forecasting pipeline**.

The product is an enterprise-oriented demand forecasting and
supply-chain decision-support application. Its primary value is not
generic sales reporting. The central user outcome is:

> **Turn a company's historical operational data into understandable
> demand forecasts and actionable inventory decisions.**

The frontend therefore needs to guide a user from raw data, through data
validation and forecasting, into a dashboard where the user can inspect
forecast outputs and then investigate the operational implications of
those outputs.

The frontend should feel like a serious analytical application. It
should not feel like a notebook, a raw machine-learning demo, or a
collection of unrelated charts.

------------------------------------------------------------------------

# 1. Product UX Philosophy

The application should be understood as a decision-support system.

The user is not primarily visiting the application to admire the model
output. They are visiting because they need answers to operational
questions such as:

-   What is demand expected to look like?
-   How reliable is the forecast?
-   Which products are likely to have supply problems?
-   Which products have unusual or intermittent demand?
-   Where is inventory becoming insufficient relative to expected
    demand?
-   Which products or locations deserve attention first?
-   What is the underlying evidence behind a recommendation?
-   Can I move from a high-level signal into the detailed data that
    explains it?

This creates a hierarchy of information:

1.  **Overview / situation awareness**
2.  **Forecast and demand investigation**
3.  **Sales and demand analysis**
4.  **Supply-chain and inventory action**

The user should be able to start from a high-level summary and
progressively move toward more detailed evidence.

The frontend should avoid forcing users to understand the forecasting
methodology before they can use the product. Technical concepts such as
ADI, CV², WAPE, bias, model selection, and forecastability should be
available when relevant, but should not dominate the initial experience.

The user should primarily see:

-   what is happening,
-   what is expected to happen,
-   where attention is needed,
-   and why.

Technical details should support those decisions.

------------------------------------------------------------------------

# 2. High-Level User Journey

The complete user journey is divided into two broad phases:

**Phase A: Data onboarding and processing**

``` text
Main Cycle
    ↓
Project Choice
    ↓
Upload CSV / Dataset
    ↓
System Processes Data
    ↓
Data Quality / Mapping Validation
    ↓
User Feedback if Needed
    ↓
Dashboard Entry
```

**Phase B: Analytical dashboard usage**

``` text
Dashboard Entry
    ↓
Overview
    ├── Demand & Forecast Analysis
    ├── Sales / Demand Analysis
    └── Supply Chain Management
```

The important UX distinction is that **data onboarding is a workflow**,
while the **dashboard is an exploration environment**.

Once the user has successfully entered a valid processed dataset, they
should not feel trapped in a linear wizard. The dashboard should become
a persistent workspace where the user can move between sections freely.

The onboarding flow is sequential because each step depends on the
previous one.

The dashboard is navigational because users need to investigate
information in different directions.

------------------------------------------------------------------------

# 3. Main Cycle: Project Selection

The first frontend interaction begins from the application's main cycle.

The user should encounter a project-oriented entry point rather than
being immediately thrown into an empty analytics dashboard.

The conceptual flow is:

``` text
MAIN CYCLE
    ↓
PROJECT CHOICE
```

The Project Choice screen has two primary actions:

``` text
Project Choice
├── Select Existing Project
└── Add New Dashboard / Project
```

## 3.1 Select Existing Project

If the user has previously created or processed a project, they should
be able to select it.

A project represents a persistent analytical context. It can contain:

-   the dataset or datasets associated with the project,
-   the latest processed data,
-   schema mappings,
-   data-health information,
-   forecast outputs,
-   inventory-related outputs,
-   recommendations,
-   and the dashboard state derived from those results.

The user should not need to upload the same data again every time they
open the application.

The frontend should treat the selected project as the active context for
the rest of the session.

For example:

``` text
Project: PT ABC Distribution
Dataset: sales_2026.csv
Last processed: 17 Sep 2026
Forecast horizon: 30 days
Status: Ready
```

The exact visual presentation belongs to `design.md`.

## 3.2 Add New Dashboard / Project

The second action allows the user to start a new analytical project.

The UX should make it clear that creating a new dashboard means starting
a new data-analysis context.

The user should then proceed to:

``` text
Add New Project
    ↓
Upload Dataset
```

The frontend should not require the user to understand backend
architecture, model selection, or forecasting algorithms at this stage.

The user simply provides the data.

------------------------------------------------------------------------

# 4. Dataset Upload

The next step in the onboarding workflow is:

``` text
PROJECT CHOICE
    ↓
USER UPLOADS CSV / DATASET
```

The initial target is CSV-based ingestion, while the architecture may
later support API or enterprise connectors.

The frontend should be designed so that CSV upload is the first-class
MVP path without making the overall information architecture
incompatible with future input methods.

## 4.1 Upload Responsibilities

The upload screen should communicate:

-   what kind of data is expected,
-   what file was selected,
-   whether the file is currently being uploaded,
-   whether the upload succeeded,
-   and what happens next.

The user should not be expected to manually clean every issue before the
system has inspected the dataset.

After upload:

``` text
Upload
    ↓
System Processing
```

## 4.2 Upload States

The frontend should explicitly handle the following states:

``` text
Idle
    ↓
File Selected
    ↓
Uploading
    ↓
Upload Complete
    ↓
Processing
    ↓
Validation
    ↓
Ready
```

Failure states must also be represented:

``` text
Upload Failed
Processing Failed
Invalid File
Unsupported Schema
Insufficient Data
```

A failure should explain what the user can do next.

Avoid generic messages such as:

> Something went wrong.

Prefer actionable messages such as:

> The dataset was uploaded, but no date-like column could be detected.
> Please review the detected columns or upload a dataset containing a
> transaction date.

The exact copy can be refined during implementation, but the UX
principle is that errors should lead to a recovery path.

------------------------------------------------------------------------

# 5. System Processing and Validation

After the upload, the system processes the data.

Conceptually:

``` text
USER UPLOADS DATA
        ↓
SYSTEM PROCESSES DATA
        ↓
IS USER DATA READY?
```

This processing stage is important because the application is not simply
displaying the uploaded CSV.

The backend may perform:

-   schema profiling,
-   datatype detection,
-   semantic column mapping,
-   canonical schema conversion,
-   missing-value analysis,
-   duplicate detection,
-   anomaly detection,
-   forecastability checks,
-   demand classification,
-   and forecasting preparation.

The frontend needs to expose the result of this processing in a way that
users can understand.

The frontend should not attempt to reproduce backend calculations. It
should represent their state and outputs.

------------------------------------------------------------------------

# 6. Data Validation Decision Point

The user-flow sketch contains a decision point:

``` text
System Processes Data
        ↓
Is User Data Okay With It?
       / \
     NO   YES
     ↓     ↓
Feedback  Dashboard Entry
```

This is one of the most important UX behaviors in the entire
application.

The system may automatically infer mappings or identify potential
problems, but the user must have an opportunity to correct or confirm
important assumptions.

The frontend therefore needs a clear distinction between:

``` text
System is confident
```

and

``` text
System needs user confirmation
```

The system should not silently proceed when an important semantic
interpretation is ambiguous.

------------------------------------------------------------------------

# 7. User Feedback / Correction Loop

When the system detects a problem or uncertainty:

``` text
IS USER DATA OK?
    ↓ NO
USER GIVES FEEDBACK
    ↓
DATA / MAPPING REVIEW
    ↓
PROCESSING AGAIN
```

The user's feedback loop is not necessarily a completely separate page.
It can be represented through a review interface, mapping interface,
validation panel, or guided correction flow.

The critical concept is:

> **The user can intervene when automated data understanding is
> uncertain.**

Examples of issues that may require intervention:

-   ambiguous date column,
-   ambiguous demand/quantity column,
-   missing location information,
-   unexpected categorical fields,
-   insufficient historical observations,
-   high missing-value ratio,
-   duplicate records,
-   invalid timestamps,
-   inconsistent product identifiers.

The UI should show the system's interpretation and let the user correct
it.

For example:

``` text
Detected column       System interpretation
------------------------------------------------
tgl_order             Date / Timestamp
kode_brg              Product ID
qty_out               Demand Quantity
cabang                Location
disc                   Promotion
```

If the system is uncertain:

``` text
qty_out
Potential meaning:
[ Demand Quantity ▼ ]

Confidence: Medium

Why?
Column contains numeric values and appears correlated
with transaction-level movement.

[Confirm] [Change Mapping]
```

The exact interaction design should follow `design.md`.

------------------------------------------------------------------------

# 8. Dashboard Entry

Once the data has passed validation:

``` text
IS USER DATA OK?
    ↓ YES
DASHBOARD ENTRY
```

This marks the transition from onboarding to analytics.

The dashboard should load using the selected project and the processed
dataset as its context.

The user should not have to repeat configuration work.

At this point, the application should have access to processed outputs
such as:

-   data health,
-   demand classifications,
-   historical demand,
-   forecasted demand,
-   forecast metrics,
-   inventory information where available,
-   stockout risk,
-   and recommendation data.

The dashboard is where the main product value becomes visible.

------------------------------------------------------------------------

# 9. Dashboard Information Architecture

The dashboard is designed as a multi-tab analytical workspace.

The current UX concept contains the following major destinations:

``` text
Dashboard
├── Overview
├── Demand & Sales
└── Supply Chain Management
```

Forecasting is not a separate top-level tab in the current hackathon
architecture. It is the primary analytical workflow inside **Demand &
Sales**.

The three top-level destinations are therefore:

```text
Overview
Demand & Sales (forecasting-focused)
Supply Chain Management
```

The Demand & Sales page should provide the detailed forecasting
workspace, while Overview summarizes the most important forecast
outputs and Supply Chain Management exposes the downstream operational
implications.

The key principle is that **Overview is not supposed to contain every
feature**.

Overview is a summary and orientation page.

The detailed tabs are where users investigate information.

------------------------------------------------------------------------

# 10. Overview Page

The Overview is the first page users see after entering the dashboard.

Its purpose is:

> **Give the user immediate situational awareness without requiring them
> to inspect every chart or table.**

The Overview should answer:

-   What is the current forecast situation?
-   What is the expected demand?
-   What is the current inventory situation?
-   Is there a stockout concern?
-   What should I pay attention to?
-   Where should I click if I want more detail?

It should not attempt to become a complete data-management page.

------------------------------------------------------------------------

# 11. Overview Page: Landing / Coverage

The sketch identifies a landing-page / overview concept.

The overview acts as a coverage layer over the detailed dashboard.

Conceptually:

``` text
Dashboard Entry
      ↓
Landing Page / Overview
      ↓
Can Access Other Tabs
```

The user can use the Overview as a starting point and then navigate into
detailed sections.

The Overview should therefore have strong navigational affordances
toward:

``` text
Demand & Sales
Supply Chain Management
Forecasting, if implemented as a fourth tab
```

The Overview should never make the user feel like every metric must be
understood before navigation is possible.

------------------------------------------------------------------------

# 12. Overview KPI Cards

The sketch contains a group of feature/KPI cards.

The current concepts are:

``` text
Demand Forecast
Revenue Forecast
Inventory Value
Stockout Risk
```

These cards are intended to provide a fast summary of the most important
outputs.

## 12.1 Demand Forecast Card

The Demand Forecast card represents the expected future demand.

Depending on the available output, it may communicate:

-   expected demand over the selected forecast horizon,
-   percentage change compared with historical demand,
-   aggregate forecast volume,
-   or another primary forecast indicator.

The metric should be clearly contextualized.

For example:

``` text
Demand Forecast
84,200 units
Next 30 days
```

The user should be able to understand the time horizon.

The card can act as a gateway into detailed forecasting analysis.

## 12.2 Revenue Forecast Card

Revenue Forecast is an overview-level business metric.

However, revenue forecasting should not become the central identity of
the product if the core system is fundamentally demand forecasting and
supply-chain decision support.

The card is useful because business users may care about the financial
implication of demand.

The underlying forecast should remain consistent with the canonical
forecasting outputs.

If revenue data is unavailable, the UI should not fabricate it.

Possible state:

``` text
Revenue Forecast
Unavailable
Revenue data not included in dataset
```

The product should distinguish between:

``` text
zero
```

and:

``` text
not available
```

## 12.3 Inventory Value Card

Inventory Value summarizes the current inventory position when inventory
value information is available.

It should communicate the current inventory context without requiring
the user to open the Supply Chain Management tab.

Possible information:

``` text
Inventory Value
Rp 2.4B
Current stock
```

The detailed inventory table remains elsewhere.

## 12.4 Stockout Risk Card

Stockout Risk is one of the most operationally important overview
indicators.

It should summarize the number or proportion of products/series
currently identified as being at risk.

For example:

``` text
Stockout Risk
12 SKUs
High-risk items
```

This card should provide a direct path into the supply-chain detail.

The user should be able to move from:

``` text
12 SKUs at risk
```

to:

``` text
Which SKUs?
Which locations?
How soon?
Why?
What action is recommended?
```

The Overview card should therefore behave as an entry point, not a
dead-end metric.

------------------------------------------------------------------------

# 13. Overview Graph: Actual vs Forecasted Demand

The sketch contains a graph showing:

``` text
Actual vs Forecasted Demand
```

This is likely the most important visualization on the Overview.

The chart should allow users to visually compare:

``` text
Historical / Actual Demand
vs.
Forecasted Demand
```

The purpose is not only aesthetic.

The chart establishes trust by showing continuity between what happened
historically and what the model expects next.

Conceptually:

``` text
Past
───────────────────────|──────────────────────────
                      NOW
                         \
                          \ Forecast
                           \
                            \________
```

The actual portion should represent historical observations.

The forecast portion should represent future estimates.

If prediction intervals are available, they can be represented visually,
but the chart should not become unnecessarily complicated.

The user should be able to distinguish:

-   actual,
-   forecast,
-   and optionally uncertainty bounds.

The chart should also respond to relevant dashboard filters where
appropriate.

------------------------------------------------------------------------

# 14. Overview Visualization: Inventory Stock

The sketch includes an inventory-stock visualization.

Its purpose is to communicate the current inventory position at a
glance.

This should remain high-level on the Overview.

The user should not need to inspect every SKU.

Possible representations include:

-   total inventory,
-   inventory by risk state,
-   inventory coverage,
-   or a compact trend.

The detailed table belongs in Supply Chain Management.

The Overview should answer:

> Is inventory generally healthy relative to expected demand?

The Supply Chain tab should answer:

> Which individual products and locations require attention?

------------------------------------------------------------------------

# 15. Overview: Priority / Recommended Actions

The sketch explicitly includes:

``` text
Priority
Recommended Action
```

This is an important bridge between prediction and action.

A forecasting system becomes much more useful when it tells the user
where to focus attention.

The Overview can contain a small prioritized list such as:

``` text
Priority Actions

1. SKU ABC123
   High stockout risk
   Recommended order: 5,000 units

2. SKU XYZ442
   Demand spike expected
   Review inventory allocation

3. SKU DEF902
   Intermittent demand
   Review forecast confidence
```

The Overview should not show a huge table.

Its purpose is to surface the most relevant exceptions.

A detailed list belongs in the Supply Chain Management or Forecasting
workspace.

------------------------------------------------------------------------

# 16. Overview Navigation Principle

The Overview should behave as a launchpad.

Every important summary signal should have a natural deeper destination.

For example:

``` text
Demand Forecast KPI
    ↓
Forecast / Demand detail

Stockout Risk KPI
    ↓
Supply Chain Management

Actual vs Forecast chart
    ↓
Forecast / Demand detail

Priority Action
    ↓
Specific product / supply-chain detail
```

This creates a consistent drill-down pattern:

``` text
SUMMARY
  ↓
DETAIL
  ↓
EVIDENCE
  ↓
ACTION
```

This is preferable to placing all available information on the Overview.

------------------------------------------------------------------------

# 17. Demand & Sales Tab

The handwritten flow identifies a detailed tab for demand and sales
analysis.

The exact tab label can be finalized in implementation, but conceptually
it represents:

> **Detailed historical demand, forecast comparison, sales performance,
> and demand-pattern analysis.**

This page should be significantly more detailed than the Overview.

The user comes here when they want to investigate the demand itself.

Questions answered here include:

-   How did demand behave historically?
-   How does actual demand compare with forecast?
-   Which products generate the most sales?
-   Which locations generate the most sales?
-   What type of demand pattern does each product have?
-   Is demand smooth, erratic, intermittent, or lumpy?
-   Are there differences between locations?

------------------------------------------------------------------------

# 18. Demand & Sales Filters

The sketch identifies the following filters:

``` text
Date Range
Product ID
Locations
Compare With
```

These filters are important because the Demand & Sales page is an
exploration surface.

## 18.1 Date Range

The user should be able to define the historical/analysis period.

The date range may affect:

-   actual demand,
-   sales,
-   forecast comparison,
-   aggregation,
-   and visualizations.

The UI should clearly distinguish between:

``` text
Historical analysis range
```

and:

``` text
Forecast horizon
```

They are conceptually different.

## 18.2 Product ID

The Product ID filter allows the user to narrow analysis to specific
products/SKUs.

This is essential for enterprise datasets containing many series.

The filter should support searching rather than forcing users to scroll
through hundreds or thousands of products.

## 18.3 Locations

The location filter allows the user to investigate demand geographically
or operationally.

It may represent:

-   branch,
-   warehouse,
-   store,
-   region,
-   distribution center,
-   or another location identifier.

The exact naming should follow the canonical dataset.

## 18.4 Compare With

The sketch includes a comparison control.

This can allow the user to compare:

-   actual vs forecast,
-   product vs product,
-   location vs location,
-   or another relevant dimension.

The implementation should keep comparison semantics explicit.

Do not use a generic "Compare" button that changes meaning
unpredictably.

------------------------------------------------------------------------

# 19. Demand & Sales Main Graph

The primary graph on the Demand & Sales page is:

``` text
Actual vs Forecasted Demand vs Sales
```

This is more detailed than the Overview graph.

The purpose is to let the user inspect the relationship between model
output and observed business activity.

The graph may contain:

``` text
Actual Demand
Forecasted Demand
Sales
```

The exact relationship between "demand" and "sales" must respect the
underlying dataset.

If sales are being used as the demand proxy, the UI should not imply
that they are independent signals.

If both exist as separate measures, the distinction should be clear.

The graph should support the active filters.

For example:

``` text
Product: ABC123
Location: Jakarta
Date: Jan 2026 - Sep 2026
```

should result in the chart reflecting exactly that context.

------------------------------------------------------------------------

# 20. Sales Visualization: Sales by Product

The Demand & Sales page includes:

``` text
Sales by Product
```

This is intended to provide a cross-sectional view.

The user should be able to identify:

-   high-volume products,
-   low-volume products,
-   products with unusual behavior,
-   and potentially products contributing significantly to total sales.

This visualization should support the current filter context.

It should not contradict the primary demand chart.

If the user selects a location, the product sales visualization should
update to that location unless the design explicitly indicates
otherwise.

------------------------------------------------------------------------

# 21. Sales Visualization: Sales by Location

The page also includes:

``` text
Sales by Location
```

This provides the geographic/operational counterpart to Sales by
Product.

The user should be able to understand:

-   which locations generate the most demand/sales,
-   how demand is distributed,
-   and whether certain locations behave differently.

This visualization is particularly useful because supply-chain problems
can be location-specific.

A product may have healthy aggregate inventory while being at risk in a
particular branch or warehouse.

The frontend should therefore preserve the SKU-location relationship
wherever the backend supports it.

------------------------------------------------------------------------

# 22. Demand Pattern Analysis

The sketch includes:

``` text
Demand Pattern
Product demand breakdown using ADI & CV²
```

This is an analytical feature rather than a simple KPI.

The system classifies demand patterns using:

-   ADI, Average Demand Interval
-   CV², squared coefficient of variation

The resulting demand classes can conceptually include:

``` text
Smooth
Erratic
Intermittent
Lumpy
```

The frontend should expose this classification in a way that is useful
to the user.

The user does not necessarily need to understand the mathematical
formula immediately.

A useful presentation might show:

``` text
Demand Pattern
Smooth        48%
Erratic       27%
Intermittent  18%
Lumpy          7%
```

Then allow the user to inspect individual products.

------------------------------------------------------------------------

# 23. ADI and CV² UX

ADI and CV² are useful because they explain why different forecasting
methods may be appropriate for different series.

The frontend should therefore treat demand classification as an
explanatory layer.

It can answer:

> Why does this SKU behave differently from another SKU?

The UI should avoid presenting ADI and CV² as arbitrary technical
scores.

Instead:

``` text
Demand Type
Intermittent

ADI
4.8 periods

CV²
1.7
```

could be accompanied by a short explanation.

The technical calculation remains backend responsibility.

The frontend displays the result and context.

------------------------------------------------------------------------

# 24. Forecasting Within Demand & Sales

Forecasting is a core workflow inside the Demand & Sales tab. It is not
a separate top-level navigation destination in the current hackathon
architecture.

The Demand & Sales tab should prioritize:

```text
Filters
    ↓
Demand history and patterns
    ↓
Actual vs Forecasted Demand
    ↓
Forecast summary and uncertainty
    ↓
Forecast accuracy / diagnostics
    ↓
Forecast detail table
```

Sales views provide supporting context and can be expanded later. The
forecast remains the primary analytical output.

# 25. Forecast Detail Philosophy

The forecasting experience should make the model output understandable.

A user should be able to answer:

``` text
What is the forecast?
For which SKU?
At which location?
For what horizon?
How reliable is it?
Which model produced it?
How did it perform historically?
```

The frontend should not expose every internal model detail by default.

For example, a user does not necessarily need to see the entire
model-routing implementation.

But they should be able to see enough information to establish trust.

Potential forecast metadata:

``` text
SKU
Location
Forecast Horizon
Selected Model
WAPE
Bias
Demand Type
Forecastability Status
```

------------------------------------------------------------------------

# 26. Forecast Chart

The detailed forecast chart should support:

``` text
Historical actuals
+
Forecast
+
Optional uncertainty interval
```

The chart should clearly mark the transition between historical and
future periods.

For example:

``` text
Historical
<---------------------->

                         Forecast
                         <-------->

                         NOW
                          |
                          |
```

If confidence intervals are available:

``` text
Forecast
     /\ 
    /  \   upper bound
---/----\----------------
  /      \
 /        \ forecast
```

The exact chart styling is governed by `design.md`.

------------------------------------------------------------------------

# 27. Forecast Table

Charts are useful for pattern recognition, but users often need exact
values.

A detailed forecast table can contain:

``` text
Date
SKU
Location
Forecast
Lower Bound
Upper Bound
Model
```

Depending on the scope, it may also contain:

``` text
Actual
Forecast Error
```

The table should support sorting and filtering.

For very large datasets, the frontend should avoid rendering thousands
of rows at once if that causes performance problems.

Pagination, virtualization, or server-side filtering may be used as
appropriate.

------------------------------------------------------------------------

# 28. Model Transparency

The forecasting engine may use an adaptive model router.

The conceptual backend flow is:

``` text
Demand Classification
        ↓
Candidate Models
        ↓
Forecasting
        ↓
Historical Backtest
        ↓
Validated Forecast
```

Potential model families include:

``` text
TimesFM
Croston
TSB
Seasonal Naive
```

The frontend should not imply that an AI agent arbitrarily decides which
model is "best."

The product architecture distinguishes:

-   semantic AI reasoning for ambiguous schema mapping,
-   deterministic diagnostics for demand characterization,
-   statistical/forecasting models for prediction,
-   historical backtesting for model validation.

The UI should reflect that separation.

A suitable user-facing explanation is:

> The forecasting method is selected based on demand characteristics and
> historical validation performance.

The exact wording may be refined later.

------------------------------------------------------------------------

# 29. Supply Chain Management Tab

The Supply Chain Management tab is a detailed operational workspace.

It is not an Overview page.

This distinction is important.

The user enters this tab because they want to inspect operational
details, not because they need another set of summary cards.

The handwritten sketch specifically shows:

``` text
Supply Chain Management
        ↓
Inventory vs Demand Table
        ↓
Status Classification
```

Therefore the primary information architecture should be table-first and
action-oriented.

------------------------------------------------------------------------

# 30. Supply Chain Management Purpose

The page should answer:

-   Which products have insufficient inventory?
-   Which products have enough stock?
-   Which products are approaching stockout?
-   How does inventory compare with expected demand?
-   Which locations are at risk?
-   What should be ordered?
-   Why does the system recommend that action?

This page is where the forecasting output becomes operationally useful.

------------------------------------------------------------------------

# 31. Inventory vs Demand Table

The main component should be a detailed table.

Conceptually:

``` text
Inventory vs Demand

SKU | Location | Current Stock | Forecast Demand | Coverage | Risk | Action
```

The exact columns should be determined by available backend data.

Possible fields include:

``` text
Product ID
Product Name
Location
Current Inventory
Forecast Demand
Lead-Time Demand
Safety Stock
Projected Stock
Days Until Stockout
Stockout Risk
Recommended Order
Status
```

The table should be designed for scanning.

The user should be able to quickly find exceptions.

------------------------------------------------------------------------

# 32. Status Classification

The sketch explicitly says:

``` text
Inventory vs Demand Table
        →
Status Classification
```

The status should be derived from backend business logic rather than
arbitrary frontend thresholds.

Possible conceptual states include:

``` text
Healthy
Watch
At Risk
Stockout Risk
```

The exact classification rules must come from the inventory engine.

The frontend should display the classification consistently.

Do not allow different pages to independently calculate risk using
different formulas.

The frontend consumes the canonical status returned by the backend.

------------------------------------------------------------------------

# 33. Stockout Risk

Stockout risk is not just a decorative status.

It should be explainable.

When the user opens a high-risk item, the frontend should provide enough
context to understand the signal.

For example:

``` text
Stockout Risk: High

Current stock
1,700 units

Expected demand during lead time
4,200 units

Safety stock
800 units

Days until projected stockout
8 days

Recommended order
3,500 units
```

The exact values are examples of the decision-engine concept, not fixed
product data.

The user should be able to understand:

``` text
Why is this item risky?
```

without needing to inspect backend code.

------------------------------------------------------------------------

# 34. Reorder Recommendation

The supply-chain experience should expose recommendations as decision
support, not commands.

A recommendation can conceptually be based on:

``` text
Forecast demand over lead time
+
Safety buffer
-
Current usable inventory
=
Raw reorder requirement
```

Then the system may apply:

``` text
MOQ / order constraints
```

The frontend should present the result and its reasoning.

For example:

``` text
Recommended Order
3,500 units

Why?

Demand during lead time     4,200
Safety buffer                 800
Current stock              -1,700
MOQ adjustment                200
```

The user should be able to inspect this breakdown.

This prevents the recommendation from feeling like a black box.

------------------------------------------------------------------------

# 35. Supply Chain Table Interaction

Because this is a detailed page, table interaction matters.

The user should be able to:

-   sort by risk,
-   sort by days until stockout,
-   filter by product,
-   filter by location,
-   filter by status,
-   search SKU,
-   inspect recommendation,
-   and open a detailed record.

The page should prioritize exception handling.

For example, sorting by:

``` text
Stockout Risk
```

should surface high-risk items first.

Sorting by:

``` text
Days Until Stockout
```

should surface the most time-sensitive cases.

The table should not require the user to open each row individually just
to understand the basic status.

------------------------------------------------------------------------

# 36. Drill-Down Pattern

The overall frontend should use a consistent drill-down pattern.

Example:

``` text
Overview
  ↓
Stockout Risk: 12 SKUs
  ↓
Supply Chain Management
  ↓
High Risk filter
  ↓
SKU ABC123
  ↓
Detailed inventory / forecast context
```

Another example:

``` text
Overview
  ↓
Demand Forecast
  ↓
Forecast detail
  ↓
SKU ABC123 / JKT01
  ↓
Historical vs forecast chart
  ↓
Demand pattern
```

This is the core interaction philosophy.

Users should never lose the context that caused them to drill down.

------------------------------------------------------------------------

# 37. Shared Global Context

The dashboard should maintain a consistent global analytical context.

Depending on implementation, this can include:

``` text
Active Project
Active Dataset
Selected Date Range
Selected Product
Selected Location
```

However, not every filter should be globally shared.

A filter should be global only when it logically applies across multiple
tabs.

For example:

``` text
Active Project
```

should definitely be global.

A detailed Supply Chain table filter may be local to that page.

The implementation should avoid unexpected behavior where changing a
filter on one page silently changes unrelated analytical views.

------------------------------------------------------------------------

# 38. Data State and Loading Behavior

Because forecasting can take time, the frontend must understand
asynchronous processing.

The backend architecture can expose a job state such as:

``` text
queued
processing
forecasting
completed
failed
```

with progress information where available.

The frontend should represent these states explicitly.

Example:

``` text
Forecast generation
██████████████████░░ 72%

Analyzing demand patterns...
```

The frontend may poll job status if the backend uses a background task
model.

Conceptually:

``` text
POST /forecast
      ↓
job_id
      ↓
GET /jobs/{job_id}
      ↓
status + progress
```

Once complete:

``` text
status: completed
```

the frontend can navigate or refresh the relevant dashboard state.

------------------------------------------------------------------------

# 39. Avoid Recomputing Forecasts on Dashboard Refresh

The frontend should treat forecast results as persisted analytical
outputs.

A dashboard refresh should not automatically trigger an expensive
forecasting computation.

Instead:

``` text
Processing Job
    ↓
Stored Forecast Result
    ↓
Dashboard reads result
```

This is important for both UX and architecture.

The user should be able to move between tabs without triggering model
execution.

A tab transition should generally be a data retrieval operation, not a
forecasting operation.

------------------------------------------------------------------------

# 40. Backend/Frontend Boundary

The frontend is responsible for:

-   navigation,
-   rendering,
-   user interaction,
-   filter state,
-   loading states,
-   error states,
-   displaying backend outputs,
-   user confirmation of ambiguous mappings,
-   and presenting explanations.

The backend is responsible for:

-   data ingestion,
-   profiling,
-   semantic mapping,
-   validation,
-   demand classification,
-   forecasting,
-   backtesting,
-   inventory decision logic,
-   recommendation calculation,
-   and persistence.

The frontend should not independently recreate business logic.

For example, do not implement:

``` text
if stock < forecast * 0.5:
    risk = high
```

inside React.

Instead, receive:

``` json
{
  "stockout_risk": "high"
}
```

from the backend.

This keeps the frontend consistent with the canonical decision engine.

------------------------------------------------------------------------

# 41. Suggested Frontend Route Model

The frontend route architecture can conceptually follow:

``` text
/
    Project Choice

/projects/new
    Upload / New Project

/projects/[projectId]/processing
    Processing State

/projects/[projectId]/review
    Mapping / Data Validation

/projects/[projectId]/dashboard
    Overview

/projects/[projectId]/dashboard/demand
    Demand & Sales

/projects/[projectId]/dashboard/forecast
    Forecast Detail, if fourth tab exists

/projects/[projectId]/dashboard/supply-chain
    Supply Chain Management
```

These are conceptual route responsibilities.

The final routing structure may differ depending on implementation, but
the UX responsibilities should remain.

------------------------------------------------------------------------

# 42. Dashboard Shell

Once the user reaches the dashboard, the application should have a
persistent dashboard shell.

The shell should provide:

``` text
Project context
Navigation tabs
Main content
```

Potentially:

``` text
┌─────────────────────────────────────────────┐
│ Project / Dataset Context                   │
├─────────────────────────────────────────────┤
│ Overview | Demand & Sales | Forecast | SCM │
├─────────────────────────────────────────────┤
│                                             │
│              Page Content                   │
│                                             │
└─────────────────────────────────────────────┘
```

The exact layout and styling belong to `design.md`.

The important UX requirement is persistence.

The user should not feel like they are entering a new application every
time they switch tabs.

------------------------------------------------------------------------

# 43. Tab Responsibilities Must Stay Distinct

A major implementation risk is allowing all tabs to become similar.

The intended separation is:

``` text
Overview
    = What is happening?

Demand & Sales
    = What happened and how does demand behave?

Forecast
    = What is expected to happen?

Supply Chain Management
    = What does that mean operationally and what needs attention?
```

This distinction should guide component placement.

For example:

A large SKU inventory table does not belong on Overview.

A high-level stockout KPI does belong on Overview.

A detailed ADI/CV² breakdown belongs in Demand & Sales or Forecast
detail.

A detailed reorder recommendation belongs in Supply Chain Management.

------------------------------------------------------------------------

# 44. Information Density by Page

The pages should intentionally have different information densities.

Overview:

``` text
Low-to-medium density
High signal
Fast scanning
Limited detailed tables
```

Demand & Sales:

``` text
Medium-to-high density
Interactive charts
Filters
Comparisons
Demand classification
```

Forecast:

``` text
Medium-to-high density
Forecast charts
Forecast tables
Model validation context
```

Supply Chain Management:

``` text
High density
Operational tables
Filters
Risk statuses
Recommendations
```

This is an important UX principle.

Do not force the same card-based layout onto every page.

The detailed SCM page should feel like an operational workspace, not
another landing page.

------------------------------------------------------------------------

# 45. Responsive and Interaction Considerations

The primary target is likely desktop because this is an enterprise
analytics dashboard.

The frontend should nevertheless avoid assumptions that break at
narrower widths.

The information hierarchy should survive responsive layouts.

For desktop:

``` text
Navigation
    +
Multiple analytical panels
    +
Large tables / charts
```

For smaller screens:

``` text
Navigation collapses
Panels stack
Tables become horizontally scrollable or selectively condensed
```

The exact responsive design belongs to `design.md`.

Do not create separate product logic for mobile.

------------------------------------------------------------------------

# 46. Empty States

Every major page should have an explicit empty state.

Examples:

Overview:

``` text
No processed dataset
Create or select a project to begin.
```

Demand & Sales:

``` text
No demand data available for the selected filters.
```

Forecast:

``` text
Forecast not generated yet.
Run forecasting to view future demand.
```

Supply Chain Management:

``` text
Inventory data is not available in this dataset.
Forecasts are available, but inventory recommendations cannot be calculated.
```

Empty states should explain why something is unavailable and what
action, if any, can resolve it.

------------------------------------------------------------------------

# 47. Partial Data Support

Not every uploaded company dataset will necessarily contain every field.

The frontend should be capable of showing partial capability.

For example, if a dataset contains:

``` text
date
product_id
quantity
location
```

but does not contain:

``` text
price
inventory
```

then:

-   demand forecasting can still work,
-   revenue forecast may be unavailable,
-   inventory value may be unavailable,
-   reorder recommendation may be unavailable.

The frontend should not crash or display misleading zeros.

Instead, it should communicate capability based on available data.

------------------------------------------------------------------------

# 48. Error Handling Philosophy

Errors should be classified by where they occur.

Upload error:

``` text
The file could not be uploaded.
```

Data validation error:

``` text
The dataset does not contain enough usable historical data.
```

Mapping error:

``` text
The system could not confidently identify the demand column.
```

Forecasting error:

``` text
Forecast generation failed.
```

Dashboard retrieval error:

``` text
Forecast results could not be loaded.
```

The user should be given the appropriate next action whenever possible.

Avoid hiding errors in console logs only.

------------------------------------------------------------------------

# 49. User Trust and Explainability

The application should make analytical outputs explainable without
overwhelming the user.

There are three important explainability layers.

Layer 1: Data understanding

``` text
What did the system think these columns mean?
```

Layer 2: Forecasting

``` text
What was forecasted?
Which method was used?
How did it validate?
```

Layer 3: Inventory decision

``` text
Why is this item at risk?
Why is this order recommended?
```

The user should be able to progressively inspect each layer.

------------------------------------------------------------------------

# 50. Technical Concepts Should Be Progressive Disclosure

The frontend should not show:

``` text
ADI
CV²
WAPE
Bias
Model router
Backtest folds
```

everywhere.

Instead:

Overview:

``` text
Demand Forecast
Stockout Risk
Recommended Actions
```

Detailed analysis:

``` text
Demand Pattern
ADI
CV²
```

Forecast detail:

``` text
Model
WAPE
Bias
Forecast interval
```

Supply chain:

``` text
Lead-time demand
Safety stock
Current inventory
MOQ adjustment
Recommended order
```

This makes the application approachable for business users while
retaining technical depth for users who need it.

------------------------------------------------------------------------

# 51. Navigation from Recommendations

Recommendations are one of the strongest navigation mechanisms.

Example:

``` text
Overview
    ↓
"12 SKUs at stockout risk"
    ↓
Supply Chain Management
    ↓
Risk = High
    ↓
SKU ABC123
    ↓
Recommendation detail
```

The frontend should preserve the selected SKU and relevant context.

If the user navigates back, they should ideally return to the filtered
state they came from rather than losing their context.

------------------------------------------------------------------------

# 52. Navigation from Demand Signals

The same principle applies to demand anomalies.

Example:

``` text
Demand & Sales
    ↓
Erratic Demand
    ↓
Product ABC123
    ↓
Forecast detail
```

This lets the user move from classification to forecast evidence.

The frontend should make these relationships discoverable.

------------------------------------------------------------------------

# 53. Filters Must Be Predictable

Filters are critical to the detailed pages.

A filter change should:

1.  update the visible analytical state,
2.  update charts and tables that depend on the filter,
3.  preserve unrelated page state,
4.  clearly communicate the active filter,
5.  avoid triggering expensive forecasting computation unless explicitly
    required.

For example:

``` text
Product = ABC123
Location = Jakarta
```

should update the analytical views that depend on those dimensions.

It should not automatically regenerate the entire forecasting model
unless the user requests a new forecast configuration.

------------------------------------------------------------------------

# 54. Date Semantics

Date handling is especially important in a forecasting product.

The frontend should distinguish:

``` text
Historical Period
```

from:

``` text
Forecast Horizon
```

Example:

``` text
Historical:
Jan 2025 - Sep 2026

Forecast:
Oct 2026 - Oct 2026 + 30 days
```

Avoid ambiguous labels such as:

``` text
Date: Last 30 days
```

when the chart includes both historical and future periods.

The user must understand what portion of the chart is observed and what
portion is predicted.

------------------------------------------------------------------------

# 55. Dataset and Project Context

The active project should remain visible enough that users know which
dataset they are analyzing.

This matters because enterprise datasets can represent different:

-   companies,
-   branches,
-   time periods,
-   business units,
-   product groups,
-   or data versions.

A dashboard without visible context can lead to analytical mistakes.

The frontend should communicate:

``` text
Project
Dataset
Last updated / processed
```

where appropriate.

------------------------------------------------------------------------

# 56. Data Freshness

If the underlying dataset has a processing timestamp, the frontend
should expose it.

For example:

``` text
Last processed
17 Sep 2026, 13:42
```

This helps the user understand whether they are viewing current or stale
outputs.

The frontend should distinguish:

``` text
Data uploaded
```

from:

``` text
Forecast generated
```

because these can happen at different times.

------------------------------------------------------------------------

# 57. Loading Strategy

Loading states should preserve page structure.

Avoid replacing the entire page with a generic spinner if only one chart
is loading.

Prefer component-level loading states where practical:

``` text
KPI cards loaded
Forecast chart loading
Inventory table loaded
```

For initial dashboard load, a skeleton state can preserve the expected
information architecture.

The exact loading component styling belongs to `design.md`.

------------------------------------------------------------------------

# 58. Forecast Job UX

When a forecast job is running, the user should know:

``` text
What is happening?
How far along is it?
Can I wait?
Can I leave this page?
```

A useful high-level sequence is:

``` text
Preparing data
      ↓
Classifying demand
      ↓
Generating candidate forecasts
      ↓
Validating forecasts
      ↓
Generating inventory outputs
      ↓
Dashboard ready
```

The frontend does not need to expose every internal step if backend
progress is not available.

But it should not pretend the process is instantaneous when it is not.

------------------------------------------------------------------------

# 59. Result Persistence

Once processing completes, results should persist.

The frontend should treat the dashboard as reading from stored results.

Conceptually:

``` text
Dataset
  ↓
Processing Job
  ↓
Forecast Result
  ↓
Inventory Recommendation
  ↓
Dashboard
```

Switching tabs should read those results.

Refreshing the browser should not invalidate them.

------------------------------------------------------------------------

# 60. Frontend Component Architecture

The frontend should likely use reusable components for repeated
analytical patterns.

Potential conceptual component groups:

``` text
DashboardShell
ProjectSelector
DatasetStatus
KpiCard
ChartCard
FilterBar
DateRangePicker
ProductSelector
LocationSelector
ComparisonSelector
DemandChart
ForecastChart
DemandPatternBreakdown
InventoryTable
RiskBadge
RecommendationCard
ForecastTable
DataHealthSummary
MappingReview
ProcessingProgress
EmptyState
ErrorState
```

These names are conceptual.

The exact component architecture should be adapted to the implementation
and `design.md`.

The important principle is reuse of behavior and semantics.

------------------------------------------------------------------------

# 61. Shared Chart Behavior

Charts should share consistent interaction principles.

When a chart has:

-   filters,
-   legends,
-   hover states,
-   tooltips,
-   time axes,

these interactions should behave consistently across pages.

For example, if forecast is represented by a line and actual by another
line on one page, the semantic treatment should remain consistent
elsewhere.

Visual details remain governed by `design.md`.

------------------------------------------------------------------------

# 62. Table Behavior

Tables should support enterprise workflows.

The user may need to:

-   search,
-   filter,
-   sort,
-   scan,
-   open details,
-   and potentially export data later.

The frontend should not prioritize decorative table styling over
usability.

Important columns should remain visible.

Status and risk should be visually scannable.

Numeric columns should be consistently aligned and formatted.

Exact visual treatment belongs to `design.md`.

------------------------------------------------------------------------

# 63. Data Formatting

The frontend should format values according to semantic type.

Examples:

``` text
Units:
84,200

Currency:
Rp 2.4B

Percentage:
12.8%

Date:
17 Sep 2026

Days:
8 days
```

The formatting should remain consistent across KPI cards, charts, and
tables.

Do not display raw backend values such as:

``` text
0.128
```

when the user-facing concept is:

``` text
12.8%
```

unless the context explicitly requires the raw value.

------------------------------------------------------------------------

# 64. Risk Language

Risk labels should come from the backend classification.

Possible statuses may be:

``` text
Low
Medium
High
```

or:

``` text
Healthy
Watch
At Risk
Critical
```

The exact vocabulary must be standardized before implementation.

The frontend should not mix multiple naming systems.

For example, do not show:

``` text
High Risk
```

on Overview but:

``` text
Critical
```

in Supply Chain Management unless they represent distinct states.

------------------------------------------------------------------------

# 65. Recommendation Language

Recommendations should be factual and traceable.

Instead of a vague:

``` text
You should order more.
```

the frontend should communicate:

``` text
Recommended order: 3,500 units

Based on:
- projected lead-time demand,
- safety stock,
- current usable inventory,
- and minimum order quantity.
```

This gives the user a reason rather than a command.

------------------------------------------------------------------------

# 66. Dashboard Is Not a Data Cleaning Tool

The dashboard should not become a replacement for the data
onboarding/review flow.

If the user needs to fix a schema mapping:

``` text
Dashboard
    ↓
Data issue
    ↓
Review / Mapping
```

rather than introducing arbitrary spreadsheet-like editing inside every
dashboard page.

The dashboard consumes validated analytical data.

------------------------------------------------------------------------

# 67. Dashboard Is Not Only a Reporting Tool

Likewise, the product should not be reduced to static reporting.

The dashboard must expose the relationship:

``` text
Historical Data
      ↓
Forecast
      ↓
Inventory Implication
      ↓
Recommended Action
```

This is what differentiates the product from a conventional sales
dashboard.

------------------------------------------------------------------------

# 68. Core End-to-End Flow

The complete intended UX can be represented as:

``` text
┌───────────────────────┐
│      MAIN CYCLE       │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│    PROJECT CHOICE     │
│                       │
│ Select Existing       │
│ Add New Project       │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│     DATA UPLOAD       │
│     CSV / Dataset     │
└───────────┬───────────┘
            ↓
┌───────────────────────┐
│   SYSTEM PROCESSING   │
│                       │
│ Profiling             │
│ Mapping               │
│ Validation            │
│ Forecast Preparation  │
└───────────┬───────────┘
            ↓
       ┌─────────┐
       │ Data OK?│
       └────┬────┘
          NO│   │YES
            │   ↓
            │ ┌──────────────────┐
            │ │ DASHBOARD ENTRY  │
            │ └────────┬─────────┘
            │          ↓
            │ ┌────────────────────────────────┐
            │ │            OVERVIEW             │
            │ │                                │
            │ │ KPI Cards                      │
            │ │ Actual vs Forecast              │
            │ │ Inventory                         │
            │ │ Priority Actions                 │
            │ └──────────────┬─────────────────┘
            │                │
            │       ┌────────┼─────────┐
            │       ↓        ↓         ↓
            │    Demand   Forecast   Supply
            │    & Sales            Chain Mgmt
            │       │        │         │
            │       ↓        ↓         ↓
            │   Detailed  Forecast   Inventory
            │   Demand    Analysis   vs Demand
            │   Analysis             Table
            │       │        │         │
            │       └────────┼─────────┘
            │                ↓
            │             Actions
            │
            ↓
┌───────────────────────┐
│ USER FEEDBACK /       │
│ DATA REVIEW           │
│                       │
│ Correct Mapping       │
│ Resolve Issues        │
└───────────┬───────────┘
            │
            └──────────────→ SYSTEM PROCESSING
```

------------------------------------------------------------------------

# 69. The Most Important UX Relationship

The entire application should preserve this conceptual relationship:

``` text
DATA
  ↓
UNDERSTANDING
  ↓
FORECAST
  ↓
RISK
  ↓
ACTION
```

More concretely:

``` text
Uploaded Dataset
      ↓
Schema + Data Health
      ↓
Demand Classification
      ↓
Forecast
      ↓
Inventory Comparison
      ↓
Stockout Risk
      ↓
Recommended Order
```

The frontend should make this chain understandable.

The user should not see five disconnected features.

They should see one coherent analytical journey.

------------------------------------------------------------------------

# 70. How the Three Dashboard Areas Relate

The confirmed three-tab architecture is: Overview, Demand & Sales, and
Supply Chain Management. Forecasting sits inside Demand & Sales as the
primary analytical workflow.

``` text
                    OVERVIEW
                       │
          ┌────────────┴─────────────┐
          ↓                          ↓
   DEMAND & SALES             SUPPLY CHAIN
   forecasting focus             MANAGEMENT
          │                          │
          └────────────┬─────────────┘
                       ↓
                  DECISION SUPPORT
```

Overview summarizes.

Demand & Sales explains historical demand and produces the core forecast
output.

Forecast explains expected future behavior.

Supply Chain Management translates that expectation into operational
inventory context.

This separation should remain intact even if the visual design changes.

------------------------------------------------------------------------

# 71. What Should NOT Happen

The frontend should avoid several failure modes.

Do not turn the Overview into a giant dashboard containing every table.

Do not duplicate the same chart across all tabs without changing its
purpose.

Do not put detailed inventory operations inside the Overview.

Do not make users understand ADI/CV² before showing them basic forecast
results.

Do not make users manually trigger model selection.

Do not calculate risk independently in React.

Do not silently accept ambiguous schema mappings.

Do not regenerate forecasts every time a user changes a display filter.

Do not display unavailable metrics as zero.

Do not make recommendations unexplained.

Do not use inconsistent terminology between pages.

Do not hide the active project/dataset context.

Do not lose the user's filter state unnecessarily during drill-down.

------------------------------------------------------------------------

# 72. Design.md Relationship

`design.md` is the visual design source of truth.

This document should be read together with `design.md`.

When implementing the frontend:

``` text
frontend_user_flow.md
    ↓
Defines:
- information architecture
- page responsibilities
- navigation
- UX states
- data relationships
- interaction intent

design.md
    ↓
Defines:
- visual language
- colors
- typography
- spacing
- component appearance
- layout styling
- visual hierarchy
- responsive visual treatment
```

If these documents appear to conflict, the implementation should
preserve the **functional UX intent** described here while using
`design.md` for the visual treatment.

Do not invent a new visual system merely because this document does not
specify one.

If a component is mentioned here but its appearance is not defined,
consult `design.md`.

------------------------------------------------------------------------

# 73. Relationship to Backend Architecture

The frontend should map to the existing backend pipeline without
exposing unnecessary implementation complexity.

The conceptual backend flow is:

``` text
Input
  ↓
Data Profiling
  ↓
Semantic Mapping
  ↓
Canonical Dataset
  ↓
Data Health
  ↓
Demand Classification
  ↓
Forecast Model Router
  ↓
Backtesting
  ↓
Validated Forecast
  ↓
Inventory Decision Engine
  ↓
Dashboard / API
```

The frontend maps onto this as:

``` text
Upload
  ↓
Review / Validation
  ↓
Overview
  ↓
Demand & Sales
  ↓
Forecast
  ↓
Supply Chain Management
```

This means the frontend should expose backend results at the correct
level of abstraction.

------------------------------------------------------------------------

# 74. Data Health in the UX

Data health may be available from the processing pipeline.

The frontend should use it as a trust signal.

Possible information includes:

``` text
Health Score
Frequency
History Length
Number of Series
Missing Values
Duplicate Rows
Forecastability
```

This information may be shown during onboarding and optionally
summarized in the dashboard.

The key principle is:

> **A forecast should not be presented as equally trustworthy regardless
> of data quality.**

If the dataset has a warning, the frontend should make that
discoverable.

For example:

``` text
Data Health: 82/100
1.3% missing
17 duplicate rows
21 months history
```

The detailed explanation can live in a data-health/review surface if
such a page exists in the implementation.

------------------------------------------------------------------------

# 75. Demand Classification and Forecasting Relationship

Demand classification should not feel disconnected from forecasting.

Conceptually:

``` text
Demand Type
    ↓
Candidate Forecasting Methods
    ↓
Historical Validation
    ↓
Forecast
```

The frontend can expose this relationship when users inspect a forecast.

For example:

``` text
Demand Type: Intermittent

Forecast Model: TSB

Validation
WAPE: 19.1%
Bias: -5.2%
```

The exact metrics depend on the actual backend result.

The frontend should never hard-code example model selections.

------------------------------------------------------------------------

# 76. Forecast Metrics

When forecast validation metrics are available, the primary metrics are
expected to include:

``` text
WAPE
Bias
```

Optional metrics may include:

``` text
MASE
```

The frontend should show metrics with context.

For example:

``` text
WAPE
12.8%

Bias
+1.9%
```

A tooltip or secondary explanation can clarify what the metric
represents.

Avoid displaying metrics without labels or units.

------------------------------------------------------------------------

# 77. Inventory Decision Transparency

Inventory recommendations should expose their components.

The decision engine may conceptually use:

``` text
Projected demand during lead time
+
Safety stock
-
Current inventory
+
MOQ adjustment
```

The frontend should represent these inputs where available.

This gives users the ability to challenge or verify a recommendation.

The recommendation should not appear as:

``` text
AI says order 3,500
```

It should appear as:

``` text
Recommended order: 3,500

Demand during lead time: 4,200
Safety buffer: 800
Current stock: 1,700
MOQ adjustment: 200
```

The exact values are dynamic.

------------------------------------------------------------------------

# 78. User Mental Model

The ideal user mental model is:

> "I uploaded my operational data. The system understood it. It checked
> whether the data was usable. It forecasted demand. Now I can see what
> is expected to happen and which inventory positions require
> attention."

The user should not have to think:

> "Which machine-learning component do I need to configure?"

The complexity should live behind the interface.

The interface should expose the evidence and controls that matter to the
user.

------------------------------------------------------------------------

# 79. MVP Priority

For the MVP, the frontend should prioritize the core journey:

``` text
Create Project
    ↓
Upload CSV
    ↓
Process
    ↓
Resolve Data Issues
    ↓
Dashboard
    ↓
Overview
    ↓
Forecast / Demand Analysis
    ↓
Supply Chain Risk
    ↓
Recommendation
```

Anything that does not strengthen this path should be secondary.

Potential future features such as:

-   ERP integrations,
-   API ingestion,
-   MCP,
-   Slack,
-   advanced exports,
-   multi-user permissions,
-   complex scenario simulation,

should not compromise the core dashboard flow.

------------------------------------------------------------------------

# 80. Frontend Implementation Checklist

Before considering the frontend flow complete, verify the following.

Project flow:

-   User can select an existing project.
-   User can create a new project.
-   New project leads naturally into dataset upload.
-   Active project context is preserved.

Upload flow:

-   CSV upload is supported.
-   Upload progress is visible.
-   Upload failure is recoverable.
-   Processing state is visible.

Validation flow:

-   System interpretation is visible when relevant.
-   Ambiguous mappings can be corrected.
-   Data-quality issues have actionable feedback.
-   Successful validation leads to dashboard entry.

Overview:

-   Demand forecast is summarized.
-   Revenue forecast is shown only when supported by data.
-   Inventory value is shown only when supported by data.
-   Stockout risk is visible.
-   Actual vs forecast demand is visible.
-   Inventory situation is summarized.
-   Priority actions are surfaced.
-   Users can navigate from summaries into details.

Demand & Sales:

-   Date range filter exists.
-   Product filter exists.
-   Location filter exists.
-   Comparison behavior is explicit.
-   Actual vs forecast vs sales can be inspected.
-   Sales by product is available.
-   Sales by location is available.
-   Demand pattern analysis using ADI/CV² is available when data
    supports it.

Forecast:

-   Forecast horizon is clear.
-   Historical and future periods are distinguishable.
-   Forecast values are inspectable.
-   Model information can be shown.
-   Validation metrics can be shown when available.
-   Forecast table is available if required by scope.

Supply Chain:

-   Inventory vs demand table exists.
-   Status classification is visible.
-   Risk can be filtered/sorted.
-   Product and location can be investigated.
-   Stockout timing can be shown when available.
-   Recommended order can be shown when inventory inputs support it.
-   Recommendation reasoning is accessible.

System behavior:

-   Dashboard tabs do not trigger unnecessary recomputation.
-   Loading states are explicit.
-   Empty states are explicit.
-   Error states are explicit.
-   Partial-data scenarios are handled.
-   Backend business logic is not duplicated in the frontend.
-   Visual implementation follows `design.md`.

------------------------------------------------------------------------

# 81. Final Canonical Flow

The frontend should ultimately communicate this single coherent journey:

``` text
                         USER
                          │
                          ▼
                  ┌───────────────┐
                  │ Project Choice│
                  └───────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
       Existing Project          New Project
              │                       │
              │                       ▼
              │                 Upload Dataset
              │                       │
              │                       ▼
              │                System Processing
              │                       │
              │                       ▼
              │                Data Validation
              │                       │
              │                ┌──────┴──────┐
              │                │             │
              │              Issue         Ready
              │                │             │
              │                ▼             │
              │          User Feedback       │
              │                │             │
              │                └──────┬──────┘
              │                       │
              └───────────────────────┘
                                      │
                                      ▼
                               Dashboard Entry
                                      │
                                      ▼
                              ┌───────────────┐
                              │    OVERVIEW   │
                              │               │
                              │ Demand        │
                              │ Revenue       │
                              │ Inventory     │
                              │ Stockout Risk │
                              │ Priority      │
                              └───────┬───────┘
                                      │
                  ┌───────────────────┼───────────────────┐
                  │                   │                   │
                  ▼                   ▼                   ▼
           DEMAND & SALES          FORECAST       SUPPLY CHAIN
                  │                   │             MANAGEMENT
                  │                   │                   │
                  ▼                   ▼                   ▼
             Historical          Future Demand      Inventory vs
               Demand             Forecast           Demand
                  │                   │                   │
                  ▼                   ▼                   ▼
             Sales by             Model /             Status /
             Product /            Validation            Risk
             Location             Metrics               │
                  │                   │                   ▼
                  ▼                   │             Recommendation
            ADI / CV²               │                   │
            Demand Type             │                   │
                  └───────────────────┼───────────────────┘
                                      │
                                      ▼
                              DECISION SUPPORT
                                      │
                                      ▼
                          User Understands What
                          Is Happening, What Is
                          Expected, and What
                          Requires Attention
```

The central UX principle is therefore:

> **Do not make the user navigate the complexity of the forecasting
> system. Make the complexity produce a clear analytical journey from
> data, to forecast, to risk, to action.**

That principle should remain stable even as individual pages,
components, visual styles, or backend models evolve.

------------------------------------------------------------------------

# 82. Implementation Note for Future Coding Models

When a future model is asked to implement or modify the frontend, it
should first understand the hierarchy in this document before writing
components.

The model should not begin by blindly generating cards and charts.

It should first determine:

1.  Which user journey step is being implemented.
2.  Which dashboard tab owns the information.
3.  Whether the information is summary or detail.
4.  What backend data is expected.
5.  What state the UI needs to represent.
6.  What navigation or drill-down relationship exists.
7.  Whether the interaction belongs to onboarding or dashboard
    exploration.
8.  Whether the visual treatment is already defined in `design.md`.

The implementation should preserve the distinction between:

``` text
Workflow
```

and:

``` text
Dashboard exploration
```

The onboarding workflow is sequential:

``` text
Project → Upload → Process → Validate → Dashboard
```

The dashboard is non-linear:

``` text
Overview ↔ Demand & Sales ↔ Forecast ↔ Supply Chain
```

The frontend should therefore use routing/navigation appropriate to both
behaviors.

When uncertain about where a feature belongs, ask:

> Is this helping the user understand the overall situation, investigate
> demand, inspect the forecast, or take an inventory/supply-chain
> action?

That answer should determine the page.

When uncertain about how a component should look, do not invent a new
design language. Refer to `design.md`.

When uncertain about a metric or classification, do not recreate backend
logic. Use the backend's canonical output.

When uncertain about whether a metric is available, represent the
unavailable state rather than inventing a value.

The final frontend should feel like one analytical product, not several
independent dashboards stitched together.
