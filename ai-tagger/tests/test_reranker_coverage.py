from __future__ import annotations

import json
import pathlib
import re
import sys
import unittest
from types import SimpleNamespace
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import reranker  # noqa: E402


class FakeCompletions:
    def create(self, **kwargs):
        prompt = kwargs["messages"][-1]["content"]
        values = re.findall(r'"value":\s*"([^"]+)"', prompt)
        selected = values[-1] if values else ""
        payload = {
            "tags": [
                {
                    "value": selected,
                    "reason": "Strong candidate from this complete map batch.",
                    "source": "semantic_candidate",
                }
            ]
        }
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(content=json.dumps(payload), refusal=None),
                )
            ]
        )


class RerankerCoverageTests(unittest.TestCase):
    def test_candidate_after_old_220_cutoff_is_mapped(self) -> None:
        candidates = [
            {
                "value": f"Candidate {index}",
                "source": "semantic_candidate",
                "confidence": 0.7,
            }
            for index in range(350)
        ]
        client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))
        with (
            mock.patch.object(reranker, "has_llm_key", return_value=True),
            mock.patch.object(reranker, "_openai_client", return_value=(client, "test-model")),
        ):
            tags = reranker.rerank_with_llm(candidates, topk=20)

        self.assertIn("Candidate 349", tags)


if __name__ == "__main__":
    unittest.main()
