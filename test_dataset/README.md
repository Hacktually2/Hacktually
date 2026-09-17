# Hacktually Mid-Market Demand Forecasting Test Pack

This ZIP is a **synthetic, reproducible test pack** designed for your 24-hour demand-forecasting hackathon.
It is intentionally shaped like Indonesian mid-market retail / distribution / manufacturing data, but it is NOT real company data.

## Included datasets
1. `01_indonesia_fmcg_distributor_synthetic.csv`
   - 200 SKUs x 4 DCs x 540 daily observations.
   - Price, promo, inventory, lead time, MOQ, Ramadan/Lebaran/payday event flags.
   - Contains stockout-censored observed sales.
2. `02_indonesia_retail_chain_synthetic.csv`
   - 250 items x 5 outlets x 365 days.
   - Different schema, price/markdown/promo/inventory.
3. `03_indonesia_manufacturing_weekly_synthetic.csv`
   - 120 finished goods x 2 plants x 104 weeks.
   - Orders, shipments, production, capacity, inventory, backlog.
4. `03b_manufacturing_bom_synthetic.csv`
   - Simple BOM for the manufacturing decision layer.
5. `04_indonesia_spare_parts_intermittent_synthetic.csv`
   - 800 parts x 3 depots x 48 months.
   - Designed to stress ADI/CV² and intermittent/lumpy routing.
6. `schema_challenge/`
   - Three semantically identical exports with different enterprise-style column names.
   - Use these to test schema understanding / canonicalization.
7. `ground_truth/distributor_series_labels.csv`
   - Hidden labels for validating your Smooth/Erratic/Intermittent/Lumpy classifier.
   - Do NOT feed this file to the forecasting model.

## Suggested test order
A. Schema adaptation: `schema_challenge/*`
B. Clean end-to-end retail/distribution: distributor + retail chain
C. Manufacturing decision mode: manufacturing + BOM
D. Intermittent routing: spare parts
E. Backtest stockout/censored demand handling: distributor (`stockout_flag`)

## Important
All demand/calendar effects in this pack are synthetic test signals, including the local-event flags.
Use them for engineering validation and demos, not as factual historical Indonesian market data.

## Real public datasets worth testing next (not bundled)
- Indonesian F&B MSME POS dataset (Surabaya; 3 outlets, 53,820 transactions):
  https://data.mendeley.com/datasets/kcgf45y24m/2
- 4-store Retail Sales Forecasting dataset (25 months):
  https://www.kaggle.com/datasets/svizor/retail-sales-forecasting-data
- Wholesale/Reseller Retail Data Set (3+ years):
  https://www.kaggle.com/datasets/shedai/retail-data-set
- Retail Store Scanner Data:
  https://www.kaggle.com/datasets/marian447/retail-store-sales-transactions

Those sources have their own licenses/terms; download them directly from the publishers for real-data benchmarking.
