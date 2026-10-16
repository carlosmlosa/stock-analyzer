# NVIDIA stock trend

A small Python project that downloads ten years of daily NVDA prices and displays an interactive closing-price chart, two frequency spectra, and an inverse FFT reconstruction in a Jupyter notebook. The adjusted closing prices account for stock splits. Data comes from Yahoo Finance through `yfinance`.

## Setup

Use Python 3.10 or newer. From the project directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

On Windows, activate the environment with `.venv\Scripts\activate` instead.

## Debug in VS Code

Install the Microsoft Python and Python Debugger extensions, open this repository
as your workspace, and use **Python: Select Interpreter** to select `.venv`.
After installing the requirements above, select **Signal Lab: Python server** in
**Run and Debug** and press **F5**. The launch configuration automatically opens
[Signal Lab](http://localhost:8000/playground/) in your default browser. Breakpoints in
`server.py` and its Python imports work, including market refresh requests.
Stop the server with **Shift+F5**. See [VS Code debugging](docs/vscode-debugging.md)
for configuration details and alternatives.

## Download and plot

```bash
python download_data.py
jupyter notebook
```

Open `notebooks/nvda_trend.ipynb` and run the code cells in order. Choose **From** and **Through** dates, a **Period (days)** range, and **Smooth (bins)** width. Changing a control redraws four vertically stacked plots: adjusted closing price, Welch power spectrum, raw versus smoothed FFT magnitude, and original versus reconstructed daily log returns. Select at least 64 trading days. All plots render inline with SVG, so they do not need WebGL. Run the download command again whenever you want current data.

The CSV and local environment are ignored by Git. Downloading requires internet access.

## Frequency spectra

Both spectra use mean-centered daily log returns from adjusted closing prices. Welch averaging uses overlapping Hann-windowed segments: up to 256 trading days per segment, or a shorter length for a short selected range. It reduces variation in the spectrum but makes nearby peaks harder to distinguish. The lower plot preserves the raw FFT magnitude in gray and overlays a Gaussian-smoothed line; the smoothing width is measured in frequency bins and can hide narrow peaks.

The period slider limits the visible range on both spectra, defaulting to 5–128 trading days. This hides periods outside the range; it does not remove noise. Frequency calculations treat trading sessions as evenly spaced and omit weekends and market holidays. Spectral peaks describe the selected sample and are not forecasts.

## Inverse FFT reconstruction

The fourth subplot applies the inverse real FFT to the smoothed spectrum and compares the reconstructed daily log returns with the original returns. Magnitudes alone cannot be inverted into the original time series, so the reconstruction keeps the original FFT phase and mean return while replacing positive-frequency magnitudes with the Gaussian-smoothed values. The period slider changes the visible spectrum range, but the inverse FFT always uses the full smoothed spectrum. This is a visualization of the smoothing effect, not a price forecast.

## Standalone smoothing playground

Explore and compare five smoothing methods in **Signal Lab**, a standalone interactive SPA with automatic loading of the downloaded NVDA data, optional CSV upload, adjustable windows and exponential alpha, hover inspection, zoom/pan, and CSV export.

```bash
python3 -m http.server 8000
```

Open [Signal Lab](http://localhost:8000/playground/). No installation or build step is required. With an S&P 500 catalog, the app defaults to NVDA hourly data and lets you select any company. Without a catalog it uses `data/nvda_hourly.csv` and the original daily `data/nvda_10y.csv`. Choose **Daily · 10 years** for longer history. Both select adjusted Close prices and retain dates. It generates no random time series. You can also upload another stock CSV and select a numeric column. All uploaded data stays in your browser. See [the playground documentation](docs/smoothing-playground.md) for method pros and cons, boundary behavior, data limits, and verification instructions.

The playground includes viewing presets for **Last day, Last week, Last month, YTD, Last year, Last 2 years, Last 5 years, Last 10 years, and All**, using fixed trading-session counts (1, 5, 21, 252, 504, 1,260, and 2,520) ending at the latest observation. YTD starts January 1 of the latest data year. Last day shows the latest daily observation; smoothing still uses the full history.

## Hourly stock data

```bash
source .venv/bin/activate
python download_data.py --interval 1h
```

This saves regular-session hourly NVDA bars separately to `data/nvda_hourly.csv`, with New York timestamps and UTC offsets. Hourly history is provider-limited; this download requests `730d` and prints the actual returned range (the current snapshot contains 5,073 bars across 730 trading dates); the daily download remains available via `python download_data.py`. The final bar of a trading day can be shorter than one hour, and the latest bar can be incomplete during market hours. Presets count trading dates: Last day shows all hourly bars from the latest session, Last week uses five sessions, and so on. Smoothing window size counts bars at the selected resolution.

## S&P 500 company explorer

```bash
source .venv/bin/activate
python download_sp500.py
```

The downloader caches the constituent snapshot and saves ten-year daily and provider-limited hourly prices for every listed share class under `data/sp500/`. Downloads run in small batches with up to four isolated workers with separate temporary yfinance caches (use `--workers 1` for sequential downloads); successful files are saved individually. Rerun the command to retry missing files, or use `--refresh` to update the list and prices. Use `--resolution daily` or `--resolution hourly` for only one resolution.

The playground loads `data/sp500/manifest.json`. Search by ticker, company name, or sector and use the Company selector to switch charts. Resolution, viewing window, and smoothing controls are preserved. Missing data is explicitly shown rather than displaying the previous company. Reload company data refreshes the catalog as well as the chart. A native selector and search field give quick access to hundreds of listings.

Constituents come from the [DataHub S&P 500 dataset](https://github.com/datasets/s-and-p-500-companies), which maintains a Wikipedia-derived snapshot. This is a current-constituent explorer, not a historical membership backtest. Newly listed companies may have less than ten years of history. The list may contain more than 500 tickers because some companies have multiple share classes. All price data remains local after download.

Downloader checks: `.venv/bin/python -m unittest discover -s tests -v` verifies share-class normalization, hourly timezone preservation, manifest availability, and preservation of existing files after bad responses.

Hourly requests rejected by Yahoo are retried with an explicit 729-calendar-day range; actual coverage is recorded in the manifest.

## Current simplified interface

The explorer now uses **hourly High prices** for every company. Company search, selection, viewing presets, smoothing controls, and comparison export remain available. Data resolution, reload, CSV upload, and column-selection controls have been removed. The chart explicitly labels High; it never falls back to Close if High is missing. Refresh the browser page after updating local downloads. Daily files remain available to the Python notebook and downloader. This section supersedes earlier descriptions of resolution and CSV controls.

The playground opens directly into the graph workspace; the branding header and introductory hero/title are removed. The selected company and price field remain above the chart for context.

The graph workspace spans the full page width, without outer side margins, a surrounding border, rounded corners, or a shadow. Internal control and chart padding remains for readability.

## Market refresh and technical indicators

Start the local server to enable **Update all market data** for every catalog symbol:

```bash
source .venv/bin/activate
python server.py
```

Open [Signal Lab](http://localhost:8000/playground/). The button downloads the latest available adjusted regular-session hourly bars from Yahoo Finance for every symbol in the cached S&P 500 catalog, requests only the range from each symbol’s latest saved timestamp to now, merges new bars into its CSV, updates the catalog, and reloads the selected chart. The last saved bar is requested again to update an incomplete bar; duplicate timestamps keep the newly fetched value. Symbols without a file get an initial history download. Older saved history is preserved. It uses four isolated workers in batches and can take several minutes. The button stays disabled until completion; concurrent refresh requests are rejected. The completion message reports updated and failed symbol counts; failed symbols retain their existing prices, and failures are recorded in the manifest. The latest timestamp is shown above the chart. Provider data can be delayed and the current bar can be incomplete. A failed download preserves existing prices. The plain `http.server` command still supports offline charts, but cannot fetch market updates. The CLI alternative is `python download_sp500.py --refresh --resolution hourly`; it also refreshes the constituent list. The browser refresh updates hourly prices only, leaving daily files unchanged.

Choose **SMA, EMA, RSI, MACD, Volatility, and ATR** using the sidebar checkboxes alongside the smoothing methods. All selected curves appear on the stock chart and share its date range, hover, zoom, and pan. Indicators are initially unchecked. SMA and EMA use the price axis; other indicators fit independently to the chart height, with actual visible ranges in the colored legend and actual values in the tooltip. The right axis shows relative position within each indicator's displayed range, not a shared financial unit. Curve intersections across different axes do not indicate equal values. RSI always uses 0–100. MACD includes its signal and histogram on the same indicator scale.

The indicator period defaults to 20 bars and controls SMA, EMA and volatility. RSI and ATR use Wilder smoothing over 14 bars; MACD uses 12/26-bar EMAs and a 9-bar signal EMA. Volatility is sample standard deviation of hourly log returns in percent, without annualization. ATR is in price units and includes gaps from the prior Close. Indicators use aligned Close/High/Low and full loaded history, leaving warm-up values blank; the original stock curve remains High. Export includes selected indicators and their original values.

Overlaying curves makes visual comparison compact, but independent scales require reading the legend or tooltip. Separate panels preserve conventional axes but use more vertical space.

Refresh alternatives: on-demand refresh gives explicit control and fewer provider requests, while automatic polling reduces manual work but creates background traffic and can hit provider limits. This implementation uses on-demand refresh. The existing button refreshes all catalog symbols for a consistent snapshot; selected-company updates would be faster and use fewer requests but leave other symbols stale.

Verification: `cd playground && npm test` and `.venv/bin/python -m unittest discover -s tests -v` from the project root.

## Compact chart layout

The workspace fills the page width. Company selection, market refresh and company search sit in the top bar. Smoothers are on the left (MA, G, MED, EXP, LQ); indicators are on the right (SMA, EMA, RSI, MACD, VOL, ATR). W and α control smoothing; N controls indicator periods. Definitions and metric cards are removed from the visible interface. The graph uses the remaining width and grows with the viewport height. Narrow screens retain both compact control columns and wrap the company search below the top controls.

## Compare two points

Click the stock graph twice to mark A and B at the nearest bars. The compact comparison row shows both timestamps and High prices, signed price change ($ and % of A), elapsed calendar hours/days, bar distance, and elapsed time as a percentage of the full loaded history duration. Each subsequent click discards the oldest point and compares the most recent two. Dragging still pans without selecting a point. Clear removes both points; changing company or refreshing data resets them. Dates selected in reverse order give signed negative time changes. Indicators do not change which stock price is compared.

Comparison results now float inside the graph, initially at the bottom right. Drag the A ↔ B handle to reposition the box; it stays within the chart when resized. Vertical grid lines mark the first available trading bar of each month. Gaussian (G) is the only smoother selected at startup; other smoothers and indicators remain selectable.

The draggable comparison box shows only YYYY-MM-DD for each point, identified by colors matching the graph markers. Price deltas are green for gains, red for losses and neutral for zero. Time is the absolute calendar-date distance in whole days; bar counts and history percentages are omitted.

The comparison delta shows percentage first, followed by dollar change in parentheses, e.g. `Δ +5.00% ($+10.000)`.

## Repository contents

Git excludes the virtual environment, Python caches and downloaded market snapshots under `data/`. After cloning, install requirements and run `python download_sp500.py` to recreate the company catalog and prices before starting `python server.py`.

### Incremental market updates

The browser's **Update all market data** fetches recent missing hourly bars for
all catalog symbols, rather than downloading their full history again. This
fills the tail since each file's latest timestamp; it does not scan for gaps
inside older history. Requests are limited to Yahoo's available hourly window
(729 days here); older unavailable gaps cannot be recovered by this button.
Empty or failed provider responses leave the symbol's file unchanged and appear
in the failure summary. Daily files remain unchanged.

Incremental updates minimize transfers and preserve local history. A full
`python download_sp500.py --refresh --resolution hourly` rebuild downloads more
data but can repair older gaps and reconcile historical price adjustments from
splits or dividends; incremental updates do not rescale older saved bars.
