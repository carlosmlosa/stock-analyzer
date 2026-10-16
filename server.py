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


def refresh():
    (market.ROOT / 'hourly').mkdir(parents=True, exist_ok=True)
    companies = market.constituents()
    errors = {}
    updated = 0
    # Use isolated workers, as in the CLI, to avoid shared yfinance cache locks.
    with market.ProcessPoolExecutor(
        max_workers=4, mp_context=market.multiprocessing.get_context('spawn'),
        initializer=market.initialize_worker,
    ) as pool:
        for offset in range(0, len(companies), 12):
            batch = companies[offset:offset + 12]
            tasks = [(company['ticker'], 'hourly') for company in batch]
            for ticker, error in pool.map(market.update_hourly, tasks):
                if error:
                    errors[f'{ticker}/hourly'] = error
                else:
                    updated += 1
            market.manifest(companies, errors)
            if offset + 12 < len(companies):
                market.time.sleep(1)
    message = f'Updated {updated} of {len(companies)} symbols with recent hourly bars.'
    if errors:
        message += f' {len(errors)} failed; existing prices retained for those symbols. Retry to update them.'
    return {'message': message, 'updated': updated, 'total': len(companies), 'errors': errors}


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
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Expected a JSON object.')
            if not LOCK.acquire(blocking=False):
                self.respond(409, {'message': 'A market update is already running. Try again later.'})
                return
            try:
                result = refresh()
            finally:
                LOCK.release()
            self.respond(200, result)
        except (ValueError, KeyError) as error:
            self.respond(400, {'message': str(error)})
        except Exception:
            self.respond(502, {'message': 'Market update interrupted. Completed downloads are retained; retry to finish all symbols.'})

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
