"""Serve the explorer locally with on-demand Yahoo market updates."""
import argparse
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import download_sp500 as market

LOCK = threading.Lock()
BASE = Path(__file__).resolve().parent


def refresh(ticker):
    companies = market.constituents()
    if ticker not in {c['ticker'] for c in companies}:
        raise ValueError('Select a ticker in the S&P 500 catalog.')
    (market.ROOT / 'hourly').mkdir(parents=True, exist_ok=True)
    _, error = market.download_one((ticker, 'hourly'))
    if error:
        raise RuntimeError(error)
    market.manifest(companies, {})


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/refresh':
            self.send_error(404)
            return
        # Accept only same-origin browser requests and bounded JSON bodies.
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            self.send_error(403)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024:
                raise ValueError('Invalid request size.')
            ticker = json.loads(self.rfile.read(length))['ticker']
            if not isinstance(ticker, str):
                raise ValueError('Invalid ticker.')
            with LOCK:
                refresh(ticker)
            self.respond(200, {'message': f'Updated {ticker} with latest available hourly bars.'})
        except (ValueError, KeyError) as error:
            self.respond(400, {'message': str(error)})
        except Exception:
            self.respond(502, {'message': 'Market update failed. Existing data retained; retry later.'})

    def respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    print(f'Open http://localhost:{args.port}/playground/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(BASE))).serve_forever()
