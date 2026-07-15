from __future__ import annotations

import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from structured_intelligence import (  # noqa: E402
    _make_payload,
    extract_structured_intelligence_deterministic,
)


class StructuredIntelligenceTests(unittest.TestCase):
    def extract(self, text: str):
        return extract_structured_intelligence_deterministic(
            content=text,
            grounding_units=[
                {
                    "text": text,
                    "locator": {"kind": "page", "pageNumber": 1},
                }
            ],
        )

    def test_extracts_multiple_grap_stages_without_collapse(self) -> None:
        payload = self.extract(
            """
            Commission for Air Quality Management reviewed actions under GRAP
            Stage I, II and III on the first page. Measures under Stage I and
            Stage II continue, while Stage III restrictions are invoked.
            """
        )

        stages = {
            item["normalizedValue"]
            for item in payload["programStages"]
        }

        self.assertIn("grap_stage_i", stages)
        self.assertIn("grap_stage_ii", stages)
        self.assertIn("grap_stage_iii", stages)
        self.assertGreaterEqual(len(payload["programStages"]), 3)
        self.assertTrue(all(item["evidence"] for item in payload["programStages"]))

    def test_extracts_governance_references_requirements_and_measurements(self) -> None:
        payload = self.extract(
            """
            Direction No. 15/2024 was issued by CAQM for Delhi-NCR on
            12 February 2024. CPCB and DPCC are directed to submit compliance
            reports within 7 days. The order prohibits open burning and requires
            monitoring where AQI 401 and PM10 levels are recorded.
            """
        )

        self.assertTrue(payload["legalReferences"])
        self.assertTrue(payload["requirements"])
        self.assertTrue(payload["restrictions"])
        self.assertTrue(payload["pollutantsMeasurements"])
        self.assertTrue(payload["datesDeadlines"])
        self.assertTrue(payload["agencies"])
        self.assertTrue(payload["locations"])
        self.assertTrue(all(item["evidence"] for item in payload["items"]))

    def test_does_not_drop_location_after_page_ninety(self) -> None:
        units = [
            {
                "text": "Routine policy text" if page != 95 else "A meeting was held in Punjab.",
                "locator": {"kind": "page", "pageNumber": page},
            }
            for page in range(1, 101)
        ]
        payload = extract_structured_intelligence_deterministic(
            content="\n".join(unit["text"] for unit in units),
            grounding_units=units,
        )
        locations = {item["normalizedValue"] for item in payload["locations"]}
        self.assertIn("punjab", locations)
        punjab = next(item for item in payload["locations"] if item["normalizedValue"] == "punjab")
        self.assertEqual(punjab["evidence"][0]["page"], 95)

    def test_structured_categories_are_not_silently_capped_at_eighty(self) -> None:
        payload = _make_payload(
            {
                "id": f"location-{index}",
                "label": f"Location {index}",
                "type": "location",
                "category": "locations",
                "normalizedValue": f"location_{index}",
                "confidence": 0.9,
                "source": "test",
                "evidence": [{"quote": f"Location {index} is explicitly named."}],
                "status": "matched",
            }
            for index in range(100)
        )
        self.assertEqual(len(payload["locations"]), 100)
        self.assertEqual(len(payload["items"]), 100)


if __name__ == "__main__":
    unittest.main()
