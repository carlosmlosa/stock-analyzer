import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import download_sp500 as downloader


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.patch = patch.object(downloader, 'ROOT', self.root)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.directory.cleanup()

    def test_cached_constituents_normalize_share_class(self):
        (self.root / 'constituents.csv').write_text('Symbol,Security,GICS Sector\nBRK.B,Berkshire Hathaway,Financials\nAAPL,Apple,Technology\n')
        entries = downloader.constituents()
        self.assertEqual(entries[1]['ticker'], 'BRK-B')
        self.assertEqual(entries[1]['symbol'], 'BRK.B')

    def test_hourly_save_retains_local_offsets_and_reports_availability(self):
        (self.root / 'hourly').mkdir()
        frame = pd.DataFrame({'Close': [1., 2., 3., float('nan')]}, index=pd.date_range('2026-01-02 14:30', periods=4, freq='h', tz='UTC'))
        downloader.save_prices(frame, 'AAPL', 'hourly')
        saved = pd.read_csv(self.root / 'hourly' / 'AAPL.csv')
        self.assertEqual(saved.Date.iloc[0], '2026-01-02 09:30:00-05:00')
        downloader.manifest([{'symbol':'AAPL','ticker':'AAPL','name':'Apple','sector':'Technology'}], {})
        catalog = json.loads((self.root / 'manifest.json').read_text())
        self.assertEqual(catalog['companies'][0]['files']['hourly']['rows'], 3)
        self.assertNotIn('daily', catalog['companies'][0]['files'])

    def test_hourly_period_failure_retries_with_explicit_dates(self):
        frame = pd.DataFrame({'Close':[1.,2.,3.]}, index=pd.date_range('2026-01-02', periods=3, freq='h', tz='UTC'))
        with patch.object(downloader.yf, 'download', side_effect=[pd.DataFrame(),frame]) as fetch, patch.object(downloader, 'save_prices') as save:
            self.assertEqual(downloader.download_one(('GEV','hourly')), ('GEV',None))
            self.assertEqual(fetch.call_count,2)
            arguments=fetch.call_args.kwargs
            self.assertEqual(arguments['end']-arguments['start'],pd.Timedelta(days=729))
            save.assert_called_once()

    def hourly_fixture(self):
        (self.root / 'hourly').mkdir()
        frame = pd.DataFrame({'Close': [10., 11., 12.]},
            index=pd.date_range(pd.Timestamp.now(tz='UTC').floor('h') - pd.Timedelta(hours=4), periods=3, freq='h'))
        downloader.save_prices(frame, 'AAPL', 'hourly')
        return frame, self.root / 'hourly' / 'AAPL.csv'

    def test_incremental_request_merges_single_new_bar_and_replaces_overlap(self):
        frame, path = self.hourly_fixture()
        recent = pd.DataFrame({'Close': [13., 14.]},
            index=pd.DatetimeIndex([frame.index[-1], frame.index[-1] + pd.Timedelta(hours=1)]))
        with patch.object(downloader.yf, 'download', return_value=recent) as fetch:
            self.assertEqual(downloader.update_hourly(('AAPL', 'hourly')), ('AAPL', None))
        self.assertEqual(fetch.call_args.kwargs['start'], frame.index[-1])
        self.assertNotIn('period', fetch.call_args.kwargs)
        saved = pd.read_csv(path)
        self.assertEqual(saved.Close.tolist(), [10., 11., 13., 14.])
        self.assertEqual(len(pd.to_datetime(saved.Date, utc=True).unique()), 4)
        self.assertIn('-04:00' if frame.index[-1].tz_convert('America/New_York').dst() else '-05:00', saved.Date.iloc[-1])

    def test_incremental_empty_response_preserves_file(self):
        frame, path = self.hourly_fixture()
        before = path.read_bytes()
        with patch.object(downloader.yf, 'download', return_value=pd.DataFrame()):
            ticker, error = downloader.update_hourly(('AAPL', 'hourly'))
        self.assertIsNotNone(error)
        self.assertEqual(path.read_bytes(), before)

    def test_incremental_invalid_prices_preserve_file(self):
        frame, path = self.hourly_fixture()
        before = path.read_bytes()
        with patch.object(downloader.yf, 'download', return_value=pd.DataFrame({'Close': ['bad']}, index=frame.index[:1])):
            ticker, error = downloader.update_hourly(('AAPL', 'hourly'))
        self.assertIsNotNone(error)
        self.assertEqual(path.read_bytes(), before)

    def test_incremental_missing_file_downloads_initial_history(self):
        with patch.object(downloader, 'download_one', return_value=('NEW', None)) as download:
            self.assertEqual(downloader.update_hourly(('NEW', 'hourly')), ('NEW', None))
        download.assert_called_once_with(('NEW', 'hourly'))

    def test_incremental_stale_file_limits_request_and_keeps_old_history(self):
        frame, path = self.hourly_fixture()
        old = frame.copy()
        old.index = old.index - pd.Timedelta(days=900)
        downloader.save_prices(old, 'AAPL', 'hourly')
        with patch.object(downloader.yf, 'download', return_value=frame.iloc[-1:]) as fetch:
            self.assertEqual(downloader.update_hourly(('AAPL', 'hourly')), ('AAPL', None))
        args = fetch.call_args.kwargs
        self.assertEqual(args['end'] - args['start'], pd.Timedelta(days=729))
        self.assertEqual(len(pd.read_csv(path)), 4)

    def test_bad_response_does_not_replace_good_file(self):
        (self.root / 'daily').mkdir()
        path = self.root / 'daily' / 'AAPL.csv'
        path.write_text('previous data')
        frame = pd.DataFrame({'Close':[float('nan')]}, index=pd.date_range('2026-01-01', periods=1))
        with self.assertRaises(ValueError):
            downloader.save_prices(frame, 'AAPL', 'daily')
        self.assertEqual(path.read_text(), 'previous data')


if __name__ == '__main__':
    unittest.main()
