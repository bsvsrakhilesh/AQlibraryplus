from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from policy_taxonomy import classify_structured, validate_structured  # noqa: E402
from extractors import _normalize_text  # noqa: E402
from structured_intelligence import (  # noqa: E402
    build_structured_intelligence,
    extract_structured_intelligence_deterministic,
)
import pipeline  # noqa: E402


NEWS_TEXT = """Title: On last day of House session, BJP govt. blames Opposition for pollution
URL: https://www.thehindu.com/news/cities/Delhi/example.ece
Photo Credit: Sushil Kumar Verma
The final day of the Winter Session of the Delhi Assembly saw an exchange over
the air pollution crisis. The Minister said the odd-even scheme failed and the
Pollution Under Control system remained weak. Required air-quality monitoring
stations were not installed. Funds were released to the Municipal Corporation
of Delhi (MCD) for garbage mountains and road-cleaning efforts.
The World Health Organization (WHO) published an assessment.
Published - January 10, 2026 01:49 am IST
"""


def values(payload: dict, key: str) -> set[str]:
    return {
        str(item.get("value"))
        for item in payload.get("labels", {}).get(key, [])
        if isinstance(item, dict)
    }


class StructuredAccuracyTests(unittest.TestCase):
    def test_removes_mojibake_separator_without_dropping_non_latin_text(self) -> None:
        noisy = "鈥斺€斺€斺€斺€斺€斺€斺€斺€斺€斺€斺€\nदिल्ली में वायु प्रदूषण\nUseful text"
        cleaned = _normalize_text(noisy)
        self.assertNotIn("鈥斺€", cleaned)
        self.assertIn("दिल्ली में वायु प्रदूषण", cleaned)
        self.assertIn("Useful text", cleaned)

    def test_news_article_closed_taxonomy_is_precise(self) -> None:
        payload = classify_structured(NEWS_TEXT, file_name="article.txt", tags=[])

        self.assertEqual(payload["docType"]["value"], "news_article")
        self.assertEqual(values(payload, "agencies"), {"mcd"})
        self.assertEqual(values(payload, "geography"), {"delhi"})
        self.assertEqual(
            values(payload, "sectors"),
            {"transport", "road_dust", "municipal_waste"},
        )
        self.assertEqual(values(payload, "programs"), set())
        self.assertEqual(values(payload, "pollutants"), set())
        self.assertFalse(payload["grap"]["mentioned"])
        self.assertIn("January 10, 2026", payload["entities"]["dates"])

        intelligence = extract_structured_intelligence_deterministic(
            content=NEWS_TEXT,
            structured=payload,
        )
        agencies = {item["normalizedValue"] for item in intelligence["agencies"]}
        self.assertEqual(
            agencies,
            {"delhi_assembly", "mcd", "world_health_organization"},
        )

    def test_rejects_semantic_llm_drift_and_regrounds_evidence(self) -> None:
        hallucinated = {
            "docType": {
                "value": "minutes",
                "score": 0.9,
                "evidence": "The final day of the Winter Session",
            },
            "labels": {
                "sectors": [
                    {"value": "construction_demolition", "score": 0.5, "evidence": "road-cleaning efforts"},
                    {"value": "industry_power", "score": 0.5, "evidence": "Pollution Under Control"},
                ],
                "agencies": [
                    {"value": "cpcb", "score": 0.5, "evidence": "Pollution Under Control"},
                    {"value": "imd", "score": 0.5, "evidence": "global agencies"},
                ],
                "geography": [
                    {"value": "ncr", "score": 0.5, "evidence": "national capital"},
                ],
                "programs": [
                    {"value": "grap", "score": 0.5, "evidence": "odd-even scheme"},
                ],
                "pollutants": [
                    {"value": "pm25", "score": 0.5, "evidence": "air pollution"},
                    {"value": "pm10", "score": 0.5, "evidence": "air pollution"},
                    {"value": "no2", "score": 0.5, "evidence": "air pollution"},
                ],
            },
            "grap": {
                "mentioned": True,
                "stage": "I",
                "stages": [{"value": "I", "score": 0.5, "evidence": "odd-even scheme"}],
                "evidence": "odd-even scheme",
            },
            "entities": {},
        }

        payload = validate_structured(hallucinated, NEWS_TEXT)

        self.assertIsNone(payload["docType"]["value"])
        self.assertTrue(all(not items for items in payload["labels"].values()))
        self.assertFalse(payload["grap"]["mentioned"])

    def test_co_does_not_match_word_prefixes(self) -> None:
        text = (
            "The Minister called it a complete failure. The Comptroller noted "
            "that the Pollution Under Control system remained weak."
        )
        payload = extract_structured_intelligence_deterministic(content=text)
        pollutants = {
            item["normalizedValue"] for item in payload["pollutantsMeasurements"]
        }
        self.assertNotIn("co", pollutants)

    def test_generic_stage_does_not_create_grap(self) -> None:
        text = "Stage I of the building project is complete; Stage II begins next month."
        structured = classify_structured(text, tags=[])
        intelligence = extract_structured_intelligence_deterministic(content=text)
        self.assertFalse(structured["grap"]["mentioned"])
        self.assertEqual(intelligence["programStages"], [])

    def test_llm_closed_category_requires_deterministic_support(self) -> None:
        llm_payload = {
            "agencies": [
                {
                    "id": "fake-cpcb",
                    "label": "CPCB",
                    "type": "agency",
                    "category": "agencies",
                    "normalizedValue": "cpcb",
                    "confidence": 0.95,
                    "source": "llm",
                    "evidence": [{"quote": "The Pollution Under Control system remained weak."}],
                    "locator": {"kind": "document"},
                    "status": "matched",
                },
                {
                    "id": "explicit-who",
                    "label": "WHO",
                    "type": "agency",
                    "category": "agencies",
                    "normalizedValue": "who",
                    "confidence": 0.92,
                    "source": "llm",
                    "evidence": [{"quote": "The World Health Organization (WHO) published an assessment."}],
                    "locator": {"kind": "document"},
                    "status": "matched",
                },
            ],
            "items": [],
        }
        with patch("structured_intelligence._extract_llm", return_value=llm_payload):
            payload = build_structured_intelligence(
                content=NEWS_TEXT,
                allow_llm=True,
            )
        agencies = {item["normalizedValue"] for item in payload["agencies"]}
        self.assertIn("mcd", agencies)
        self.assertIn("who", agencies)
        self.assertNotIn("cpcb", agencies)

    def test_open_vocabulary_location_is_accepted_when_explicitly_grounded(self) -> None:
        text = "The inspection team visited Gurugram on 12 February 2024."
        llm_payload = {
            "locations": [
                {
                    "id": "location-gurugram",
                    "label": "Gurugram",
                    "type": "location",
                    "category": "locations",
                    "normalizedValue": "gurugram",
                    "confidence": 0.96,
                    "source": "llm",
                    "evidence": [{"quote": text, "page": 1}],
                    "locator": {"kind": "page", "pageNumber": 1},
                    "status": "matched",
                }
            ],
            "items": [],
        }
        with patch("structured_intelligence._extract_llm", return_value=llm_payload):
            payload = build_structured_intelligence(
                content=text,
                grounding_units=[
                    {"text": text, "locator": {"kind": "page", "pageNumber": 1}}
                ],
                allow_llm=True,
            )
        self.assertIn(
            "gurugram",
            {item["normalizedValue"] for item in payload["locations"]},
        )

    def test_combined_pipeline_filters_llm_before_merge(self) -> None:
        llm_structured = {
            "docType": {"value": "minutes", "score": 0.95, "evidence": "Winter Session"},
            "labels": {
                "sectors": [],
                "agencies": [
                    {"value": "cpcb", "score": 0.95, "evidence": "Pollution Under Control system"}
                ],
                "geography": [{"value": "ncr", "score": 0.9, "evidence": "national capital"}],
                "programs": [{"value": "grap", "score": 0.9, "evidence": "odd-even scheme"}],
                "pollutants": [{"value": "pm25", "score": 0.9, "evidence": "air pollution"}],
            },
            "grap": {
                "mentioned": True,
                "stage": "I",
                "stages": [{"value": "I", "score": 0.9, "evidence": "odd-even scheme"}],
                "evidence": "odd-even scheme",
            },
            "entities": {
                "directionNumbers": [],
                "orderNumbers": [],
                "referenceNumbers": [],
                "dates": [],
            },
        }
        with (
            patch.object(pipeline, "has_structured_llm", return_value=True),
            patch.object(pipeline, "extract_structured_with_llm", return_value=llm_structured),
            patch.object(pipeline, "get_structured_model", return_value="test-model"),
            patch.object(pipeline, "extract_governance_with_llm", return_value=None),
        ):
            structured, used, *_ = pipeline._classify_structured_combined(
                content=NEWS_TEXT,
                file_name="article.txt",
                tags=[],
                extraction=None,
                grounding_units=[{"text": NEWS_TEXT, "locator": {"kind": "document"}}],
                allow_llm=True,
            )

        self.assertTrue(used)
        self.assertEqual(structured["docType"]["value"], "news_article")
        self.assertEqual(values(structured, "agencies"), {"mcd"})
        self.assertEqual(values(structured, "programs"), set())
        self.assertEqual(values(structured, "pollutants"), set())


if __name__ == "__main__":
    unittest.main()
