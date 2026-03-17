#!/usr/bin/env python3

from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from datetime import datetime, timedelta

DATE_FORMAT = "%m/%d/%y"


def parse_date(value: str) -> datetime:
    try:
        return datetime.strptime(value, DATE_FORMAT)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid date '{value}'. Expected format is MM/DD/YY."
        ) from exc


def iter_dates(start: datetime, end: datetime):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def build_command(puzzle_id: str, date_value: datetime) -> list[str]:
    return ["xword-dl", puzzle_id, "--date", date_value.strftime(DATE_FORMAT)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate one xword-dl command per day across an inclusive date range."
        )
    )
    parser.add_argument("puzzle_id", help="Puzzle source ID to pass to xword-dl.")
    parser.add_argument(
        "start_date",
        type=parse_date,
        help="Start date in MM/DD/YY format.",
    )
    parser.add_argument(
        "end_date",
        type=parse_date,
        help="End date in MM/DD/YY format.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Run each command instead of only printing it.",
    )
    args = parser.parse_args()

    if args.end_date < args.start_date:
        parser.error("end_date must be on or after start_date.")

    commands = [
        build_command(args.puzzle_id, date_value)
        for date_value in iter_dates(args.start_date, args.end_date)
    ]

    if not args.execute:
        for command in commands:
            print(" ".join(shlex.quote(part) for part in command))
        return 0

    for command in commands:
        print("Running:", " ".join(shlex.quote(part) for part in command))
        result = subprocess.run(command, check=False)
        if result.returncode != 0:
            return result.returncode

    return 0


if __name__ == "__main__":
    sys.exit(main())
