# Repository guide for coding agents

These instructions apply throughout this repository and use standard files and
commands, independent of any agent vendor or editor. Follow the user's task and
any more specific instructions in the directory being changed. Run commands from
the repository root unless a different directory is explicitly shown.

## Project and structure

Stock Analyzer / Signal Lab is a local Python stock downloader and HTTP server,
a vanilla JavaScript chart explorer, and a separate Jupyter analysis notebook.
There is no frontend build step, application framework, or installable Python
package (`tool.uv.package = false`).

| Path | Responsibility |
| --- | --- |
| `server.py` | Loopback HTTP server, static files and `POST /api/refresh`; serializes refresh requests with a lock. |
| `download_sp500.py` | Constituent catalog, daily/hourly downloads, incremental hourly updates, CSV and manifest persistence, isolated worker processes. |
| `download_data.py` | Standalone NVDA daily or hourly CSV download. |
| `playground/index.html`, `style.css` | Browser controls and responsive layout. |
| `playground/app.js` | Canvas rendering, company loading, UI state, refresh API and CSV export. |
| `playground/smoothing.js` | Pure smoothing and CSV parsing functions. |
| `playground/indicators.js` | Pure technical indicator calculations. |
| `playground/ranges.js`, `comparison.js` | Viewing windows and two-point comparison calculations. |
| `playground/*.test.js` | Node built-in test runner tests. |
| `tests/test_server.py`, `test_sp500_download.py` | Python unittest tests with mocked provider calls and temporary storage. |
| `notebooks/nvda_trend.ipynb` | Daily adjusted Close, log-return spectra and inverse FFT exploration. |
| `data/` | Generated local market data; CSVs and `data/sp500/` are ignored by Git. |
| `pyproject.toml`, `uv.lock`, `.python-version` | Dependency declarations, resolved versions and development Python selection. |
| `.vscode/` | Optional editor recommendations, environment/test settings, tasks and F5 launch. |
| `README.md`, `docs/` | User setup, behavior, math reference and debugging documentation. |

Some README and playground documentation sections describe older controls.
Inspect current code and later sections before changing behavior: the current
explorer plots hourly **High**, has no resolution/upload/column controls, and
supports company search, smoothers, indicator overlays, viewing windows, two-point
comparison and export. The notebook still uses daily **Close**.

## Setup and common commands

Install uv and use the checked-in Python 3.12 selection (project support starts
at Python 3.10). Node.js 18 or newer is needed for JavaScript tests only. Install
dependencies with:

```sh
uv sync --locked
```

This creates `.venv`; manual activation is unnecessary. Prefer `uv run --locked`
for routine commands so dependency drift fails visibly. In a prepared environment
without uv, the same Python entry points work with that environment's interpreter.

```sh
# Start the application; does not download market data
uv run --locked python server.py
# Alternate port
uv run --locked python server.py --port 8001
# Explicit initial explorer data download (network; potentially several minutes)
uv run --locked python download_sp500.py --resolution hourly
# Daily NVDA data for the notebook
uv run --locked python download_data.py
# Optional separate hourly NVDA CSV
uv run --locked python download_data.py --interval 1h
# Notebook server; select the .venv kernel and run cells in order
uv run --locked jupyter notebook
```

Open `http://localhost:8000/playground/` (adjust for the selected port). Serve the
repository root, not just `playground/`, because data lives beside it. A static
server (`uv run --locked python -m http.server 8000 --bind 127.0.0.1`) can show
local charts but cannot handle market refreshes. Do not open the HTML via `file://`.

Dependencies belong in `pyproject.toml`: use `uv add <package>` when required,
then include the resulting lockfile changes. Upgrade only when the task calls
for it. `requirements.txt` is a generated compatibility export; regenerate after
dependency changes rather than editing pins manually:

```sh
uv export --locked --format requirements-txt --no-hashes --output-file requirements.txt
```

## Making changes and code style

- Inspect `git status --short` and the relevant code/tests first. Preserve existing
  user changes, generated local data and unrelated work. Keep patches focused;
  avoid whole-file formatting churn, broad refactors or new frameworks unless
  the task requires them.
- Python uses four-space indentation, `snake_case` functions/variables and
  `UPPER_CASE` constants. Match surrounding quote style; existing files vary.
  Use `pathlib` for paths, keep script execution behind a main guard, and keep
  process-pool callables at module scope for the `spawn` multiprocessing context.
- JavaScript uses native ES modules, `const`/`let`, camelCase functions/variables
  and semicolons. Match nearby formatting (some UI code is compact). Keep numeric
  logic in the pure modules and DOM/canvas/network orchestration in `app.js`.
  Preserve HTML IDs used by JavaScript and maintain label/keyboard accessibility.
- No formatter, linter or type-checker is configured. Do not invent mandatory
  tooling or claim those checks ran. Add comments for non-obvious math, units,
  time handling or provider constraints.
- Add focused regression tests for changed calculations, persistence or request
  behavior. Mock network calls and use temporary directories for Python tests;
  use deterministic arrays/CSV strings for JavaScript tests. Avoid dependence on
  today's prices, live Yahoo responses or a developer's local data.
- Update relevant user documentation when commands or behavior change. When
  editing notebooks, preserve valid notebook structure and avoid unrelated
  output/metadata churn; verify changed cells using the project kernel.

## Data and behavior contracts

Preserve these unless the requested change explicitly revises them:

- Prices are adjusted and regular-session only. Hourly timestamps retain
  America/New_York UTC offsets; daily and hourly files are separate. Catalog
  tickers normalize dotted share classes to Yahoo's hyphenated symbols.
- CSVs use a `Date` column; the manifest records availability and actual returned
  ranges. Do not fabricate data, interpolate unavailable hourly history, or
  silently substitute Close when the chart requires High.
- Failed/empty/invalid downloads preserve saved files. Successful writes use a
  temporary file and replacement. Incremental refresh overlaps the latest bar,
  keeps the newer duplicate, sorts timestamps and preserves older history. It
  fills the tail, not internal historical gaps or split-adjustment revisions.
- Browser refresh updates hourly prices for all catalog symbols, not just the
  selected company. Concurrent refresh requests are rejected. Preserve request
  size/JSON/origin checks and loopback binding. Do not expose this local server
  publicly as part of ordinary development.
- Workers use isolated yfinance caches. Do not replace this with shared concurrent
  cache access without addressing locking. Full `--refresh` downloads replace
  history and may take substantial time; do not run them as routine validation.
- Dates, values and OHLC arrays must stay aligned. Stale async company responses
  cannot replace a newer selection; failed selections must not show old prices.
- Compute smoothers/indicators over the full loaded history, then select the
  visible window. Preserve boundary rules and indicator warm-up nulls. Centered
  smoothers can use future samples; technical indicators are causal. Independent
  indicator axes do not imply equal financial values at curve intersections.

## Validation

Run checks appropriate to the changed area and report actual results:

```sh
# Python request/downloader logic; no live market downloads
uv run --locked python -m unittest discover -s tests -v
# All JavaScript tests (see snapshot limitation below)
npm --prefix playground test
# Whitespace errors
git diff --check
```

**Known snapshot limitation:** the test named `downloaded NVDA data loads all
closing prices with aligned dates` in `playground/smoothing.test.js` reads ignored
`data/nvda_10y.csv` and asserts exact September 2016–September 2026 dates/prices.
It fails on a fresh checkout; downloading today's data will not reproduce that
historical fixture. Do not alter real data to make it pass or report a passing
full suite when this test failed. Run the data-independent tests with:

```sh
cd playground
node --test comparison.test.js indicators.test.js
node --test --test-name-pattern='all smoothers|local quadratic|median rejects|EMA is causal|CSV supports|fixed-session|hourly windows' smoothing.test.js
```

If the task addresses this limitation, replace the external dependency with a
small deterministic fixture while retaining parsing/alignment coverage.

For UI changes, also check the browser at wide and narrow widths: company
search/switching, unavailable data, viewing presets, smoother/indicator controls,
hover, zoom/pan, comparison selection/dragging/clear and export as relevant.
Unit tests do not verify canvas layout or interactions. Test refresh using mocks
where possible; it mutates local data and contacts external providers.

## Debugging

- **VS Code:** install recommended extensions; select `.venv` through
  **Python: Select Interpreter** if needed. Choose **Signal Lab: Python server**
  and press F5. Its `uv: sync` pre-launch task syncs locked dependencies, and it
  opens the printed URL. Set breakpoints in `server.py` and parent-process
  downloader code; spawned worker breakpoints may require separate subprocess
  debugger configuration. Shift+F5 stops the session. See
  `docs/vscode-debugging.md` for details and available tasks.
- **Any editor/terminal:** run the server command above; use
  `uv run --locked python -m pdb server.py` for standard-library debugging (enter
  `continue` to serve). Use an alternate port if 8000 is occupied. Stop your own
  terminal server with Ctrl+C; do not kill unrelated processes.
- **Browser:** inspect Console and Network for JavaScript errors and missing
  manifest/CSV requests. Check `data/sp500/manifest.json` and the selected hourly
  CSV. A missing catalog/data file is expected before initial downloads. HTTP
  404/501 on refresh usually means a static server was started; 409 means an
  update is in progress; 502 means the refresh was interrupted. Inspect the
  response summary for partial provider failures even after HTTP 200.
- **Downloads:** retry missing files without `--refresh`; use `--workers 1` to
  simplify troubleshooting. Empty Yahoo responses may reflect provider limits.
  Inspect actual CSV and manifest coverage rather than assuming ten years of
  hourly history. For incremental failures inspect `update_hourly`; worker setup
  is in `initialize_worker`.
- **Notebook:** use the `.venv` kernel, download daily NVDA data, restart and run
  cells in order. Select at least 64 trading days within the actual file range;
  the initial start date is currently hard-coded, so inspect date controls if
  the selection is empty.

## Finishing a task

Review the final diff and status for unintended files or data. Report what
changed, checks actually run, and remaining failures or checks requiring a browser,
network or local snapshot. Keep environment files, caches and downloaded snapshots
out of commits. Do not commit, push or publish unless requested.
