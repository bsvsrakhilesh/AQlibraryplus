# ai-tagger/reranker.py
"""
LLM-assisted tag reranking.

World-class principle for this module:
- The LLM may rank, merge, and clean candidates.
- The LLM must not silently erase high-signal deterministic terms.
- The output remains backward-compatible: List[str].
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Mapping, Optional, Sequence, Union

try:
    from llm_reliability import execute_json_completion, stable_operation_id  # type: ignore
except ImportError:  # pragma: no cover - package import fallback
    from .llm_reliability import execute_json_completion, stable_operation_id  # type: ignore

try:
    from openai_compat import chat_completion_kwargs  # type: ignore
except ImportError:  # pragma: no cover - package import fallback
    from .openai_compat import chat_completion_kwargs  # type: ignore

CandidateInput = Union[str, Mapping[str, Any]]

_HIGH_SIGNAL_SOURCES = {
    "structured",
    "taxonomy",
    "filename",
    "url_title",
}

_PROTECTED_SIGNAL_RE = re.compile(
    r"\b(?:CAQM|CPCB|DPCC|SPCB|IMD|NGT|MoEFCC|GRAP|AQI|PM\s*2\.?5|PM\s*10|NO2|O3|CO|Direction\s+No\.?|Order\s+No\.?|Reference\s+No\.?)\b",
    re.IGNORECASE,
)


def has_llm_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY"))


def get_llm_model() -> str:
    return os.getenv("LLM_MODEL", "gpt-4o-mini")


def _clean_text(value: Any, limit: int = 160) -> str:
    s = " ".join(str(value or "").replace("\u2026", " ").split()).strip()
    return s[:limit]


def _candidate_value(candidate: CandidateInput) -> str:
    if isinstance(candidate, Mapping):
        return _clean_text(
            candidate.get("value") or candidate.get("tag") or candidate.get("text"),
            120,
        )
    return _clean_text(candidate, 120)


def _candidate_source(candidate: CandidateInput) -> str:
    if isinstance(candidate, Mapping):
        return _clean_text(candidate.get("source"), 80) or "candidate"
    return "candidate"


def _candidate_confidence(candidate: CandidateInput) -> Optional[float]:
    if not isinstance(candidate, Mapping):
        return None

    raw = candidate.get("confidence")
    if raw is None or raw == "":
        return None

    try:
        n = float(raw)
    except (TypeError, ValueError):
        return None

    return max(0.0, min(1.0, n))


def _candidate_reason(candidate: CandidateInput) -> str:
    if not isinstance(candidate, Mapping):
        return ""
    return _clean_text(candidate.get("reason") or candidate.get("evidence"), 220)


def _is_protected_candidate(
    *,
    value: str,
    source: str,
    confidence: Optional[float],
) -> bool:
    if source in _HIGH_SIGNAL_SOURCES:
        return True
    if _PROTECTED_SIGNAL_RE.search(value):
        return True
    return confidence is not None and confidence >= 0.8


def _dedupe_candidates(candidates: Sequence[CandidateInput]) -> List[Dict[str, Any]]:
    """
    Normalize string/dict candidates into compact records.

    Important:
    High-signal deterministic candidates are marked as protected so the LLM
    cannot erase rare but meaningful terms like agency names, acronyms,
    programme names, pollutant names, legal/order numbers, etc.
    """
    out: List[Dict[str, Any]] = []
    seen = set()

    for idx, candidate in enumerate(candidates or [], start=1):
        value = _candidate_value(candidate)
        if not value:
            continue

        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)

        source = _candidate_source(candidate)
        confidence = _candidate_confidence(candidate)
        reason = _candidate_reason(candidate)

        record: Dict[str, Any] = {
            "value": value,
            "source": source,
            "rank": idx,
            "protected": _is_protected_candidate(
                value=value,
                source=source,
                confidence=confidence,
            ),
        }

        if confidence is not None:
            record["confidence"] = confidence

        if reason:
            record["reason"] = reason

        out.append(record)

    return out


def _extract_json_payload(s: str) -> Optional[Any]:
    if not s:
        return None

    # Strip common Markdown fences.
    s = re.sub(r"^```(?:json)?\s*", "", s.strip(), flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s.strip())

    # Fast path.
    try:
        return json.loads(s)
    except Exception:
        pass

    # Best-effort object extraction.
    object_start = s.find("{")
    object_end = s.rfind("}")
    if object_start != -1 and object_end > object_start:
        try:
            return json.loads(s[object_start : object_end + 1])
        except Exception:
            pass

    # Backward-compatible array extraction.
    array_start = s.find("[")
    array_end = s.rfind("]")
    if array_start != -1 and array_end > array_start:
        try:
            return json.loads(s[array_start : array_end + 1])
        except Exception:
            return None

    return None


def _tags_from_payload(payload: Any) -> List[str]:
    """
    Accept both:
    1. Old output: ["tag one", "tag two"]
    2. New output: {"tags": [{"value": "tag one", ...}]}
    """
    if isinstance(payload, dict):
        payload = (
            payload.get("tags") or payload.get("selected_tags") or payload.get("items")
        )

    if not isinstance(payload, list):
        return []

    out: List[str] = []
    seen = set()

    for item in payload:
        if isinstance(item, Mapping):
            value = _clean_text(
                item.get("value") or item.get("tag") or item.get("text"),
                120,
            )
        else:
            value = _clean_text(item, 120)

        if not value:
            continue

        key = value.casefold()
        if key in seen:
            continue

        seen.add(key)
        out.append(value)

    return out


def _openai_client():
    from openai import OpenAI

    base = os.getenv("OPENAI_BASE_URL") or os.getenv("OPENROUTER_BASE_URL")
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")

    if not key:
        raise RuntimeError("No OPENAI_API_KEY/OPENROUTER_API_KEY provided")

    client = OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)
    model = get_llm_model()
    return client, model


def _completion_token_kwargs(limit: int) -> Dict[str, int]:
    return {"max_completion_tokens": limit}


def _coverage_snippet(text: str, limit: int = 7000, segments: int = 7) -> str:
    """Sample the full document uniformly instead of taking only its beginning."""
    body = (text or "").strip()
    if len(body) <= limit:
        return body
    count = max(2, int(segments))
    width = max(300, limit // count)
    max_start = max(0, len(body) - width)
    starts = [round(max_start * index / (count - 1)) for index in range(count)]
    return "\n\n[document coverage sample]\n\n".join(
        body[start : start + width].strip() for start in starts
    )[:limit]


PROMPT = """You are a senior metadata architect for a research-grade AI tagging system.
Your task is to choose FINAL tags from deterministic candidate terms.

Non-negotiable rules:
1. Prefer candidates with source = signal, structured, taxonomy, semantic_candidate, filename, or url_title.
2. Do not remove high-signal acronyms, agency names, programme names, legal/order numbers, pollutant names, or named entities merely because they appear once.
3. Deduplicate synonyms, but keep the more canonical/domain-specific term.
4. Prefer tags that are directly supported by the content snippet.
5. Use concise tags: usually 1-4 words.
6. Select between {min_tags} and {max_tags} tags.
7. Return only valid JSON in this exact shape:
{{
  "tags": [
    {{"value": "tag text", "reason": "brief reason", "source": "candidate source"}}
  ]
}}

Candidate records:
{cands}
"""


def _merge_protected_tags(
    *,
    llm_tags: Sequence[str],
    candidate_records: Sequence[Mapping[str, Any]],
    topk: int,
    max_protected: int = 8,
) -> List[str]:
    """
    Keep LLM-selected tags, but force-retain the strongest deterministic signals.

    This prevents the LLM from dropping rare but important terms such as:
    - GRAP
    - CAQM
    - CPCB
    - PM2.5
    - legal/order IDs
    - agency names
    - programme names
    """
    out: List[str] = []
    seen = set()

    def add(value: Any) -> None:
        tag = _clean_text(value, 120)
        if not tag:
            return

        key = tag.casefold()
        if key in seen:
            return

        seen.add(key)
        out.append(tag)

    protected: List[str] = []

    for record in candidate_records:
        if not record.get("protected"):
            continue

        value = _clean_text(record.get("value"), 120)
        if not value:
            continue

        protected.append(value)

        if len(protected) >= max_protected:
            break

    for value in protected:
        add(value)

    for value in llm_tags:
        add(value)

    return out[:topk]


def rerank_with_llm(
    candidates: Sequence[CandidateInput],
    topk: int = 20,
    context_text: Optional[str] = None,
    *,
    file_name: Optional[str] = None,
    url: Optional[str] = None,
) -> List[str]:
    if not candidates:
        return []

    candidate_records = _dedupe_candidates(candidates)
    if not candidate_records:
        return []

    fallback = [str(c["value"]) for c in candidate_records[:topk]]

    if not has_llm_key():
        return fallback

    client, model = _openai_client()

    snippet = _coverage_snippet(context_text or "")

    batch_size = max(40, int(os.getenv("LLM_RERANK_CANDIDATE_BATCH_SIZE", "160")))
    mapped_tags: List[str] = []

    def rank_records(records: Sequence[Dict[str, Any]], lineage: str) -> List[str]:
        content = PROMPT.format(
            min_tags=max(1, min(10, topk)),
            max_tags=topk,
            cands=json.dumps(records, ensure_ascii=False, indent=2),
        )
        if file_name:
            content += f"\n\nFile name:\n{file_name}\n"
        if url:
            content += f"\n\nSource URL:\n{url}\n"
        if snippet:
            content += f"\n\nContent snippet:\n{snippet}\n"
        operation_id = stable_operation_id(
            "normal-tag-rerank", model, lineage, [record.get("value") for record in records]
        )

        def request() -> Any:
            return client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Return only valid JSON. No prose."},
                    {"role": "user", "content": content},
                ],
                **chat_completion_kwargs(
                    model=model,
                    temperature=0.1,
                    max_completion_tokens=700,
                ),
            )

        outcome = execute_json_completion(operation_id=operation_id, request=request)
        if outcome.payload is None:
            return [str(record["value"]) for record in records[:topk]]
        return _tags_from_payload(outcome.payload)

    for offset in range(0, len(candidate_records), batch_size):
        records = candidate_records[offset : offset + batch_size]
        mapped_tags.extend(rank_records(records, f"map-{offset // batch_size + 1}"))

    llm_tags: List[str] = []
    seen_tags = set()
    for tag in mapped_tags:
        key = str(tag).casefold()
        if key and key not in seen_tags:
            seen_tags.add(key)
            llm_tags.append(str(tag))

    if len(llm_tags) > topk:
        by_value = {str(record["value"]).casefold(): record for record in candidate_records}
        finalists = [by_value[tag.casefold()] for tag in llm_tags if tag.casefold() in by_value]
        if finalists:
            llm_tags = rank_records(finalists, "reduce")

    if not llm_tags:
        return fallback

    return _merge_protected_tags(
        llm_tags=llm_tags,
        candidate_records=candidate_records,
        topk=topk,
    )
