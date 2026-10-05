"""Download a current S&P 500 snapshot and resumable adjusted price files."""
import argparse
import csv
import io
import json
import re
import time
import tempfile
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent / 'data' / 'sp500'
SOURCE = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temporary.replace(path)


def constituents(refresh=False):
    path = ROOT / 'constituents.csv'
    if refresh or not path.exists():
        request = Request(SOURCE, headers={'User-Agent': 'StockAnalyzer/1.0'})
        with urlopen(request, timeout=30) as response:
            text = response.read().decode('utf-8-sig')
        rows = list(csv.DictReader(io.StringIO(text)))
        if len(rows) < 400 or not {'Symbol', 'Security', 'GICS Sector'} <= rows[0].keys():
            raise ValueError('Constituent response has an unexpected structure.')
        path.write_text(text, encoding='utf-8')
    rows = list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
    companies = []
    for row in rows:
        symbol = row['Symbol']
        if not re.fullmatch(r'[A-Z0-9.-]+', symbol):
            raise ValueError(f'Invalid symbol: {symbol!r}')
        companies.append({'symbol': symbol, 'ticker': symbol.replace('.', '-'),
                          'name': row['Security'], 'sector': row['GICS Sector']})
    return sorted(companies, key=lambda c: c['name'].lower())


def manifest(companies, errors):
    entries = []
    for company in companies:
        entry = dict(company, files={})
        for resolution in ('daily', 'hourly'):
            path = ROOT / resolution / (company['ticker'] + '.csv')
            if path.exists():
                frame = pd.read_csv(path)
                entry['files'][resolution] = {'path': f'{resolution}/{path.name}',
                    'rows': len(frame), 'start': str(frame.Date.iloc[0]), 'end': str(frame.Date.iloc[-1])}
        entries.append(entry)
    write_json(ROOT / 'manifest.json', {'generatedAt': datetime.now(timezone.utc).isoformat(),
        'constituentsSource': SOURCE, 'companies': entries, 'errors': errors})


def save_prices(frame, ticker, resolution):
    frame = frame.dropna(subset=['Close']).sort_index()
    frame = frame.loc[~frame.index.duplicated(keep='last')]
    if len(frame) < 3 or not pd.to_numeric(frame.Close, errors='coerce').notna().all():
        raise ValueError('No usable prices returned')
    if resolution == 'hourly':
        frame.index = frame.index.tz_convert('America/New_York')
    path = ROOT / resolution / (ticker + '.csv')
    temporary = path.with_suffix('.tmp')
    frame.to_csv(temporary, index_label='Date')
    temporary.replace(path)


def initialize_worker():
    # Independent caches prevent SQLite locks between simultaneous Yahoo requests.
    global worker_cache
    worker_cache = tempfile.TemporaryDirectory(prefix='stock-analyzer-yfinance-')
    yf.set_tz_cache_location(worker_cache.name)


def download_one(task):
    ticker, resolution = task
    try:
        prices = yf.download(ticker, period='730d' if resolution == 'hourly' else '10y',
            interval='1h' if resolution == 'hourly' else '1d', auto_adjust=True,
            prepost=False, multi_level_index=False, threads=False, progress=False, timeout=20)
        if resolution == 'hourly' and (prices is None or prices.empty):
            # Yahoo rejects some newer tickers' period-expanded start dates.
            end = pd.Timestamp.now(tz='America/New_York')
            prices = yf.download(ticker, start=end-pd.Timedelta(days=729), end=end,
                interval='1h', auto_adjust=True, prepost=False, multi_level_index=False,
                threads=False, progress=False, timeout=20)
        save_prices(prices, ticker, resolution)
        return ticker, None
    except Exception as error:
        return ticker, str(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resolution', choices=['both', 'daily', 'hourly'], default='both')
    parser.add_argument('--workers', type=int, choices=range(1,5), default=4, help='Isolated download workers (1–4)')
    parser.add_argument('--refresh', action='store_true', help='Refresh constituent list and existing prices')
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    companies = constituents(args.refresh)
    errors = {}
    resolutions = ['daily', 'hourly'] if args.resolution == 'both' else [args.resolution]
    manifest(companies, errors)
    with ProcessPoolExecutor(max_workers=args.workers, mp_context=multiprocessing.get_context('spawn'), initializer=initialize_worker) as pool:
        for resolution in resolutions:
            (ROOT / resolution).mkdir(exist_ok=True)
            pending = [c['ticker'] for c in companies if args.refresh or not (ROOT / resolution / (c['ticker'] + '.csv')).exists()]
            for offset in range(0, len(pending), 12):
                batch = pending[offset:offset+12]
                for ticker, error in pool.map(download_one, [(ticker, resolution) for ticker in batch]):
                    if error:
                        errors[f'{ticker}/{resolution}'] = error
                manifest(companies, errors)
                print(f'{resolution}: processed {min(offset+12,len(pending))}/{len(pending)}; failures: {len(errors)}', flush=True)
                time.sleep(1)
    print(f'Catalog saved: {ROOT / "manifest.json"}', flush=True)
    if errors:
        print('Rerun without --refresh to retry missing files.', flush=True)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
