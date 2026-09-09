#!/usr/bin/env python3
"""Run the bundled Woot/Amazon scraper with retries and attempt reconciliation."""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path


SCRAPER = Path(__file__).with_name("amazon_review_scraper.py")
ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


def compact(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def review_key(row: dict) -> tuple[str, str, str]:
    return (
        compact(row.get("Author")).casefold(),
        compact(row.get("Title")).casefold(),
        compact(row.get("Text")).casefold(),
    )


def read_targets(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    if not rows or "asin" not in rows[0]:
        raise SystemExit("targets must be a TSV with an asin header")
    targets = []
    seen = set()
    for line_number, row in enumerate(rows, 2):
        asin = compact(row.get("asin")).upper()
        mode = compact(row.get("mode") or "basic").lower()
        if not ASIN_RE.fullmatch(asin):
            raise SystemExit(f"line {line_number}: invalid ASIN {asin!r}")
        if mode not in {"basic", "full", "max"}:
            raise SystemExit(f"line {line_number}: invalid mode {mode!r}")
        if asin in seen:
            continue
        seen.add(asin)
        targets.append({**row, "asin": asin, "mode": mode})
    return targets


def inspect_json(path: Path, stderr: str, exit_code: int, elapsed: float) -> dict:
    result = {
        "path": str(path),
        "exit_code": exit_code,
        "elapsed_seconds": round(elapsed, 3),
        "stderr_error_marker": "Error (filter=" in stderr,
        "json_valid": False,
        "review_rows": 0,
        "unique_review_rows": 0,
        "empty_text_rows": 0,
        "scrape_status": None,
        "request_error_count": 0,
        "clean": False,
    }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        reviews = payload.get("reviews")
        if not isinstance(reviews, list):
            raise ValueError("reviews is not a list")
        result["json_valid"] = True
        result["review_rows"] = len(reviews)
        result["unique_review_rows"] = len({review_key(row) for row in reviews})
        result["empty_text_rows"] = sum(not compact(row.get("Text")) for row in reviews)
        result["scrape_status"] = payload.get("status")
        result["request_error_count"] = len(payload.get("request_errors") or [])
    except Exception as exc:
        result["json_error"] = str(exc)
    if result["scrape_status"] is None and result["unique_review_rows"] > 0:
        result["scrape_status"] = "complete"
    result["clean"] = bool(
        exit_code == 0
        and result["json_valid"]
        and not result["stderr_error_marker"]
        and result["scrape_status"] in {"complete", "complete_no_reviews"}
    )
    return result


def reconcile(asin: str, mode: str, attempt_paths: list[Path], final_path: Path) -> dict:
    merged: dict[tuple[str, str, str], dict] = {}
    valid_files = []
    for path in attempt_paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            reviews = payload.get("reviews")
            if not isinstance(reviews, list):
                raise ValueError("reviews is not a list")
        except Exception as exc:
            valid_files.append({"path": str(path), "valid": False, "error": str(exc)})
            continue
        valid_files.append({"path": str(path), "valid": True, "reviews": len(reviews)})
        for review in reviews:
            if compact(review.get("Text")):
                merged.setdefault(review_key(review), review)
    rows = list(merged.values())
    rows.sort(
        key=lambda row: (
            str(row.get("SubmissionDate") or ""),
            compact(row.get("Author")),
            compact(row.get("Title")),
        ),
        reverse=True,
    )
    final_payload = {
        "asin": asin,
        "mode": mode,
        "reviews": rows,
        "reconciliation": {
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "strategy": "union_valid_attempts_then_exact_content_dedupe",
            "input_files": [str(path) for path in attempt_paths],
            "unique_reviews": len(rows),
        },
    }
    final_path.write_text(
        json.dumps(final_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "published_path": str(final_path),
        "input_files": valid_files,
        "unique_reviews": len(rows),
        "star_counts": dict(
            sorted(Counter(str(row.get("OverallRating") or "unknown") for row in rows).items())
        ),
    }


def run_target(target: dict, run_dir: Path, attempts: int, timeout: int) -> dict:
    asin = target["asin"]
    mode = target["mode"]
    result = {"asin": asin, "mode": mode, "attempts": []}
    attempt_paths: list[Path] = []
    for attempt in range(1, attempts + 1):
        json_path = run_dir / f"{asin}_{mode}.attempt{attempt}.json"
        stdout_path = run_dir / f"{asin}_{mode}.attempt{attempt}.stdout.log"
        stderr_path = run_dir / f"{asin}_{mode}.attempt{attempt}.stderr.log"
        started = time.monotonic()
        try:
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRAPER),
                    asin,
                    "--mode",
                    mode,
                    "--output",
                    str(json_path),
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            exit_code = completed.returncode
            stdout = completed.stdout
            stderr = completed.stderr
        except subprocess.TimeoutExpired as exc:
            exit_code = 124
            stdout = exc.stdout or ""
            stderr = (exc.stderr or "") + f"\nTIMEOUT after {timeout} seconds"
        elapsed = time.monotonic() - started
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr, encoding="utf-8")
        inspected = inspect_json(json_path, stderr, exit_code, elapsed)
        inspected.update(
            {
                "attempt": attempt,
                "stdout_log": str(stdout_path),
                "stderr_log": str(stderr_path),
            }
        )
        result["attempts"].append(inspected)
        if inspected["json_valid"] and (
            inspected["unique_review_rows"] > 0
            or inspected["scrape_status"] == "complete_no_reviews"
        ):
            attempt_paths.append(json_path)
        print(
            json.dumps(
                {
                    "asin": asin,
                    "mode": mode,
                    "attempt": attempt,
                    "unique": inspected["unique_review_rows"],
                    "clean": inspected["clean"],
                    "elapsed_seconds": inspected["elapsed_seconds"],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        if inspected["clean"]:
            break
        if attempt < attempts:
            time.sleep((5, 15, 45)[min(attempt - 1, 2)])

    if not attempt_paths:
        result["status"] = "failed"
        return result
    result["reconciliation"] = reconcile(
        asin,
        mode,
        attempt_paths,
        run_dir / f"{asin}_{mode}.json",
    )
    unique_reviews = result["reconciliation"]["unique_reviews"]
    if unique_reviews == 0 and any(
        item["clean"] and item["scrape_status"] == "complete_no_reviews"
        for item in result["attempts"]
    ):
        result["status"] = "complete_no_reviews"
    elif any(
        item["clean"] and item["scrape_status"] == "complete"
        for item in result["attempts"]
    ):
        result["status"] = "complete"
    else:
        result["status"] = "partial_best_available"
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--timeout", type=int, default=360)
    args = parser.parse_args()

    targets = read_targets(args.targets)
    args.run_dir.mkdir(parents=True, exist_ok=True)
    workers = max(1, min(args.workers, 2))
    results = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                run_target,
                target,
                args.run_dir,
                max(1, args.attempts),
                max(30, args.timeout),
            ): target["asin"]
            for target in targets
        }
        for future in as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda item: item["asin"])

    manifest = {
        "schema_version": "1.0",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "scraper": str(SCRAPER),
        "targets_file": str(args.targets),
        "workers": workers,
        "targets": results,
        "complete_targets": sum(
            item["status"] in {"complete", "complete_no_reviews"} for item in results
        ),
        "no_review_targets": sum(
            item["status"] == "complete_no_reviews" for item in results
        ),
        "partial_targets": sum(item["status"] == "partial_best_available" for item in results),
        "failed_targets": sum(item["status"] == "failed" for item in results),
        "unique_sum_before_cross_asin_dedupe": sum(
            (item.get("reconciliation") or {}).get("unique_reviews", 0) for item in results
        ),
    }
    manifest_path = args.run_dir / "acquisition_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "manifest": str(manifest_path),
                "complete_targets": manifest["complete_targets"],
                "no_review_targets": manifest["no_review_targets"],
                "partial_targets": manifest["partial_targets"],
                "failed_targets": manifest["failed_targets"],
                "unique_sum_before_cross_asin_dedupe": manifest[
                    "unique_sum_before_cross_asin_dedupe"
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if manifest["failed_targets"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
