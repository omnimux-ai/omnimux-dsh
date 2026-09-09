#!/usr/bin/env python3
"""Normalize reconciled Woot/Amazon review outputs into auditable JSONL."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


DATE_PATTERNS = (
    (
        re.compile(r"\bon\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b"),
        ("%B %d, %Y", "%B %d %Y"),
    ),
    (
        re.compile(r"\bon\s+(\d{1,2})\.\s*([A-Z][a-z]+)\s+(\d{4})\b"),
        ("european",),
    ),
)


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_date(raw: str) -> str | None:
    if not raw:
        return None
    match = DATE_PATTERNS[0][0].search(raw)
    if match:
        value = re.sub(r"\s+", " ", match.group(1).strip())
        for fmt in DATE_PATTERNS[0][1]:
            try:
                return datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                pass
    match = DATE_PATTERNS[1][0].search(raw)
    if match:
        try:
            return datetime.strptime(
                f"{match.group(2)} {match.group(1)} {match.group(3)}",
                "%B %d %Y",
            ).date().isoformat()
        except ValueError:
            pass
    return None


def content_key(review: dict[str, Any]) -> str:
    payload = "\n".join(
        compact(review.get(field)).casefold() for field in ("Author", "Title", "Text")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def read_targets(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    return {
        compact(row.get("asin")).upper(): {
            "mode": compact(row.get("mode") or "basic").lower(),
            "lang": compact(row.get("lang") or "EN").upper(),
            "title": compact(row.get("title")) or None,
        }
        for row in rows
        if compact(row.get("asin"))
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--targets", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--keywords", type=Path)
    parser.add_argument("--round", type=int, default=1)
    args = parser.parse_args()

    targets = read_targets(args.targets)
    keywords = []
    if args.keywords:
        keywords = [
            line.strip()
            for line in args.keywords.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    merged: dict[str, dict[str, Any]] = {}
    input_by_asin = Counter()
    skipped_empty_text = 0
    duplicate_occurrences = 0
    date_parse_failures = 0
    selected_files = {}

    for asin, meta in sorted(targets.items()):
        path = args.run_dir / f"{asin}_{meta['mode']}.json"
        if not path.exists():
            continue
        selected_files[asin] = str(path)
        payload = json.loads(path.read_text(encoding="utf-8"))
        reviews = payload.get("reviews")
        if not isinstance(reviews, list):
            continue
        for review in reviews:
            input_by_asin[asin] += 1
            body = str(review.get("Text") or "").strip()
            title = str(review.get("Title") or "").strip()
            if not compact(body):
                skipped_empty_text += 1
                continue
            key = content_key(review)
            date_raw = compact(review.get("OriginDescription"))
            date = parse_date(date_raw)
            if date_raw and date is None:
                date_parse_failures += 1
            text = f"{title}\n\n{body}".strip()
            if key in merged:
                duplicate_occurrences += 1
                merged[key]["context"]["asins"] = sorted(
                    set(merged[key]["context"]["asins"] + [asin])
                )
                titles = merged[key]["context"]["product_titles"]
                if meta["title"] and meta["title"] not in titles:
                    titles.append(meta["title"])
                continue
            lowered = text.casefold()
            merged[key] = {
                "platform": "Amazon",
                "lang": meta["lang"],
                "source_id": key[:24],
                "native_id": review.get("Id"),
                "date": date,
                "date_raw": date_raw or None,
                "text_raw": text,
                "engagement": {
                    "stars": review.get("OverallRating"),
                    "helpful": review.get("HelpfulVotes"),
                    "verified": bool(review.get("IsVerifiedPurchase")),
                    "vine": bool(review.get("IsVineReview")),
                    "image_urls": review.get("ImageUrls") or [],
                    "media_urls": review.get("MediaUrls") or [],
                },
                "context": {
                    "content_type": "review",
                    "asins": [asin],
                    "product_titles": [meta["title"]] if meta["title"] else [],
                    "author": compact(review.get("Author")) or None,
                    "source_route": "woot_ajax",
                    "source_file": str(path),
                },
                "keyword_hit": [word for word in keywords if word.casefold() in lowered],
                "round": args.round,
            }

    rows = sorted(
        merged.values(),
        key=lambda row: ((row.get("date") or ""), row["source_id"]),
        reverse=True,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

    summary = {
        "selected_files": selected_files,
        "input_reviews_by_asin": dict(sorted(input_by_asin.items())),
        "input_reviews_total": sum(input_by_asin.values()),
        "output_unique_reviews": len(rows),
        "skipped_empty_text": skipped_empty_text,
        "duplicate_occurrences_merged": duplicate_occurrences,
        "date_parse_failures": date_parse_failures,
        "native_id_null": sum(row["native_id"] is None for row in rows),
        "output": str(args.output),
    }
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
