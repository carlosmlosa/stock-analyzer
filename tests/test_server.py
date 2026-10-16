import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import server


class RefreshTests(unittest.TestCase):
    def run_refresh(self, results):
        companies = [{'ticker': ticker} for ticker, error in results]
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(server.market, 'ROOT', Path(directory)), \
                patch.object(server.market, 'constituents', return_value=companies), \
                patch.object(server.market, 'ProcessPoolExecutor') as executor, \
                patch.object(server.market, 'manifest') as manifest:
            pool = executor.return_value.__enter__.return_value
            pool.map.return_value = results
            result = server.refresh()
            pool.map.assert_called_once_with(server.market.update_hourly,
                [(company['ticker'], 'hourly') for company in companies])
            manifest.assert_called_once_with(companies, result['errors'])
            self.assertEqual(executor.call_args.kwargs['max_workers'], 4)
            return result

    def test_refresh_downloads_every_symbol(self):
        result = self.run_refresh([('NVDA', None), ('AAPL', None)])
        self.assertEqual((result['updated'], result['total']), (2, 2))
        self.assertEqual(result['errors'], {})

    def test_partial_failure_keeps_successes_and_reports_failed_symbols(self):
        result = self.run_refresh([('NVDA', 'Provider unavailable'), ('AAPL', None)])
        self.assertEqual((result['updated'], result['total']), (1, 2))
        self.assertEqual(result['errors'], {'NVDA/hourly': 'Provider unavailable'})
        self.assertIn('existing prices retained', result['message'])

    def test_all_failures_are_reported(self):
        result = self.run_refresh([('NVDA', 'Provider unavailable')])
        self.assertEqual(result['updated'], 0)
        self.assertIn('1 failed', result['message'])

    def handler(self, body=b'{}'):
        handler = Mock()
        handler.path = '/api/refresh'
        handler.headers = {'Content-Length': str(len(body))}
        handler.rfile = io.BytesIO(body)
        return handler

    @patch('server.refresh', return_value={'message': 'Updated all symbols.'})
    def test_endpoint_accepts_all_symbols_request(self, refresh):
        handler = self.handler()
        server.Handler.do_POST(handler)
        refresh.assert_called_once_with()
        handler.respond.assert_called_once_with(200, refresh.return_value)
        self.assertFalse(server.LOCK.locked())

    @patch('server.refresh')
    def test_duplicate_update_is_rejected(self, refresh):
        handler = self.handler()
        with server.LOCK:
            server.Handler.do_POST(handler)
        refresh.assert_not_called()
        self.assertEqual(handler.respond.call_args.args[0], 409)

    @patch('server.refresh', side_effect=RuntimeError('Worker failed'))
    def test_interrupted_refresh_releases_lock(self, refresh):
        handler = self.handler()
        server.Handler.do_POST(handler)
        self.assertEqual(handler.respond.call_args.args[0], 502)
        self.assertFalse(server.LOCK.locked())

    @patch('server.refresh')
    def test_invalid_body_never_downloads(self, refresh):
        handler = self.handler(b'[]')
        server.Handler.do_POST(handler)
        self.assertEqual(handler.respond.call_args.args[0], 400)
        refresh.assert_not_called()
