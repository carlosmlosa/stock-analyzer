"""Download adjusted NVIDIA daily or hourly prices from Yahoo Finance."""

import argparse
from pathlib import Path

import yfinance as yf


OUTPUT = Path(__file__).resolve().parent / "data" / "nvda_10y.csv"
HOURLY_OUTPUT = OUTPUT.with_name("nvda_hourly.csv")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", choices=("1d", "1h"), default="1d")
    args = parser.parse_args()
    hourly = args.interval == "1h"
    output = HOURLY_OUTPUT if hourly else OUTPUT
    prices = yf.download(
        "NVDA",
        period="730d" if hourly else "10y",
        interval=args.interval,
        auto_adjust=True,
        prepost=False,
        multi_level_index=False,
        progress=False,
    )
    if prices is None or prices.empty:
        raise RuntimeError("No NVDA prices were returned. Check your internet connection and try again.")

    if hourly:
        # Keep exchange-local timestamps with explicit UTC offsets, including DST.
        prices.index = prices.index.tz_convert("America/New_York")
    output.parent.mkdir(parents=True, exist_ok=True)
    prices.to_csv(output, index_label="Date")
    print(f"Saved {len(prices)} {args.interval} prices to {output}")
    print(f"Range: {prices.index[0]} through {prices.index[-1]}")


if __name__ == "__main__":
    main()
