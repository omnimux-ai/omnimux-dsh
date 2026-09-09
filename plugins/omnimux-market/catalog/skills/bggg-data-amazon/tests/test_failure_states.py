import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


scraper = load_module("amazon_review_scraper", ROOT / "scripts/amazon_review_scraper.py")
batch = load_module("run_batch", ROOT / "scripts/run_batch.py")


class FailureStateTests(unittest.TestCase):
    def test_collection_status_distinguishes_empty_success_from_failure(self):
        self.assertEqual(scraper.collection_status([], []), "complete_no_reviews")
        self.assertEqual(
            scraper.collection_status([], [{"http_status": 404}]),
            "failed",
        )

    def test_batch_accepts_successful_empty_result(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "result.json"
            path.write_text(
                json.dumps(
                    {
                        "status": "complete_no_reviews",
                        "request_errors": [],
                        "reviews": [],
                    }
                ),
                encoding="utf-8",
            )
            result = batch.inspect_json(path, "", 0, 0.1)

        self.assertTrue(result["clean"])
        self.assertEqual(result["scrape_status"], "complete_no_reviews")

    def test_batch_rejects_empty_result_after_request_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "result.json"
            path.write_text(
                json.dumps(
                    {
                        "status": "failed",
                        "request_errors": [{"http_status": 404}],
                        "reviews": [],
                    }
                ),
                encoding="utf-8",
            )
            result = batch.inspect_json(
                path,
                "Error (filter=0, sort=0, page=1): HTTP Error 404",
                2,
                0.1,
            )

        self.assertFalse(result["clean"])
        self.assertEqual(result["request_error_count"], 1)


if __name__ == "__main__":
    unittest.main()
