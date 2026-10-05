import unittest
from unittest.mock import patch
import server


class RefreshTests(unittest.TestCase):
    @patch('server.market.constituents', return_value=[{'ticker': 'NVDA'}])
    @patch('server.market.download_one')
    def test_unknown_ticker_never_downloads(self, download, constituents):
        with self.assertRaises(ValueError):
            server.refresh('../unexpected')
        download.assert_not_called()

    @patch('server.market.manifest')
    @patch('server.market.download_one', return_value=('NVDA', 'Provider unavailable'))
    @patch('server.market.constituents', return_value=[{'ticker': 'NVDA'}])
    def test_failure_never_rewrites_manifest(self, constituents, download, manifest):
        with self.assertRaises(RuntimeError):
            server.refresh('NVDA')
        manifest.assert_not_called()
