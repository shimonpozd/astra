#!/usr/bin/env python3
"""Export merged config into a legacy .env file.

Usage:
    python scripts/export_env_from_config.py --output .env.runtime
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import flatten_to_env, load_config


def build_env_lines(separator: str = '_') -> list[str]:
    config = load_config()
    env_map = flatten_to_env(config, separator=separator)
    lines: list[str] = []
    for key in sorted(env_map):
        value = env_map[key]
        # Keep empty values as empty strings
        lines.append(f"{key}={value}")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export TOML config to .env format")
    parser.add_argument("--output", "-o", type=Path, default=Path(".env.runtime"), help="Output file path")
    parser.add_argument("--separator", "-s", default="_", help="Separator when flattening keys (default: '_')")
    parser.add_argument("--stdout", action="store_true", help="Print result to stdout instead of writing file")

    args = parser.parse_args(argv)

    lines = build_env_lines(separator=args.separator)

    if args.stdout:
        for line in lines:
            print(line)
        return 0

    output_path: Path = args.output
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[export-env] wrote {len(lines)} entries to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


