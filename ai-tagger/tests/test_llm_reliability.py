from __future__ import annotations

import json
import pathlib
import sys
import unittest
from types import SimpleNamespace


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from llm_reliability import execute_json_completion, stable_operation_id  # noqa: E402


def response(payload, *, finish_reason="stop"):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason=finish_reason,
                message=SimpleNamespace(content=json.dumps(payload), refusal=None),
            )
        ]
    )


class LlmReliabilityTests(unittest.TestCase):
    def test_transient_invalid_json_retries_with_same_operation_id(self) -> None:
        calls = []
        op_id = stable_operation_id("page-9", ["locations"])

        def request():
            calls.append(op_id)
            if len(calls) == 1:
                return SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            finish_reason="stop",
                            message=SimpleNamespace(content="not-json", refusal=None),
                        )
                    ]
                )
            return response({"items": [{"id": "x"}]})

        outcome = execute_json_completion(
            operation_id=op_id,
            request=request,
            retry_base_seconds=0,
        )

        self.assertEqual(calls, [op_id, op_id])
        self.assertEqual(outcome.receipt["status"], "succeeded")
        self.assertEqual(outcome.receipt["attempts"], 2)

    def test_output_limit_is_reported_for_adaptive_split(self) -> None:
        outcome = execute_json_completion(
            operation_id="op_dense",
            request=lambda: response({}, finish_reason="length"),
            retry_base_seconds=0,
        )

        self.assertIsNone(outcome.payload)
        self.assertEqual(outcome.receipt["attempts"], 1)
        self.assertEqual(outcome.receipt["errorCode"], "output_incomplete")

    def test_operation_ids_are_stable_and_input_sensitive(self) -> None:
        first = stable_operation_id("page-1", ["locations"])
        self.assertEqual(first, stable_operation_id("page-1", ["locations"]))
        self.assertNotEqual(first, stable_operation_id("page-2", ["locations"]))


if __name__ == "__main__":
    unittest.main()
