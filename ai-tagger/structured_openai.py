from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional, Sequence

try:
    from openai_compat import chat_completion_kwargs  # type: ignore
    from llm_reliability import execute_json_completion, stable_operation_id  # type: ignore
except ImportError:  # pragma: no cover - package import fallback
    from .openai_compat import chat_completion_kwargs  # type: ignore
    from .llm_reliability import execute_json_completion, stable_operation_id  # type: ignore

log = logging.getLogger("structured_openai")

STRUCTURED_LLM_ENABLED = os.getenv("STRUCTURED_LLM_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)
STRUCTURED_LLM_MODEL = (
    os.getenv("STRUCTURED_LLM_MODEL") or os.getenv("LLM_MODEL") or "gpt-4o-mini"
)
STRUCTURED_LLM_TIMEOUT_S = float(os.getenv("STRUCTURED_LLM_TIMEOUT_S", "45"))
STRUCTURED_LLM_MAX_CHARS = int(os.getenv("STRUCTURED_LLM_MAX_CHARS", "6000"))
STRUCTURED_LLM_MAX_UNITS = int(os.getenv("STRUCTURED_LLM_MAX_UNITS", "12"))

_DOC_TYPES = [
    "news_article",
    "direction",
    "order",
    "office_memorandum",
    "notice",
    "minutes",
    "sop_guideline",
]

_SECTORS = [
    "transport",
    "construction_demolition",
    "road_dust",
    "municipal_waste",
    "waste_burning",
    "biomass_burning",
    "industry_power",
    "dg_sets",
]

_AGENCIES = [
    "caqm",
    "cpcb",
    "dpcc",
    "spcb",
    "imd",
    "iit",
    "mcd",
]

_GEOGRAPHY = [
    "delhi",
    "ncr",
    "haryana",
    "uttar_pradesh",
    "rajasthan",
]

_PROGRAMS = [
    "grap",
]

_POLLUTANTS = [
    "pm25",
    "pm10",
    "no2",
    "o3",
    "co",
]

_GRAP_STAGES = [
    "I",
    "II",
    "III",
    "IV",
]

_AGENCY_CATEGORIES = [
    "regulator",
    "judiciary",
    "ministry",
    "executive",
    "local_body",
    "research_body",
    "civil_society",
    "private_sector",
    "other",
]

_GOVERNANCE_ISSUE_KINDS = [
    "governance_issue",
    "case_file",
]

_MANDATE_TYPES = [
    "statutory",
    "regulatory",
    "advisory",
    "enforcement",
    "operational",
    "coordination",
    "reporting",
    "monitoring",
    "other",
]

_POSITION_POLARITIES = [
    "support",
    "oppose",
    "neutral",
    "mixed",
    "unknown",
]

_GOVERNANCE_GAP_TYPES = [
    "overlap",
    "ambiguity",
    "accountability",
    "coordination",
    "enforcement",
    "data",
    "evidence",
    "coverage",
    "other",
]

_DOCUMENT_RELATION_TYPES = [
    "contradiction",
    "tension",
    "override",
    "reinforcement",
    "alignment",
    "duplication",
    "reference",
    "supersedes",
    "other",
]


def _string_or_null_schema() -> Dict[str, Any]:
    return {"anyOf": [{"type": "string"}, {"type": "null"}]}


def _bounded_number_or_null_schema(
    *, minimum: float = 0.0, maximum: float = 1.0
) -> Dict[str, Any]:
    return {
        "anyOf": [
            {"type": "number", "minimum": minimum, "maximum": maximum},
            {"type": "null"},
        ]
    }


def _governance_item_schema(
    properties: Dict[str, Any], required: Sequence[str]
) -> Dict[str, Any]:
    ordered: Dict[str, Any] = dict(properties)
    ordered["confidence"] = _bounded_number_or_null_schema()
    ordered["evidence"] = {"type": "string"}
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": ordered,
        "required": list(required) + ["confidence", "evidence"],
    }


def has_structured_llm() -> bool:
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    return STRUCTURED_LLM_ENABLED and bool(key)


def get_structured_model() -> str:
    return STRUCTURED_LLM_MODEL


def _client():
    from openai import OpenAI

    base = os.getenv("OPENAI_BASE_URL") or os.getenv("OPENROUTER_BASE_URL")
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("No OPENAI_API_KEY/OPENROUTER_API_KEY provided")

    return OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)


def _completion_token_kwargs(limit: int) -> Dict[str, int]:
    return {"max_completion_tokens": limit}


def _enum_or_null(values: Sequence[str]) -> Dict[str, Any]:
    return {
        "anyOf": [
            {"type": "string", "enum": list(values)},
            {"type": "null"},
        ]
    }


def _label_item_schema(values: Sequence[str]) -> Dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "value": _enum_or_null(values),
            "score": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
            },
            "evidence": {"type": "string"},
        },
        "required": ["value", "score", "evidence"],
    }


_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "profile": {"type": "string", "enum": ["caqm"]},
        "version": {"type": "integer", "enum": [1]},
        "docType": _label_item_schema(_DOC_TYPES),
        "labels": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "sectors": {
                    "type": "array",
                    "items": _label_item_schema(_SECTORS),
                },
                "agencies": {
                    "type": "array",
                    "items": _label_item_schema(_AGENCIES),
                },
                "geography": {
                    "type": "array",
                    "items": _label_item_schema(_GEOGRAPHY),
                },
                "programs": {
                    "type": "array",
                    "items": _label_item_schema(_PROGRAMS),
                },
                "pollutants": {
                    "type": "array",
                    "items": _label_item_schema(_POLLUTANTS),
                },
            },
            "required": [
                "sectors",
                "agencies",
                "geography",
                "programs",
                "pollutants",
            ],
        },
        "grap": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "mentioned": {"type": "boolean"},
                "stage": {
                    "anyOf": [
                        {"type": "string", "enum": ["I", "II", "III", "IV"]},
                        {"type": "null"},
                    ]
                },
                "stages": {
                    "type": "array",
                    "items": _label_item_schema(_GRAP_STAGES),
                },
                "evidence": {"type": "string"},
            },
            "required": ["mentioned", "stage", "stages", "evidence"],
        },
        "entities": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "directionNumbers": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "orderNumbers": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "referenceNumbers": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "dates": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": [
                "directionNumbers",
                "orderNumbers",
                "referenceNumbers",
                "dates",
            ],
        },
    },
    "required": ["profile", "version", "docType", "labels", "grap", "entities"],
}

_GOVERNANCE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "profile": {"type": "string", "enum": ["governance"]},
        "version": {"type": "integer", "enum": [1]},
        "agencies": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "name": {"type": "string"},
                    "shortName": _string_or_null_schema(),
                    "category": _enum_or_null(_AGENCY_CATEGORIES),
                    "jurisdiction": _string_or_null_schema(),
                },
                ["name", "shortName", "category", "jurisdiction"],
            ),
        },
        "issues": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "title": {"type": "string"},
                    "kind": _enum_or_null(_GOVERNANCE_ISSUE_KINDS),
                    "summary": _string_or_null_schema(),
                },
                ["title", "kind", "summary"],
            ),
        },
        "mandates": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "agencyName": _string_or_null_schema(),
                    "issueTitle": _string_or_null_schema(),
                    "title": {"type": "string"},
                    "description": _string_or_null_schema(),
                    "mandateType": _enum_or_null(_MANDATE_TYPES),
                    "effectiveDateText": _string_or_null_schema(),
                },
                [
                    "agencyName",
                    "issueTitle",
                    "title",
                    "description",
                    "mandateType",
                    "effectiveDateText",
                ],
            ),
        },
        "claims": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "issueTitle": _string_or_null_schema(),
                    "subjectAgencyName": _string_or_null_schema(),
                    "claimText": {"type": "string"},
                    "claimSummary": _string_or_null_schema(),
                    "polarity": _enum_or_null(_POSITION_POLARITIES),
                    "scopeText": _string_or_null_schema(),
                },
                [
                    "issueTitle",
                    "subjectAgencyName",
                    "claimText",
                    "claimSummary",
                    "polarity",
                    "scopeText",
                ],
            ),
        },
        "events": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "issueTitle": _string_or_null_schema(),
                    "actorAgencyName": _string_or_null_schema(),
                    "title": {"type": "string"},
                    "summary": _string_or_null_schema(),
                    "eventDateText": _string_or_null_schema(),
                },
                [
                    "issueTitle",
                    "actorAgencyName",
                    "title",
                    "summary",
                    "eventDateText",
                ],
            ),
        },
        "positions": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "issueTitle": _string_or_null_schema(),
                    "agencyName": _string_or_null_schema(),
                    "stanceText": {"type": "string"},
                    "stanceSummary": _string_or_null_schema(),
                    "polarity": _enum_or_null(_POSITION_POLARITIES),
                    "effectiveDateText": _string_or_null_schema(),
                },
                [
                    "issueTitle",
                    "agencyName",
                    "stanceText",
                    "stanceSummary",
                    "polarity",
                    "effectiveDateText",
                ],
            ),
        },
        "gaps": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "issueTitle": _string_or_null_schema(),
                    "primaryAgencyName": _string_or_null_schema(),
                    "secondaryAgencyName": _string_or_null_schema(),
                    "gapType": _enum_or_null(_GOVERNANCE_GAP_TYPES),
                    "summary": {"type": "string"},
                    "severity": _bounded_number_or_null_schema(
                        minimum=0.0, maximum=1.0
                    ),
                },
                [
                    "issueTitle",
                    "primaryAgencyName",
                    "secondaryAgencyName",
                    "gapType",
                    "summary",
                    "severity",
                ],
            ),
        },
        "relations": {
            "type": "array",
            "items": _governance_item_schema(
                {
                    "issueTitle": _string_or_null_schema(),
                    "fromAgencyName": _string_or_null_schema(),
                    "toAgencyName": _string_or_null_schema(),
                    "fromClaimText": _string_or_null_schema(),
                    "toClaimText": _string_or_null_schema(),
                    "relationType": _enum_or_null(_DOCUMENT_RELATION_TYPES),
                    "rationale": _string_or_null_schema(),
                },
                [
                    "issueTitle",
                    "fromAgencyName",
                    "toAgencyName",
                    "fromClaimText",
                    "toClaimText",
                    "relationType",
                    "rationale",
                ],
            ),
        },
    },
    "required": [
        "profile",
        "version",
        "agencies",
        "issues",
        "mandates",
        "claims",
        "events",
        "positions",
        "gaps",
        "relations",
    ],
}


def _clip(text: str, n: int) -> str:
    text = (text or "").strip()
    if len(text) <= n:
        return text
    return text[:n].rstrip() + " ..."


def _short_locator(locator: Optional[Dict[str, Any]]) -> str:
    loc = locator or {}
    kind = str(loc.get("kind") or "").lower()

    if kind == "page" and loc.get("pageNumber"):
        return f"[page {loc.get('pageNumber')}]"
    if kind == "image-frame" and loc.get("frameNumber"):
        return f"[image frame {loc.get('frameNumber')}]"
    if kind == "image":
        return "[image]"
    return "[document]"


def _unit_preview(units: Sequence[Dict[str, Any]]) -> str:
    out: List[str] = []
    for u in list(units)[:STRUCTURED_LLM_MAX_UNITS]:
        txt = str(u.get("text") or "").replace("\n", " ").strip()
        if not txt:
            continue
        out.append(f"{_short_locator(u.get('locator') or {})} {_clip(txt, 320)}")
    return "\n".join(f"- {x}" for x in out)


def _map_windows(
    content: str,
    units: Sequence[Dict[str, Any]],
    *,
    max_chars: int,
) -> List[Dict[str, Any]]:
    """Return bounded windows that account for the entire extracted document."""
    source = list(units or [])
    if not source and (content or "").strip():
        source = [{"text": content, "locator": {"kind": "document"}}]

    atomic: List[Dict[str, Any]] = []
    unit_limit = max(1000, int(max_chars))
    for unit in source:
        text = str(unit.get("text") or "").strip()
        if not text:
            continue
        locator = unit.get("locator") if isinstance(unit.get("locator"), dict) else {}
        start = 0
        chunk = 1
        while start < len(text):
            end = min(len(text), start + unit_limit)
            if end < len(text):
                split_at = text.rfind("\n", start + int(unit_limit * 0.55), end)
                if split_at > start:
                    end = split_at
            loc = dict(locator or {})
            if len(text) > unit_limit:
                loc["chunk"] = chunk
            atomic.append({"text": text[start:end].strip(), "locator": loc})
            if end >= len(text):
                break
            start = end
            chunk += 1

    windows: List[Dict[str, Any]] = []
    current: List[Dict[str, Any]] = []
    current_chars = 0
    for unit in atomic:
        length = len(str(unit.get("text") or ""))
        if current and current_chars + length > unit_limit:
            windows.append(
                {
                    "units": current,
                    "text": "\n\n".join(
                        f"{_short_locator(item.get('locator') or {})}\n{item.get('text') or ''}"
                        for item in current
                    ),
                }
            )
            current = []
            current_chars = 0
        current.append(unit)
        current_chars += length
    if current:
        windows.append(
            {
                "units": current,
                "text": "\n\n".join(
                    f"{_short_locator(item.get('locator') or {})}\n{item.get('text') or ''}"
                    for item in current
                ),
            }
        )
    return windows


def _merge_governance_maps(payloads: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    out = _empty_governance()
    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        for key in ("agencies", "issues", "mandates", "claims", "events", "positions", "gaps", "relations"):
            values = payload.get(key)
            if isinstance(values, list):
                out[key].extend(values)
    return out


_SYSTEM_PROMPT = """You classify CAQM / NCR air-quality policy documents into a strict existing schema.

Rules:
- Return ONLY JSON matching the schema.
- Use ONLY the canonical vocabulary allowed by the schema.
- Keep the existing label structure exactly.
- Use evidence from the provided document text only.
- OCR text may be noisy; use fuzzy interpretation, but do not invent facts.
- If a field is unknown, return null (for single values) or [] (for arrays).
- Evidence should be a short, specific snippet from the document text.
- Prefer precise labels that are actually supported by evidence in the text.
- Closed labels (agency, programme, pollutant, geography, sector, and document
  type) must be explicitly named by the text; semantic association alone is
  insufficient. For example, "Pollution Under Control" is not CPCB, "national
  capital" is not NCR, and generic pollution does not imply PM2.5 or NO2.
- Classify a news report as news_article, not minutes, even when it describes a
  meeting, hearing, or legislative session.
"""

_GOVERNANCE_SYSTEM_PROMPT = """You extract governance intelligence from the provided document into a strict JSON schema.

Rules:
- Return ONLY JSON matching the schema.
- Be conservative and evidence-grounded.
- Do not invent agencies, mandates, dates, conflicts, or gaps.
- Only emit contradictions or tensions when the document text explicitly supports them.
- Use the exact evidence snippet text from the document when possible.
- If a field is unknown, return null (for single values) or [] (for arrays).
- Prefer short summaries, but keep the full core meaning of the source statement.
- Preserve document scope; distinguish the actor making a statement from the actor being described.
- eventDateText must capture the date text as written in the document, not a guessed ISO date.
"""


def _adaptive_mapped_completion(
    *,
    client: Any,
    model: str,
    window: Dict[str, Any],
    schema: Dict[str, Any],
    schema_name: str,
    system_prompt: str,
    prompt_prefix: str,
    max_completion_tokens: int,
    lineage: str,
    depth: int = 0,
) -> List[Dict[str, Any]]:
    window_text = str(window.get("text") or "")
    operation_id = stable_operation_id(
        "legacy-map", model, schema_name, lineage, window_text
    )
    user_prompt = f"{prompt_prefix}\n\nDocument text with locators:\n{window_text}"

    def request() -> Any:
        return client.chat.completions.create(
            model=model,
            **chat_completion_kwargs(
                model=model,
                temperature=0,
                max_completion_tokens=max_completion_tokens,
            ),
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "schema": schema,
                    "strict": True,
                },
            },
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            timeout=STRUCTURED_LLM_TIMEOUT_S,
        )

    outcome = execute_json_completion(operation_id=operation_id, request=request)
    if outcome.payload is not None:
        return [outcome.payload]
    error_code = outcome.receipt.get("errorCode")
    if (
        depth < 5
        and len(window_text) >= 1400
        and error_code in {"output_incomplete", "invalid_response", "empty_response"}
    ):
        child_limit = max(700, len(window_text) // 2)
        children = _map_windows(
            window_text,
            window.get("units") or [],
            max_chars=child_limit,
        )
        if len(children) > 1:
            payloads: List[Dict[str, Any]] = []
            for index, child in enumerate(children, start=1):
                payloads.extend(
                    _adaptive_mapped_completion(
                        client=client,
                        model=model,
                        window=child,
                        schema=schema,
                        schema_name=schema_name,
                        system_prompt=system_prompt,
                        prompt_prefix=prompt_prefix,
                        max_completion_tokens=max_completion_tokens,
                        lineage=f"{lineage}.{index}",
                        depth=depth + 1,
                    )
                )
            return payloads
    log.warning(
        "%s operation %s failed after %s attempt(s): %s",
        schema_name,
        operation_id,
        outcome.receipt.get("attempts"),
        error_code,
    )
    return []


def extract_structured_with_llm(
    *,
    content: str,
    file_name: Optional[str],
    tags: Optional[Sequence[str]],
    extraction: Optional[Dict[str, Any]],
    grounding_units: Optional[Sequence[Dict[str, Any]]],
) -> Optional[Dict[str, Any]]:
    if not has_structured_llm():
        return None
    body = (content or "").strip()
    if not body:
        return None

    client = _client()
    model = get_structured_model()
    tag_text = ", ".join(
        [str(tag).strip() for tag in (tags or []) if str(tag).strip()][:20]
    )
    extraction_meta = extraction or {}
    extraction_summary = {
        "kind": extraction_meta.get("kind"),
        "mode": extraction_meta.get("mode"),
        "ocrUsed": extraction_meta.get("ocrUsed"),
        "unitCount": extraction_meta.get("unitCount"),
        "charCount": extraction_meta.get("charCount"),
    }
    windows = _map_windows(
        body, grounding_units or [], max_chars=STRUCTURED_LLM_MAX_CHARS
    )
    merged: Optional[Dict[str, Any]] = None
    for window_index, window in enumerate(windows, start=1):
        prompt_prefix = f"""File name:
{file_name or "unknown"}

Map window:
{window_index} of {len(windows)}

Existing tags:
{tag_text or "none"}

Extraction summary:
{json.dumps(extraction_summary, ensure_ascii=False)}

Grounding previews:
{_unit_preview(window.get("units") or []) or "(none)"}"""
        payloads = _adaptive_mapped_completion(
            client=client,
            model=model,
            window=window,
            schema=_SCHEMA,
            schema_name="caqm_structured",
            system_prompt=_SYSTEM_PROMPT,
            prompt_prefix=prompt_prefix,
            max_completion_tokens=1400,
            lineage=f"w{window_index}",
        )
        for parsed in payloads:
            parsed["profile"] = "caqm"
            parsed["version"] = 1
            merged = merge_structured(parsed, merged)
    return merged


def extract_governance_with_llm(
    *,
    content: str,
    file_name: Optional[str],
    tags: Optional[Sequence[str]],
    extraction: Optional[Dict[str, Any]],
    grounding_units: Optional[Sequence[Dict[str, Any]]],
) -> Optional[Dict[str, Any]]:
    if not has_structured_llm():
        return None

    body = (content or "").strip()
    if not body:
        return None

    client = _client()
    model = get_structured_model()

    tag_text = ", ".join([str(t).strip() for t in (tags or []) if str(t).strip()][:20])

    extraction_meta = extraction or {}
    extraction_summary = {
        "kind": extraction_meta.get("kind"),
        "mode": extraction_meta.get("mode"),
        "ocrUsed": extraction_meta.get("ocrUsed"),
        "unitCount": extraction_meta.get("unitCount"),
        "charCount": extraction_meta.get("charCount"),
    }

    windows = _map_windows(
        body,
        grounding_units or [],
        max_chars=STRUCTURED_LLM_MAX_CHARS,
    )
    mapped: List[Dict[str, Any]] = []
    for window_index, window in enumerate(windows, start=1):
        unit_preview = _unit_preview(window.get("units") or [])
        user_prompt = f"""File name:
{file_name or "unknown"}

Map window:
{window_index} of {len(windows)}

Existing tags:
{tag_text or "none"}

Extraction summary:
{json.dumps(extraction_summary, ensure_ascii=False)}

Grounding previews:
{unit_preview or "(none)"}

Document text with locators:
{window.get('text') or ''}
"""

        prompt_prefix = user_prompt.rsplit("\n\nDocument text with locators:", 1)[0]
        payloads = _adaptive_mapped_completion(
            client=client,
            model=model,
            window=window,
            schema=_GOVERNANCE_SCHEMA,
            schema_name="governance_structured",
            system_prompt=_GOVERNANCE_SYSTEM_PROMPT,
            prompt_prefix=prompt_prefix,
            max_completion_tokens=2400,
            lineage=f"w{window_index}",
        )
        for parsed in payloads:
            parsed["profile"] = "governance"
            parsed["version"] = 1
            mapped.append(parsed)
    return _merge_governance_maps(mapped) if mapped else None


def _empty_governance() -> Dict[str, Any]:
    return {
        "profile": "governance",
        "version": 1,
        "agencies": [],
        "issues": [],
        "mandates": [],
        "claims": [],
        "events": [],
        "positions": [],
        "gaps": [],
        "relations": [],
    }


def _empty_label_item() -> Dict[str, Any]:
    return {"value": None, "score": 0.0, "evidence": ""}


def _empty_structured() -> Dict[str, Any]:
    return {
        "profile": "caqm",
        "version": 1,
        "docType": _empty_label_item(),
        "labels": {
            "sectors": [],
            "agencies": [],
            "geography": [],
            "programs": [],
            "pollutants": [],
        },
        "grap": {
            "mentioned": False,
            "stage": None,
            "stages": [],
            "evidence": "",
        },
        "entities": {
            "directionNumbers": [],
            "orderNumbers": [],
            "referenceNumbers": [],
            "dates": [],
        },
    }


def _clean_item(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None

    raw_value: Any = item.get("value")
    value: Optional[str]
    if raw_value is None:
        value = None
    else:
        value = str(raw_value).strip() or None

    raw_score: Any = item.get("score", 0.0)
    score: float
    if raw_score is None:
        score = 0.0
    else:
        try:
            score = float(raw_score)
        except (TypeError, ValueError):
            score = 0.0

    evidence = str(item.get("evidence", "") or "").strip()

    if value is None and not evidence:
        return None

    return {
        "value": value,
        "score": max(0.0, min(1.0, score)),
        "evidence": evidence,
    }


def _merge_items(
    preferred: Any,
    fallback: Any,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()

    for source in (preferred or [], fallback or []):
        if not isinstance(source, list):
            continue
        for raw in source:
            item = _clean_item(raw)
            if not item:
                continue
            key = str(item.get("value") or "").strip().casefold()
            if not key:
                continue
            if key in seen:
                continue
            seen.add(key)
            out.append(item)

    return out


def _merge_grap_stages(
    preferred: Dict[str, Any],
    fallback: Dict[str, Any],
) -> List[Dict[str, Any]]:
    stages = _merge_items(
        preferred.get("stages"),
        fallback.get("stages"),
    )
    single_stage = preferred.get("stage") or fallback.get("stage")
    if not single_stage:
        return stages

    single_key = str(single_stage).strip().casefold()
    if any(
        str(item.get("value") or "").strip().casefold() == single_key
        for item in stages
    ):
        return stages

    stages.append(
        {
            "value": single_stage,
            "score": 0.85,
            "evidence": str(
                preferred.get("evidence") or fallback.get("evidence") or ""
            ),
        }
    )
    return stages


def _pick_single(preferred: Any, fallback: Any) -> Dict[str, Any]:
    a = _clean_item(preferred)
    if a and a.get("value"):
        return a
    b = _clean_item(fallback)
    if b:
        return b
    return _empty_label_item()


def _uniq_strings(*groups: Any) -> List[str]:
    out: List[str] = []
    seen = set()

    for group in groups:
        if not isinstance(group, list):
            continue
        for raw in group:
            s = str(raw or "").strip()
            if not s:
                continue
            k = s.casefold()
            if k in seen:
                continue
            seen.add(k)
            out.append(s)

    return out


def _as_obj(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def merge_structured(
    preferred: Optional[Dict[str, Any]],
    fallback: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    p: Dict[str, Any] = _as_obj(preferred)
    f: Dict[str, Any] = _as_obj(fallback)
    out: Dict[str, Any] = _empty_structured()

    out["docType"] = _pick_single(p.get("docType"), f.get("docType"))

    p_labels: Dict[str, Any] = _as_obj(p.get("labels"))
    f_labels: Dict[str, Any] = _as_obj(f.get("labels"))

    out["labels"] = {
        "sectors": _merge_items(
            p_labels.get("sectors"),
            f_labels.get("sectors"),
        ),
        "agencies": _merge_items(
            p_labels.get("agencies"),
            f_labels.get("agencies"),
        ),
        "geography": _merge_items(
            p_labels.get("geography"),
            f_labels.get("geography"),
        ),
        "programs": _merge_items(
            p_labels.get("programs"),
            f_labels.get("programs"),
        ),
        "pollutants": _merge_items(
            p_labels.get("pollutants"),
            f_labels.get("pollutants"),
        ),
    }

    p_grap: Dict[str, Any] = _as_obj(p.get("grap"))
    f_grap: Dict[str, Any] = _as_obj(f.get("grap"))
    single_stage = p_grap.get("stage") or f_grap.get("stage") or None

    out["grap"] = {
        "mentioned": bool(p_grap.get("mentioned") or f_grap.get("mentioned")),
        "stage": single_stage,
        "stages": _merge_grap_stages(p_grap, f_grap),
        "evidence": str(p_grap.get("evidence") or f_grap.get("evidence") or ""),
    }

    p_entities: Dict[str, Any] = _as_obj(p.get("entities"))
    f_entities: Dict[str, Any] = _as_obj(f.get("entities"))

    out["entities"] = {
        "directionNumbers": _uniq_strings(
            p_entities.get("directionNumbers"),
            f_entities.get("directionNumbers"),
        ),
        "orderNumbers": _uniq_strings(
            p_entities.get("orderNumbers"),
            f_entities.get("orderNumbers"),
        ),
        "referenceNumbers": _uniq_strings(
            p_entities.get("referenceNumbers"),
            f_entities.get("referenceNumbers"),
        ),
        "dates": _uniq_strings(
            p_entities.get("dates"),
            f_entities.get("dates"),
        ),
    }

    return out
