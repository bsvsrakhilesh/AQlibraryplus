from __future__ import annotations

import pathlib
import sys
import unittest
import json
from types import SimpleNamespace
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from structured_intelligence import (  # noqa: E402
    _exact_source_anchor,
    _extract_llm,
    _items_from_structured,
    _make_payload,
    _run_entailment_critic,
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
        self.assertEqual(payload["mapCoverage"]["mode"], "deterministic_only")
        self.assertFalse(payload["mapCoverage"]["complete"])

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

    def test_exact_evidence_anchor_preserves_original_source_span(self) -> None:
        source = "The order may   restrict construction in Gurugram."
        anchor = _exact_source_anchor(
            {"quote": "order may restrict construction", "page": 7},
            [{"text": source, "locator": {"kind": "page", "pageNumber": 7}}],
        )

        self.assertIsNotNone(anchor)
        assert anchor is not None
        self.assertEqual(anchor["quote"], "order may   restrict construction")
        self.assertEqual(
            source[anchor["charStart"] : anchor["charEnd"]],
            anchor["quote"],
        )
        self.assertEqual(anchor["page"], 7)

    def test_legacy_structured_labels_require_an_exact_source_anchor(self) -> None:
        source = "Delhi and Gurugram are covered by the order."
        structured = {
            "labels": {
                "geography": [
                    {"value": "Delhi", "evidence": "Delhi and Gurugram"},
                    {"value": "Noida", "evidence": "Noida is covered"},
                ]
            }
        }
        items = _items_from_structured(
            structured,
            [{"text": source, "locator": {"kind": "page", "pageNumber": 2}}],
        )

        self.assertEqual([item["label"] for item in items], ["Delhi"])
        evidence = items[0]["evidence"][0]
        self.assertEqual(source[evidence["charStart"] : evidence["charEnd"]], evidence["quote"])

    def test_category_batched_map_preserves_dense_location_output(self) -> None:
        sentences = [f"Location {index} is explicitly named." for index in range(125)]
        source = " ".join(sentences)

        class FakeCompletions:
            def create(self, **kwargs):
                prompt = kwargs["messages"][-1]["content"]
                items = []
                if "locations" in prompt.split("Document text", 1)[0]:
                    items = [
                        {
                            "id": f"location-{index}",
                            "label": f"Location {index}",
                            "type": "location",
                            "category": "locations",
                            "normalizedValue": f"location_{index}",
                            "confidence": 0.95,
                            "source": "llm",
                            "evidence": [
                                {
                                    "quote": sentence,
                                    "page": 1,
                                    "section": None,
                                    "locator": None,
                                }
                            ],
                            "locator": None,
                            "status": "matched",
                        }
                        for index, sentence in enumerate(sentences)
                    ]
                payload = {
                    "profile": "structured_intelligence",
                    "version": 1,
                    "domain": "air_quality_governance",
                    "items": items,
                }
                return SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            finish_reason="stop",
                            message=SimpleNamespace(
                                content=json.dumps(payload), refusal=None
                            ),
                        )
                    ]
                )

        client = SimpleNamespace(
            chat=SimpleNamespace(completions=FakeCompletions())
        )
        with (
            mock.patch("structured_intelligence._has_llm_key", return_value=True),
            mock.patch("structured_intelligence._client", return_value=client),
        ):
            payload = _extract_llm(
                content=source,
                file_name="dense.pdf",
                deterministic=_make_payload([]),
                grounding_units=[
                    {
                        "text": source,
                        "locator": {"kind": "page", "pageNumber": 1},
                    }
                ],
            )

        self.assertEqual(len(payload["locations"]), 125)
        self.assertTrue(payload["mapCoverage"]["complete"])
        self.assertEqual(payload["mapCoverage"]["failedWindows"], 0)
        self.assertTrue(
            all(receipt.get("operationId") for receipt in payload["mapCoverage"]["receipts"])
        )

    def test_entailment_critic_rejects_contradicted_claim_automatically(self) -> None:
        class FakeCompletions:
            def create(self, **_kwargs):
                payload = {
                    "items": [
                        {
                            "id": "restriction-1",
                            "verdict": "contradicted",
                            "reason": "The evidence describes a proposal, not an adopted ban.",
                        }
                    ]
                }
                return SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            finish_reason="stop",
                            message=SimpleNamespace(
                                content=json.dumps(payload), refusal=None
                            ),
                        )
                    ]
                )

        item = {
            "id": "restriction-1",
            "label": "Construction prohibited",
            "type": "restriction",
            "category": "restrictions",
            "evidence": [{"quote": "Officials reviewed a proposal to restrict construction."}],
            "validation": {"grounding": "exact_source_span", "entailment": "pending"},
        }
        accepted, receipts, succeeded, failed, rejected = _run_entailment_critic(
            client=SimpleNamespace(
                chat=SimpleNamespace(completions=FakeCompletions())
            ),
            items=[item],
        )

        self.assertEqual(accepted, [])
        self.assertEqual((succeeded, failed, rejected), (1, 0, 1))
        self.assertEqual(receipts[0]["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()
