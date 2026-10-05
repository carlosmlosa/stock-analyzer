# Signal Lab smoothing playground

A standalone browser SPA in `playground/`, separate from the Python notebook. Serve the repository with `python3 -m http.server 8000` and open http://localhost:8000/playground/. It needs no build step or Python packages. Optional Google Fonts fall back to system fonts offline.

The app loads the S&P 500 manifest and defaults to NVDA hourly adjusted Close. Company and Data resolution selectors load the matching local CSV. If the catalog is absent, the original `data/nvda_hourly.csv` and `data/nvda_10y.csv` remain fallback datasets. It uses all downloaded trading sessions, with calendar dates on the horizontal axis and in hover details. No synthetic series or random noise is generated. Use Load downloaded NVDA data to restore the existing dataset after uploading another CSV; this does not download fresh market data.

Enable any combination of five methods. Window size is in trading sessions and affects centered methods; alpha affects only exponential smoothing. Hover for dates and values, scroll to zoom, drag to pan, or Reset view. Export comparison CSV includes sample index, date, the full original series, and all enabled methods, regardless of viewport.

## Methods and alternatives

| Method | Advantages | Limitations |
| --- | --- | --- |
| Moving average | Simple, stable, reduces fluctuations | Flattens peaks and blurs jumps |
| Gaussian | Smooth weighted transitions | Blurs sharp changes and narrow peaks |
| Median | Resists isolated outliers | Can flatten short features and create plateaus |
| Exponential moving average | Causal, inexpensive, uses only past data | Lags changing signals; depends on initialization |
| Local quadratic | Preserves polynomial curvature and broad peaks | Can overshoot jumps and respond strongly to outliers |

Centered methods use future and past samples. Boundaries use truncated windows; averaging weights are renormalized. Gaussian standard deviation is window size divided by six. Local quadratic uses an unweighted least-squares quadratic with a fresh asymmetric fit at each boundary (Savitzky–Golay style). EMA starts at the first observation and follows `y[i] = alpha*x[i] + (1-alpha)*y[i-1]`.

The metric is `100 * (1 - smoothed mean absolute first difference / original mean absolute first difference)`. A constant original returns 0%. Negative values indicate increased variation. This measures roughness, not accuracy or predictive value.

## CSV data

Upload a comma-separated UTF-8 CSV up to 5 MB, with an optional header and quoted fields. Select a numeric column. At least three numeric values are required. Empty and nonnumeric rows are omitted and reported, so gaps are compressed. The first 10,000 numeric values are retained. A Date column is retained alongside numeric samples and shown on the chart. Trading sessions are equally spaced, omitting weekends and holidays; CSVs without dates use sample index. Uploads remain in browser memory and are never sent to a server.

The downloaded NVDA adjusted closing-price column is selected by default. This playground smooths that column directly; it does not reproduce the notebook's log-return spectra or inverse FFT.

## Verification

Run `cd playground && node --test smoothing.test.js` with Node.js 18 or newer. Tests also verify that the existing stock CSV loads its complete Close series with aligned dates. Tests cover constant preservation, quadratic preservation at boundaries, outlier rejection, causal EMA, and CSV parsing. Browser checks: toggle all methods, adjust both smoothing controls, zoom/pan/reset, upload a CSV and change columns, export CSV, and check a narrow viewport.

## Viewing windows

Choose Last day (1 session), Last week (5), Last month (21), YTD, Last year (252), Last 2 years (504), Last 5 years (1,260), Last 10 years (2,520), or All. All is the initial view. These fixed sample counts end on the latest loaded observation; weekends and holidays mean their calendar duration varies. YTD begins inclusively on January 1 of the latest observation's year. Last day shows one observation for daily data, or all hourly bars from the latest trading date for hourly data. Windows longer than the available history show the available data.

The footer reports the visible session count and date range. Smoothing and variation metrics use the full history, so changing the viewing window does not restart EMA or create new smoothing boundaries. CSV exports include the full series. Zooming or panning clears the selected preset; Reset view restores All after manual navigation, or reapplies the selected preset otherwise. Uploaded CSVs need ascending ISO dates (`YYYY-MM-DD` or offset-bearing timestamps) for YTD; fixed-count presets also work without dates. For hourly timestamps, these counts refer to distinct trading dates, retaining every bar from the selected sessions.

Fixed trading-session counts provide consistent sample sizes but approximate calendar durations. Calendar periods are an alternative with familiar date boundaries but varying session counts. Tests verify every fixed-count preset, clipping to available history, and YTD boundaries.

## Hourly downloads

Run `.venv/bin/python download_data.py --interval 1h` from the repository root to save hourly data separately. It requests the provider period `730d` from Yahoo Finance, with adjustment enabled and extended hours excluded. Timestamps are converted to America/New_York and retain UTC offsets for daylight saving time. See [the provider library source](https://github.com/ranaroussi/yfinance/blob/main/yfinance/scrapers/history.py) for its hourly lookback limit. Ten-year hourly history is unavailable through this source.

Hourly data gives intraday detail over a shorter history; daily data gives longer historical coverage with fewer observations. The resolution control keeps the viewing preset selected. Smoothing windows count observations (hourly bars or daily bars). The end-of-session bar may be shorter than an hour; the current bar may still be changing during market hours. No artificial hourly values are interpolated from daily data.

The downloaded snapshot contains 5,073 bars across 730 trading dates, from November 2, 2023 through October 1, 2026. This is the range actually returned for `730d`; availability can vary from the provider library's documented calendar lookback limits. The downloader prints the returned range rather than assuming its duration.

## S&P 500 catalog and switching

`download_sp500.py` downloads the [DataHub constituent CSV](https://github.com/datasets/s-and-p-500-companies/blob/main/data/constituents.csv), normalizes dotted symbols to Yahoo's hyphenated share-class symbols, and fetches both resolutions via yfinance. Source CSV, generation time, per-company filenames, actual row counts, returned ranges, and failed downloads are recorded under `data/sp500/`. Files are written atomically and the manifest is updated after each batch. Successful files are reused on subsequent runs; `--refresh` requests a new constituent snapshot and overwrites successful downloads. Failures do not overwrite previously saved files.

The selector lists tickers and company names; search also matches sectors. Its status displays local availability for the selected resolution. Choosing a company fetches only its local CSV. Requests are guarded so a late response cannot replace a newer selection. Loading or failed selections clear the previous chart. Reload company data refreshes the manifest, which allows companies downloaded by an in-progress batch to become available. NVDA's original files remain a fallback when the catalog is absent.

Downloading all data upfront provides offline switching but uses more disk and takes longer initially. On-demand downloads are an alternative that reduces upfront storage but requires a network-dependent backend. This app uses the requested local-download approach. Test switching companies at both resolutions, searching names/tickers/sectors, keeping Last week selected while switching, and retrying unavailable files.

Downloader checks: `.venv/bin/python -m unittest discover -s tests -v` verifies share-class normalization, hourly timezone preservation, manifest availability, and preservation of existing files after bad responses.

If Yahoo rejects the hourly `730d` period for a newer ticker, the downloader retries with an explicit 729-calendar-day range. Returned coverage is recorded per company, so available histories can differ.

## Current simplified interface

The explorer now uses **hourly High prices** for every company. Company search, selection, viewing presets, smoothing controls, and comparison export remain available. Data resolution, reload, CSV upload, and column-selection controls have been removed. The chart explicitly labels High; it never falls back to Close if High is missing. Refresh the browser page after updating local downloads. Daily files remain available to the Python notebook and downloader. This section supersedes earlier descriptions of resolution and CSV controls.

The playground opens directly into the graph workspace; the branding header and introductory hero/title are removed. The selected company and price field remain above the chart for context.

The graph workspace spans the full page width, without outer side margins, a surrounding border, rounded corners, or a shadow. Internal control and chart padding remains for readability.

## Latest market data and technical panels

Use `python server.py` from the project root and open `/playground/` to enable **Update market data**. The local server binds to loopback and accepts a catalog ticker at `POST /api/refresh`. Refresh requests are serialized, download only hourly data for the requested company through the existing downloader, and rebuild the manifest after success. The browser reloads the current selection with cache disabled. Failures appear beside the button and retain existing chart data. Static hosting remains available for viewing local files; it displays server startup instructions when refresh is attempted. Yahoo data is latest available provider data, not a guaranteed real-time feed.

The six sidebar indicator checkboxes overlay their selected curves on the main stock chart. They share its view range and calculate over all loaded bars, including history before the visible range. They use adjusted Close; ATR also uses aligned High and Low. The existing centered smoothing methods are separate from these causal indicators.

- SMA: trailing mean of N closes; EMA: alpha `2/(N+1)`, seeded with N closes.
- RSI: 14 close changes, initial mean gain/loss followed by Wilder smoothing (`1/14`). Flat series produce 50; zero losses with positive gains produce 100.
- MACD: EMA(12) minus EMA(26), EMA(9) signal and MACD minus signal histogram.
- Volatility: sample standard deviation (`N-1` denominator) of N log returns, multiplied by 100. It measures percent per hourly bar, without an annualization assumption.
- ATR: 14-bar Wilder average of `max(High-Low, abs(High-previous Close), abs(Low-previous Close))`. The first bar uses High-Low.

The period input (2–200 bars, default 20) controls SMA, EMA and volatility. Null warm-up values are left blank. Indicators start unchecked and can be combined with any smoother. SMA and EMA use the price axis. RSI uses 0–100; MACD (including signal and histogram), volatility and ATR each use an independent visible range fitted to chart height. Flat ranges expand by 0.5 on either side. The right axis displays relative range position from 0% to 100%; the colored legend gives actual ranges and units. These relative percentages are distinct from volatility's actual percent values. Hover the main chart to inspect original values. CSV export includes every selected smoother and indicator, leaving warm-up cells blank. Switching companies clears prior indicator curves before loading new data.

Overlaying indicators keeps comparisons compact and shares one set of chart interactions; independent scales require reading the actual ranges and do not support interpreting curve intersections as equal values. Separate panels are an alternative with conventional axes but require more vertical space.

On-demand updates minimize traffic and are easy to control but require a click. Periodic refresh is an alternative that would reduce manual work at the cost of background requests and provider limits. Full-catalog updates are available via `download_sp500.py --refresh --resolution hourly` but take longer.

Indicator conventions: [Fidelity technical indicator guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis).

Run `npm test` inside `playground/` for smoothing, range and indicator checks, including causality, warm-up boundaries, RSI extremes, flat-market outputs and ATR gaps. Run `.venv/bin/python -m unittest discover -s tests -v` from the root for downloader preservation and refresh validation.

## Compact controls

Company selection, refresh and search are in a full-width top bar. The chart sits between a compact left smoother column and a compact right indicator column. Visible method definitions, guidance, metric cards and the footer are removed. Smoother labels are MA (moving average), G (Gaussian), MED (median), EXP (exponential), and LQ (local quadratic); volatility is VOL. W is the smoother window, α is exponential weighting and N is the indicator period. Accessible names identify the abbreviated numeric controls. Hover values, colored ranges, date presets, reset and CSV export remain available. On narrow screens the side columns shrink and the top search wraps, preserving the requested left/chart/right arrangement.

## Two-point comparison

Graph clicks snap to the nearest stock bar and retain only the latest two selections, labeled A and B. A third click shifts B to A and sets the new B. Both markers use original High prices regardless of visible overlays. The row shows signed `B-A` price change, `100*(B-A)/A`, calendar time difference, bar distance, and `100*(timeB-timeA)/(lastLoadedTime-firstLoadedTime)`. Thus the time percentage uses the full loaded history, not the visible zoom window or a percentage of an epoch timestamp. Zero price baselines and unavailable time percentages display n/a. Same-bar clicks give zero differences. Pan gestures exceeding five CSS pixels do not select points; Clear, company changes and refresh reset selection, while zoom and presets retain it. Markers outside the visible range remain selected but are not drawn.

The rolling last-two-click behavior supports quick comparisons; fixed A with a moving B would be an alternative for comparing several prices against one baseline, but would require an extra reset or anchor control.

## Graph overlays and defaults

The comparison readout appears in a draggable overlay inside the chart, initially on the right opposite the usual hover tooltip. Use its A ↔ B handle to drag it without selecting stock points or panning. Pointer capture supports continued dragging, cancellation ends it, and positioning is constrained to the chart bounds on drag and resize. The readout retains Clear and live announcements. Monthly vertical grid lines use exchange-local date strings and mark the first available bar of each month, including month changes across gaps or holidays. Only Gaussian is checked at startup. A fixed comparison box would simplify positioning but could obscure a chosen part of the graph; the draggable overlay lets the user move it aside.

The compact comparison readout now identifies points with matching blue/orange colors rather than A/B labels. Point rows contain dates only (YYYY-MM-DD). Price delta and percentage share green/red coloring for positive/negative changes; zero remains neutral. Time delta is unsigned whole calendar days between the displayed dates, avoiding fractional hours and DST effects. Bar counts and percentages of loaded history are no longer displayed. The drag handle is a grip icon.

The comparison delta shows percentage first, followed by dollar change in parentheses, e.g. `Δ +5.00% ($+10.000)`.
