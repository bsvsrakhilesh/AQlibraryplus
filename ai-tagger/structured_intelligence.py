from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from pydantic import BaseModel, ConfigDict, Field

try:
    from openai_compat import chat_completion_kwargs  # type: ignore
    from llm_reliability import (  # type: ignore
        execute_json_completion,
        stable_operation_id,
    )
except ImportError:  # pragma: no cover - package import fallback
    from .openai_compat import chat_completion_kwargs  # type: ignore
    from .llm_reliability import execute_json_completion, stable_operation_id  # type: ignore

log = logging.getLogger("structured_intelligence")


STRUCTURED_INTELLIGENCE_ENABLED = os.getenv(
    "STRUCTURED_INTELLIGENCE_ENABLED", "true"
).lower() in ("1", "true", "yes", "on")
STRUCTURED_INTELLIGENCE_LLM_ENABLED = os.getenv(
    "STRUCTURED_INTELLIGENCE_LLM_ENABLED",
    os.getenv("STRUCTURED_LLM_ENABLED", "true"),
).lower() in ("1", "true", "yes", "on")
STRUCTURED_INTELLIGENCE_LLM_MODEL = (
    os.getenv("STRUCTURED_INTELLIGENCE_LLM_MODEL")
    or os.getenv("STRUCTURED_LLM_MODEL")
    or os.getenv("LLM_MODEL")
    or "gpt-4o-mini"
)
STRUCTURED_INTELLIGENCE_LLM_TIMEOUT_S = float(
    os.getenv("STRUCTURED_INTELLIGENCE_LLM_TIMEOUT_S", "45")
)
STRUCTURED_INTELLIGENCE_LLM_MAX_CHARS = int(
    os.getenv("STRUCTURED_INTELLIGENCE_LLM_MAX_CHARS", "6000")
)
STRUCTURED_INTELLIGENCE_LLM_MIN_SPLIT_CHARS = int(
    os.getenv("STRUCTURED_INTELLIGENCE_LLM_MIN_SPLIT_CHARS", "700")
)
STRUCTURED_INTELLIGENCE_LLM_MAX_OUTPUT_TOKENS = int(
    os.getenv("STRUCTURED_INTELLIGENCE_LLM_MAX_OUTPUT_TOKENS", "2400")
)
STRUCTURED_INTELLIGENCE_CRITIC_BATCH_SIZE = max(
    1, int(os.getenv("STRUCTURED_INTELLIGENCE_CRITIC_BATCH_SIZE", "20"))
)

PROFILE = "structured_intelligence"
DOMAIN = "air_quality_governance"
CATEGORY_KEYS = [
    "topics",
    "agencies",
    "programs",
    "programStages",
    "legalReferences",
    "actionsDecisions",
    "requirements",
    "restrictions",
    "locations",
    "sectors",
    "pollutantsMeasurements",
    "datesDeadlines",
    "claims",
]


class EvidenceAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quote: str = Field(min_length=1, max_length=1200)
    page: Optional[int] = None
    section: Optional[str] = Field(default=None, max_length=180)
    locator: Optional[Dict[str, Any]] = None
    charStart: Optional[int] = Field(default=None, ge=0)
    charEnd: Optional[int] = Field(default=None, ge=0)
    sourceUnitId: Optional[str] = Field(default=None, max_length=80)


class IntelligenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str = Field(min_length=1, max_length=180)
    type: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=80)
    normalizedValue: str = Field(min_length=1, max_length=180)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    source: str = Field(min_length=1, max_length=80)
    evidence: List[EvidenceAnchor] = Field(default_factory=list, max_length=50)
    locator: Optional[Dict[str, Any]] = None
    status: str = Field(default="matched", max_length=80)
    validation: Optional[Dict[str, Any]] = None


class StructuredIntelligenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: str = PROFILE
    version: int = 1
    domain: str = DOMAIN
    mapCoverage: Dict[str, Any] = Field(default_factory=dict)
    topics: List[IntelligenceItem] = Field(default_factory=list)
    agencies: List[IntelligenceItem] = Field(default_factory=list)
    programs: List[IntelligenceItem] = Field(default_factory=list)
    programStages: List[IntelligenceItem] = Field(default_factory=list)
    legalReferences: List[IntelligenceItem] = Field(default_factory=list)
    actionsDecisions: List[IntelligenceItem] = Field(default_factory=list)
    requirements: List[IntelligenceItem] = Field(default_factory=list)
    restrictions: List[IntelligenceItem] = Field(default_factory=list)
    locations: List[IntelligenceItem] = Field(default_factory=list)
    sectors: List[IntelligenceItem] = Field(default_factory=list)
    pollutantsMeasurements: List[IntelligenceItem] = Field(default_factory=list)
    datesDeadlines: List[IntelligenceItem] = Field(default_factory=list)
    claims: List[IntelligenceItem] = Field(default_factory=list)
    items: List[IntelligenceItem] = Field(default_factory=list)


def _clean_text(value: Any, limit: int = 500) -> Optional[str]:
    text = " ".join(str(value or "").replace("\u2026", " ").split()).strip()
    return text[:limit] if text else None


def _norm(value: Any) -> str:
    raw = _clean_text(value, 180) or ""
    raw = raw.casefold().replace("&", " and ")
    raw = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
    return raw or "unknown"


def _confidence(value: Any, default: float) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        num = default
    return max(0.0, min(1.0, num))


def _dict_copy(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _page_from_locator(locator: Optional[Dict[str, Any]]) -> Optional[int]:
    loc = locator if isinstance(locator, dict) else {}
    raw = loc.get("pageNumber") or loc.get("page")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _snippet(text: str, start: int, end: int, *, window: int = 140) -> str:
    a = max(0, start - window)
    b = min(len(text), end + window)
    out = " ".join((text or "")[a:b].split()).strip()
    if a > 0:
        out = "... " + out
    if b < len(text):
        out = out + " ..."
    return out


def _candidate_units(
    content: str,
    grounding_units: Sequence[Dict[str, Any]],
    *,
    max_chars: int = 3600,
    overlap: int = 280,
) -> List[Dict[str, Any]]:
    base = list(grounding_units or [])
    if not base and (content or "").strip():
        base = [{"text": content, "locator": {"kind": "document"}}]

    out: List[Dict[str, Any]] = []
    for unit_index, unit in enumerate(base):
        text = str(unit.get("text") or "").strip()
        if not text:
            continue
        locator = _dict_copy(unit.get("locator"))
        source_unit_id = str(
            unit.get("sourceUnitId")
            or stable_operation_id("source-unit", unit_index, locator, text)
        )
        if len(text) <= max_chars:
            loc = _dict_copy(locator)
            loc.setdefault("charStart", 0)
            loc.setdefault("charEnd", len(text))
            loc.setdefault("sourceUnitId", source_unit_id)
            out.append(
                {"text": text, "locator": loc, "sourceUnitId": source_unit_id}
            )
            continue

        start = 0
        chunk_idx = 1
        while start < len(text):
            end = min(len(text), start + max_chars)
            if end < len(text):
                split_at = text.rfind("\n", start + int(max_chars * 0.55), end)
                if split_at > start:
                    end = split_at
            chunk = text[start:end].strip()
            if chunk:
                leading = len(text[start:end]) - len(text[start:end].lstrip())
                absolute_start = start + leading
                loc = _dict_copy(locator)
                loc["chunk"] = chunk_idx
                loc["charStart"] = absolute_start
                loc["charEnd"] = absolute_start + len(chunk)
                loc["sourceUnitId"] = source_unit_id
                out.append(
                    {"text": chunk, "locator": loc, "sourceUnitId": source_unit_id}
                )
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)
            chunk_idx += 1

    # Page completeness is a product invariant. Callers may batch expensive
    # model work, but deterministic extraction must never silently drop a late
    # page or chunk.
    return out


def _locator_prefix(locator: Optional[Dict[str, Any]]) -> str:
    loc = locator or {}
    page = _page_from_locator(loc)
    if page is not None:
        return f"[page {page}]"
    section = _clean_text(loc.get("section") or loc.get("heading"), 180)
    if section:
        return f"[section {section}]"
    return "[document]"


def _evidence(text: str, start: int, end: int, locator: Dict[str, Any]) -> Dict[str, Any]:
    span_start = max(0, start - 140)
    span_end = min(len(text), end + 140)
    raw_quote = text[span_start:span_end]
    leading = len(raw_quote) - len(raw_quote.lstrip())
    trailing = len(raw_quote) - len(raw_quote.rstrip())
    span_start += leading
    span_end -= trailing
    quote = text[span_start:span_end]
    item: Dict[str, Any] = {"quote": quote}
    page = _page_from_locator(locator)
    if page is not None:
        item["page"] = page
    section = locator.get("section") or locator.get("heading")
    if section:
        item["section"] = _clean_text(section, 180)
    if locator:
        item["locator"] = locator
    base_start = int(locator.get("charStart") or 0)
    item["charStart"] = base_start + span_start
    item["charEnd"] = base_start + span_end
    source_unit_id = locator.get("sourceUnitId")
    if source_unit_id:
        item["sourceUnitId"] = str(source_unit_id)
    return item


def _item_id(category: str, item_type: str, normalized: str, quote: str) -> str:
    seed = f"{category}|{item_type}|{normalized}|{quote[:160]}".encode("utf-8")
    return "si_" + hashlib.sha1(seed).hexdigest()[:14]


def _roman_stage(value: str) -> Optional[str]:
    raw = (value or "").strip().upper().replace("STAGE", "").strip(" :-")
    mapping = {"1": "I", "2": "II", "3": "III", "4": "IV"}
    raw = mapping.get(raw, raw)
    return raw if raw in {"I", "II", "III", "IV"} else None


def _stage_values(raw: str) -> List[str]:
    values: List[str] = []
    for part in re.findall(r"\b(?:IV|III|II|I|[1-4])\b", raw or "", re.IGNORECASE):
        stage = _roman_stage(part)
        if stage and stage not in values:
            values.append(stage)
    return values


def _dedupe_key(item: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        str(item.get("category") or "").casefold(),
        str(item.get("type") or "").casefold(),
        str(item.get("normalizedValue") or _norm(item.get("label"))),
    )


def _make_item(
    *,
    label: str,
    item_type: str,
    category: str,
    confidence: float,
    source: str,
    evidence: Dict[str, Any],
    normalized: Optional[str] = None,
    status: str = "matched",
) -> Dict[str, Any]:
    normalized_value = normalized or _norm(label)
    quote = str(evidence.get("quote") or "")
    locator = evidence.get("locator") if isinstance(evidence.get("locator"), dict) else None
    return {
        "id": _item_id(category, item_type, normalized_value, quote),
        "label": label,
        "type": item_type,
        "category": category,
        "normalizedValue": normalized_value,
        "confidence": round(_confidence(confidence, 0.65), 3),
        "source": source,
        "evidence": [evidence],
        "locator": locator,
        "status": status,
    }


def _compile(pattern: str, flags: int = re.IGNORECASE) -> re.Pattern:
    return re.compile(pattern, flags)


_AGENCY_RULES = [
    ("CAQM", "agency", "agencies", "caqm", [_compile(r"\bCAQM\b"), _compile(r"\bCommission\s+for\s+Air\s+Quality\s+Management\b")], 0.92),
    ("CPCB", "agency", "agencies", "cpcb", [_compile(r"\bCPCB\b"), _compile(r"\bCentral\s+Pollution\s+Control\s+Board\b")], 0.9),
    ("DPCC", "agency", "agencies", "dpcc", [_compile(r"\bDPCC\b"), _compile(r"\bDelhi\s+Pollution\s+Control\s+Committee\b")], 0.9),
    ("SPCB", "agency", "agencies", "spcb", [_compile(r"\bSPCBs?\b"), _compile(r"\bState\s+Pollution\s+Control\s+Boards?\b")], 0.86),
    ("IMD", "agency", "agencies", "imd", [_compile(r"\bIMD\b"), _compile(r"\bIndia\s+Meteorological\s+Department\b")], 0.84),
    ("NGT", "agency", "agencies", "ngt", [_compile(r"\bNGT\b"), _compile(r"\bNational\s+Green\s+Tribunal\b")], 0.86),
    ("MoEFCC", "agency", "agencies", "moefcc", [_compile(r"\bMoEFCC\b"), _compile(r"\bMinistry\s+of\s+Environment,\s*Forest\s+and\s+Climate\s+Change\b")], 0.84),
    ("MCD", "agency", "agencies", "mcd", [_compile(r"\bMCD\b"), _compile(r"\bMunicipal\s+Corporation\s+of\s+Delhi\b")], 0.86),
    ("World Health Organization", "agency", "agencies", "world_health_organization", [_compile(r"\bWHO\b"), _compile(r"\bWorld\s+Health\s+Organization\b")], 0.86),
    ("IQAir", "agency", "agencies", "iqair", [_compile(r"\bIQAir\b")], 0.84),
    ("Comptroller and Auditor General of India", "oversight_body", "agencies", "cag", [_compile(r"\bCAG\b"), _compile(r"\bComptroller\s+and\s+Auditor\s+General\s+of\s+India\b")], 0.88),
    ("Supreme Court of India", "judiciary", "agencies", "supreme_court_of_india", [_compile(r"\bSupreme\s+Court(?:\s+of\s+India)?\b")], 0.88),
    ("Delhi Assembly", "legislature", "agencies", "delhi_assembly", [_compile(r"\bDelhi\s+(?:Legislative\s+)?Assembly\b")], 0.86),
]

_LOCATION_RULES = [
    ("Delhi", "location", "locations", "delhi", [_compile(r"\bDelhi\b"), _compile(r"\bNCT\s+of\s+Delhi\b")], 0.84),
    ("NCR", "location", "locations", "ncr", [_compile(r"\bNCR\b"), _compile(r"\bNational\s+Capital\s+Region\b")], 0.84),
    ("Haryana", "location", "locations", "haryana", [_compile(r"\bHaryana\b")], 0.78),
    ("Uttar Pradesh", "location", "locations", "uttar_pradesh", [_compile(r"\bUttar\s+Pradesh\b|\bU\.?P\.?\b")], 0.78),
    ("Rajasthan", "location", "locations", "rajasthan", [_compile(r"\bRajasthan\b")], 0.78),
    ("Punjab", "location", "locations", "punjab", [_compile(r"\bPunjab\b")], 0.76),
]

_SECTOR_RULES = [
    ("Transport", "sector", "sectors", "transport", [_compile(r"\b(?:vehicle|vehicular|traffic|PUC|PUCC|diesel|petrol|BS[-\s]?VI)\b|\bPollution\s+Under\s+Control\b|\bodd[-\s]even\b")], 0.76),
    ("Construction & Demolition", "sector", "sectors", "construction_demolition", [_compile(r"\bC\s*&\s*D\b|\bconstruction\s+(?:and\s+)?demolition\b|\bconstruction\s+dust\b")], 0.8),
    ("Road Dust", "sector", "sectors", "road_dust", [_compile(r"\broad\s+dust\b|\bmechanized\s+road\s+sweeping\b|\bwater\s+sprinkling\b|\broad[-\s]+cleaning\b|\brepair\s+roads\b")], 0.76),
    ("Municipal Waste", "sector", "sectors", "municipal_waste", [_compile(r"\bgarbage\s+mountains?\b|\bmunicipal\s+(?:solid\s+)?waste\b|\blandfills?\b")], 0.76),
    ("Open Waste Burning", "sector", "sectors", "waste_burning", [_compile(r"\bopen\s+burning\b|\bgarbage\s+burning\b|\bwaste\s+burning\b|\bMSW\b")], 0.78),
    ("Biomass / Stubble Burning", "sector", "sectors", "biomass_burning", [_compile(r"\bstubble\s+burning\b|\bcrop\s+residue\b|\bpaddy\s+straw\b|\bparali\b")], 0.78),
    ("Industry & Power", "sector", "sectors", "industry_power", [_compile(r"\bindustr(?:y|ial)\b|\bpower\s+plant\b|\bstack\s+emissions?\b")], 0.74),
    ("DG Sets", "sector", "sectors", "dg_sets", [_compile(r"\bDG\s*sets?\b|\bdiesel\s+generators?\b|\bgensets?\b")], 0.78),
]

_TOPIC_RULES = [
    ("Air Pollution Control", "environmental_topic", "topics", "air_pollution_control", [_compile(r"\bair\s+pollution\b|\bair\s+quality\b|\bAQI\b|\bPM\s*2\.?5\b|\bPM\s*10\b")], 0.76),
    ("Emergency Air Quality Response", "emergency_response", "topics", "emergency_air_quality_response", [_compile(r"\bGRAP\b|\bGraded\s+Response\s+Action\s+Plan\b|\bsevere\b.{0,80}\bair\s+quality\b", re.IGNORECASE | re.DOTALL)], 0.82),
    ("Environmental Compliance", "compliance_topic", "topics", "environmental_compliance", [_compile(r"\bcompliance\b|\benvironment(?:al)?\s+compensation\b|\bviolation\b|\benforcement\b")], 0.72),
    ("Public Health", "health_topic", "topics", "public_health", [_compile(r"\bpublic\s+health\b|\bhealth\s+advisory\b|\brespiratory\b|\bvulnerable\s+groups\b")], 0.7),
]

_ACTION_RULES = [
    ("Inspection Required", "inspection_required", "actionsDecisions", "inspection_required", [_compile(r"\b(?:inspection|inspect|inspected|inspection\s+drive)\b")], 0.76),
    ("Monitoring Required", "monitoring_required", "actionsDecisions", "monitoring_required", [_compile(r"\b(?:monitor|monitoring|surveillance|real[-\s]?time\s+monitoring)\b")], 0.74),
    ("Implementation Plan", "implementation_plan", "actionsDecisions", "implementation_plan", [_compile(r"\b(?:implementation\s+plan|action\s+plan|roadmap|time[-\s]?bound\s+plan)\b")], 0.76),
    ("Advisory", "advisory", "actionsDecisions", "advisory", [_compile(r"\b(?:advisory|advise|advised)\b")], 0.68),
]

_REQUIREMENT_RULES = [
    ("Compliance Required", "compliance_required", "requirements", "compliance_required", [_compile(r"\b(?:shall\s+ensure|directed\s+to|comply|compliance\s+required|submit\s+compliance)\b")], 0.8),
    ("Submission Required", "submission_required", "requirements", "submission_required", [_compile(r"\bsubmit\b.{0,90}\b(?:report|plan|compliance|status)\b", re.IGNORECASE | re.DOTALL)], 0.76),
    ("Coordination Required", "coordination_required", "requirements", "coordination_required", [_compile(r"\bcoordination\b|\bcoordinate\s+with\b")], 0.68),
]

_RESTRICTION_RULES = [
    ("Restriction", "restriction", "restrictions", "restriction", [_compile(r"\b(?:restrict|restriction|restricted|suspend|suspended|curb|curbs)\b")], 0.78),
    ("Ban / Prohibition", "ban", "restrictions", "ban_prohibition", [_compile(r"\b(?:ban|banned|prohibit|prohibits|prohibited|prohibition|not\s+permitted)\b")], 0.82),
]

_DATE_RE = _compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b"
)
_DIRECTION_RE = _compile(r"\bDirection\s*No\.?\s*[:\-]?\s*([A-Za-z0-9./()\-\[\]]{3,})")
_ORDER_RE = _compile(r"\bOrder\s*No\.?\s*[:\-]?\s*([A-Za-z0-9./()\-\[\]]{3,})")
_REF_RE = _compile(r"\b(?:F\.?\s*No\.?|Ref\.?\s*No\.?|File\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9./()\-\[\]]{3,})")
_ACT_RE = _compile(r"\b(?:CAQM\s+Act|Environment\s+\(Protection\)\s+Act|Air\s+\(Prevention\s+and\s+Control\s+of\s+Pollution\)\s+Act|EP\s+Act)\b")
_SECTION_RE = _compile(r"\bSection\s+\d+[A-Za-z]?(?:\(\d+\))?\b")
_MEASURE_RE = _compile(r"\b(?:PM\s*2\.?5|PM\s*10|NO2|O3|CO|AQI|Air\s+Quality\s+Index)\b(?:\s*(?:level|value|concentration)?\s*(?:of|:|=|-)?\s*\d{2,4}(?:\.\d+)?)?", re.IGNORECASE)
_GRAP_PROGRAM_RE = _compile(r"\bGRAP\b|\bGraded\s+Response\s+Action\s+Plan\b")
_GRAP_STAGE_GROUP_RE = _compile(
    r"\b(?:GRAP\s*)?Stages?\s*[-:]?\s*((?:IV|III|II|I|[1-4])(?:\s*(?:,|/|&|and|to|-)\s*(?:IV|III|II|I|[1-4]))*)\b",
    re.IGNORECASE,
)
_GRAP_STAGE_DIRECT_RE = _compile(r"\bGRAP\s*[-:]?\s*(IV|III|II|I|[1-4])\b")
_CLAIM_RE = _compile(
    r"\b(?:observed|noted|reported|stated|found)\s+that\b.{0,180}?(?:\.|;|$)",
    re.IGNORECASE | re.DOTALL,
)


def _add_rule_matches(
    items: List[Dict[str, Any]],
    units: Sequence[Dict[str, Any]],
    rules: Sequence[Tuple[str, str, str, str, Sequence[re.Pattern], float]],
    *,
    max_per_rule: int = 2,
) -> None:
    for label, item_type, category, normalized, patterns, confidence in rules:
        count = 0
        for unit in units:
            text = str(unit.get("text") or "")
            locator = _dict_copy(unit.get("locator"))
            for pattern in patterns:
                for match in pattern.finditer(text):
                    evidence = _evidence(text, match.start(), match.end(), locator)
                    items.append(
                        _make_item(
                            label=label,
                            item_type=item_type,
                            category=category,
                            normalized=normalized,
                            confidence=confidence,
                            source="deterministic",
                            evidence=evidence,
                        )
                    )
                    count += 1
                    if count >= max_per_rule:
                        break
                if count >= max_per_rule:
                    break
            if count >= max_per_rule:
                break


def _extract_grap(items: List[Dict[str, Any]], units: Sequence[Dict[str, Any]]) -> None:
    document_mentions_grap = any(
        _GRAP_PROGRAM_RE.search(str(unit.get("text") or "")) for unit in units
    )
    if not document_mentions_grap:
        return
    program_added = False
    for unit in units:
        text = str(unit.get("text") or "")
        locator = _dict_copy(unit.get("locator"))
        if not program_added:
            m = _GRAP_PROGRAM_RE.search(text)
            if m:
                items.append(
                    _make_item(
                        label="GRAP",
                        item_type="program",
                        category="programs",
                        normalized="grap",
                        confidence=0.86,
                        source="deterministic",
                        evidence=_evidence(text, m.start(), m.end(), locator),
                    )
                )
                program_added = True

        for pattern in (_GRAP_STAGE_GROUP_RE, _GRAP_STAGE_DIRECT_RE):
            for match in pattern.finditer(text):
                raw = match.group(1) if match.groups() else match.group(0)
                for stage in _stage_values(raw):
                    items.append(
                        _make_item(
                            label=f"GRAP Stage {stage}",
                            item_type="program_stage",
                            category="programStages",
                            normalized=f"grap_stage_{stage.casefold()}",
                            confidence=0.88,
                            source="deterministic",
                            evidence=_evidence(text, match.start(), match.end(), locator),
                        )
                    )


def _extract_legal_refs(items: List[Dict[str, Any]], units: Sequence[Dict[str, Any]]) -> None:
    specs = [
        (_DIRECTION_RE, "Direction No. {}", "direction_number", 0.84),
        (_ORDER_RE, "Order No. {}", "order_number", 0.82),
        (_REF_RE, "Reference No. {}", "reference_number", 0.76),
    ]
    for unit in units:
        text = str(unit.get("text") or "")
        locator = _dict_copy(unit.get("locator"))
        for pattern, label_fmt, item_type, confidence in specs:
            for match in pattern.finditer(text):
                ref = _clean_text(match.group(1), 80)
                if not ref:
                    continue
                label = label_fmt.format(ref)
                items.append(
                    _make_item(
                        label=label,
                        item_type=item_type,
                        category="legalReferences",
                        normalized=_norm(label),
                        confidence=confidence,
                        source="deterministic",
                        evidence=_evidence(text, match.start(), match.end(), locator),
                    )
                )
        for pattern, item_type, confidence in ((_ACT_RE, "law", 0.78), (_SECTION_RE, "statutory_section", 0.72)):
            for match in pattern.finditer(text):
                label = _clean_text(match.group(0), 120)
                if label:
                    items.append(
                        _make_item(
                            label=label,
                            item_type=item_type,
                            category="legalReferences",
                            normalized=_norm(label),
                            confidence=confidence,
                            source="deterministic",
                            evidence=_evidence(text, match.start(), match.end(), locator),
                        )
                    )


def _extract_dates_measurements_claims(
    items: List[Dict[str, Any]], units: Sequence[Dict[str, Any]]
) -> None:
    for unit in units:
        text = str(unit.get("text") or "")
        locator = _dict_copy(unit.get("locator"))
        for match in _DATE_RE.finditer(text):
            label = _clean_text(match.group(0), 80)
            if label:
                items.append(
                    _make_item(
                        label=label,
                        item_type="date_deadline",
                        category="datesDeadlines",
                        normalized=_norm(label),
                        confidence=0.72,
                        source="deterministic",
                        evidence=_evidence(text, match.start(), match.end(), locator),
                    )
                )
        for match in _MEASURE_RE.finditer(text):
            label = _clean_text(match.group(0), 120)
            if label:
                items.append(
                    _make_item(
                        label=label,
                        item_type="pollutant_measurement",
                        category="pollutantsMeasurements",
                        normalized=_norm(label),
                        confidence=0.72,
                        source="deterministic",
                        evidence=_evidence(text, match.start(), match.end(), locator),
                    )
                )
        for match in _CLAIM_RE.finditer(text):
            quote = _clean_text(match.group(0), 180)
            if quote:
                items.append(
                    _make_item(
                        label="Document Claim",
                        item_type="issue_claim",
                        category="claims",
                        normalized=_norm(quote[:90]),
                        confidence=0.62,
                        source="deterministic",
                        evidence=_evidence(text, match.start(), match.end(), locator),
                    )
                )


def _items_from_structured(structured: Any, units: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(structured, dict):
        return []
    out: List[Dict[str, Any]] = []

    def exact_anchor(evidence_text: str, locator: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return _exact_source_anchor(
            {"quote": evidence_text, **({"locator": locator} if locator else {})},
            units,
        )

    def add_from_label(raw: Any, category: str, item_type: str, confidence: float) -> None:
        if not isinstance(raw, dict):
            return
        value = _clean_text(raw.get("value"), 120)
        evidence_text = _clean_text(raw.get("evidence"), 500)
        locator = _dict_copy(raw.get("locator"))
        if not value or not evidence_text:
            return
        evidence = exact_anchor(evidence_text, locator)
        if not evidence:
            return
        out.append(
            _make_item(
                label=value.replace("_", " ").title() if category != "agencies" else value.upper(),
                item_type=item_type,
                category=category,
                normalized=_norm(value),
                confidence=_confidence(raw.get("score"), confidence),
                source="taxonomy",
                evidence=evidence,
            )
        )

    raw_labels = structured.get("labels")
    labels: Dict[str, Any] = raw_labels if isinstance(raw_labels, dict) else {}
    for item in labels.get("agencies") or []:
        add_from_label(item, "agencies", "agency", 0.72)
    for item in labels.get("geography") or []:
        add_from_label(item, "locations", "location", 0.68)
    for item in labels.get("sectors") or []:
        add_from_label(item, "sectors", "sector", 0.68)
    for item in labels.get("programs") or []:
        add_from_label(item, "programs", "program", 0.7)
    for item in labels.get("pollutants") or []:
        add_from_label(item, "pollutantsMeasurements", "pollutant", 0.66)

    raw_grap = structured.get("grap")
    grap: Dict[str, Any] = raw_grap if isinstance(raw_grap, dict) else {}
    raw_stages = grap.get("stages")
    stages = raw_stages if isinstance(raw_stages, list) else []
    if stages:
        for stage_item in stages:
            if isinstance(stage_item, dict):
                stage_value = stage_item.get("value")
                evidence_text = _clean_text(stage_item.get("evidence"), 500)
                locator = _dict_copy(stage_item.get("locator"))
                confidence = _confidence(stage_item.get("score"), 0.82)
            else:
                stage_value = stage_item
                evidence_text = _clean_text(grap.get("evidence"), 500)
                locator = {}
                confidence = 0.82

            stage = _roman_stage(str(stage_value))
            if not stage:
                continue
            if evidence_text:
                evidence = exact_anchor(evidence_text, locator)
                if not evidence:
                    continue
                out.append(
                    _make_item(
                        label=f"GRAP Stage {stage}",
                        item_type="program_stage",
                        category="programStages",
                        normalized=f"grap_stage_{stage.casefold()}",
                        confidence=confidence,
                        source="taxonomy",
                        evidence=evidence,
                    )
                )
    elif grap.get("stage") and grap.get("evidence"):
        stage = _roman_stage(str(grap.get("stage")))
        if stage:
            evidence = exact_anchor(_clean_text(grap.get("evidence"), 500) or "", {})
            if not evidence:
                return out
            out.append(
                _make_item(
                    label=f"GRAP Stage {stage}",
                    item_type="program_stage",
                    category="programStages",
                    normalized=f"grap_stage_{stage.casefold()}",
                    confidence=0.8,
                    source="taxonomy",
                    evidence=evidence,
                )
            )

    return out


def _normalize_item(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    label = _clean_text(raw.get("label") or raw.get("value"), 180)
    category = _clean_text(raw.get("category"), 80)
    item_type = _clean_text(raw.get("type"), 80) or "intelligence_item"
    if not label or category not in CATEGORY_KEYS:
        return None

    ev_raw = raw.get("evidence")
    ev_arr = ev_raw if isinstance(ev_raw, list) else ([ev_raw] if ev_raw else [])
    evidence: List[Dict[str, Any]] = []
    for ev in ev_arr:
        if isinstance(ev, dict):
            quote = str(ev.get("quote") or ev.get("evidence") or "").strip()
            quote = quote[:1200]
            if not quote:
                continue
            item: Dict[str, Any] = {"quote": quote}
            page = _page_from_locator(ev.get("locator") if isinstance(ev.get("locator"), dict) else None)
            page_raw = ev.get("page")
            try:
                page = int(page_raw) if page_raw is not None else page
            except (TypeError, ValueError):
                pass
            if page is not None:
                item["page"] = page
            section = _clean_text(ev.get("section"), 180)
            if section:
                item["section"] = section
            if isinstance(ev.get("locator"), dict):
                item["locator"] = ev.get("locator")
            for key in ("charStart", "charEnd"):
                try:
                    if ev.get(key) is not None:
                        item[key] = max(0, int(ev.get(key)))
                except (TypeError, ValueError):
                    pass
            source_unit_id = _clean_text(ev.get("sourceUnitId"), 80)
            if source_unit_id:
                item["sourceUnitId"] = source_unit_id
            evidence.append(item)
        else:
            quote = str(ev or "").strip()[:1200]
            if quote:
                evidence.append({"quote": quote})

    if not evidence:
        return None

    normalized = _clean_text(raw.get("normalizedValue"), 180) or _norm(label)
    locator = raw.get("locator") if isinstance(raw.get("locator"), dict) else evidence[0].get("locator")
    return {
        "id": _clean_text(raw.get("id"), 80)
        or _item_id(category, item_type, normalized, str(evidence[0].get("quote") or "")),
        "label": label,
        "type": item_type,
        "category": category,
        "normalizedValue": normalized,
        "confidence": round(_confidence(raw.get("confidence"), 0.6), 3),
        "source": _clean_text(raw.get("source"), 80) or "llm",
        "evidence": evidence[:50],
        "locator": locator if isinstance(locator, dict) else None,
        "status": _clean_text(raw.get("status"), 80) or "matched",
        "validation": raw.get("validation")
        if isinstance(raw.get("validation"), dict)
        else None,
    }


def _payload_items(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    raw_items: List[Any] = []
    for key in CATEGORY_KEYS:
        arr = payload.get(key)
        if isinstance(arr, list):
            raw_items.extend(arr)
    if isinstance(payload.get("items"), list):
        raw_items.extend(payload.get("items") or [])

    out: List[Dict[str, Any]] = []
    seen = set()
    for raw in raw_items:
        item = _normalize_item(raw)
        if not item:
            continue
        key = _dedupe_key(item)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


_CLOSED_INTELLIGENCE_CATEGORIES = {
    "agencies",
    "programs",
    "programStages",
    "locations",
    "sectors",
    "pollutantsMeasurements",
}


def _collapsed_with_offsets(value: str) -> Tuple[str, List[int]]:
    collapsed: List[str] = []
    offsets: List[int] = []
    in_space = False
    for index, char in enumerate(value):
        if char.isspace():
            if collapsed and not in_space:
                collapsed.append(" ")
                offsets.append(index)
            in_space = True
            continue
        folded = char.casefold()
        for folded_char in folded:
            collapsed.append(folded_char)
            offsets.append(index)
        in_space = False
    if collapsed and collapsed[-1] == " ":
        collapsed.pop()
        offsets.pop()
    return "".join(collapsed), offsets


def _exact_source_anchor(
    evidence: Dict[str, Any],
    units: Sequence[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    requested_quote = re.sub(
        r"^\s*\[[^]]+\]\s*", "", str(evidence.get("quote") or "")
    ).strip()
    if not requested_quote:
        return None
    requested_page = _page_from_locator(
        evidence.get("locator") if isinstance(evidence.get("locator"), dict) else None
    )
    try:
        if evidence.get("page") is not None:
            requested_page = int(evidence.get("page"))
    except (TypeError, ValueError):
        pass

    ordered_units = sorted(
        list(units),
        key=lambda unit: 0
        if requested_page is not None
        and _page_from_locator(_dict_copy(unit.get("locator"))) == requested_page
        else 1,
    )
    quote_collapsed, _ = _collapsed_with_offsets(requested_quote)
    if len(quote_collapsed) < 4:
        return None

    for unit in ordered_units:
        source = str(unit.get("text") or "")
        if not source:
            continue
        source_collapsed, offsets = _collapsed_with_offsets(source)
        found = source_collapsed.find(quote_collapsed)
        if found < 0 or not offsets:
            continue
        local_start = offsets[found]
        final_position = min(found + len(quote_collapsed) - 1, len(offsets) - 1)
        local_end = offsets[final_position] + 1
        original_quote = source[local_start:local_end]
        locator = _dict_copy(unit.get("locator"))
        base_start = int(locator.get("charStart") or 0)
        page = _page_from_locator(locator)
        anchor: Dict[str, Any] = {
            "quote": original_quote,
            "locator": locator,
            "charStart": base_start + local_start,
            "charEnd": base_start + local_end,
            "sourceUnitId": str(
                unit.get("sourceUnitId")
                or locator.get("sourceUnitId")
                or stable_operation_id("source-unit", locator, source)
            ),
        }
        if page is not None:
            anchor["page"] = page
        section = _clean_text(locator.get("section") or locator.get("heading"), 180)
        if section:
            anchor["section"] = section
        return anchor
    return None


def _validated_llm_items(
    llm_payload: Any,
    grounding_units: Sequence[Dict[str, Any]],
    deterministic: Dict[str, Any],
) -> List[Dict[str, Any]]:
    deterministic_keys = {
        _dedupe_key(item) for item in _payload_items(deterministic)
    }
    accepted: List[Dict[str, Any]] = []
    for item in _payload_items(llm_payload):
        confidence = float(item.get("confidence") or 0)
        if confidence < 0.65:
            continue
        evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
        supported_evidence = [
            anchor
            for ev in evidence
            if isinstance(ev, dict)
            if (anchor := _exact_source_anchor(ev, grounding_units)) is not None
        ]
        if not supported_evidence:
            continue
        label_tokens = re.findall(r"[a-z0-9]+", str(item.get("label") or "").casefold())
        label_phrase = " ".join(label_tokens)
        evidence_text = " ".join(
            re.findall(
                r"[a-z0-9]+",
                " ".join(str(ev.get("quote") or "") for ev in supported_evidence).casefold(),
            )
        )
        label_is_explicit = bool(
            label_phrase
            and (
                len(label_phrase) >= 3
                or (len(label_tokens) == 1 and label_tokens[0].isdigit())
            )
            and re.search(rf"\b{re.escape(label_phrase)}\b", evidence_text)
        )
        if (
            item.get("category") in _CLOSED_INTELLIGENCE_CATEGORIES
            and _dedupe_key(item) not in deterministic_keys
            and not label_is_explicit
        ):
            continue
        item["evidence"] = supported_evidence[:50]
        item["source"] = "llm_validated"
        item["locator"] = supported_evidence[0].get("locator")
        prior_validation = _dict_copy(item.get("validation"))
        item["validation"] = {
            **prior_validation,
            "grounding": "exact_source_span",
            "entailment": prior_validation.get("entailment") or "pending",
            "validator": prior_validation.get("validator") or "source_span_v1",
        }
        accepted.append(item)
    return accepted


def _make_payload(
    items: Iterable[Dict[str, Any]],
    *,
    map_coverage: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    merged: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for raw in items:
        item = _normalize_item(raw)
        if not item:
            continue
        key = _dedupe_key(item)
        existing = merged.get(key)
        if not existing:
            merged[key] = item
            continue

        if float(item.get("confidence") or 0) > float(existing.get("confidence") or 0):
            existing["confidence"] = item.get("confidence")
            if existing.get("source") != item.get("source"):
                existing["source"] = "hybrid"

        seen_quotes = {
            _norm(ev.get("quote")) for ev in existing.get("evidence", []) if isinstance(ev, dict)
        }
        for ev in item.get("evidence", []):
            quote_key = _norm(ev.get("quote")) if isinstance(ev, dict) else ""
            if quote_key and quote_key not in seen_quotes:
                existing.setdefault("evidence", []).append(ev)
                seen_quotes.add(quote_key)
        existing["evidence"] = existing.get("evidence", [])[:50]
        if item.get("validation") and not existing.get("validation"):
            existing["validation"] = item.get("validation")

    ordered = sorted(
        merged.values(),
        key=lambda it: (
            CATEGORY_KEYS.index(str(it.get("category")))
            if it.get("category") in CATEGORY_KEYS
            else 99,
            -float(it.get("confidence") or 0),
            str(it.get("label") or ""),
        ),
    )
    payload: Dict[str, Any] = {
        "profile": PROFILE,
        "version": 1,
        "domain": DOMAIN,
        "mapCoverage": map_coverage
        or {
            "mode": "deterministic_only",
            "required": False,
            "attempted": False,
            "totalWindows": 0,
            "succeededWindows": 0,
            "failedWindows": 0,
            "validationTotalBatches": 0,
            "validationSucceededBatches": 0,
            "validationFailedBatches": 0,
            "complete": False,
            "receipts": [],
        },
    }
    for key in CATEGORY_KEYS:
        payload[key] = [item for item in ordered if item.get("category") == key]
    payload["items"] = ordered
    return StructuredIntelligenceV1(**payload).model_dump(exclude_none=True)


def _has_llm_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY"))


def _client():
    from openai import OpenAI

    base = os.getenv("OPENAI_BASE_URL") or os.getenv("OPENROUTER_BASE_URL")
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("No OPENAI_API_KEY/OPENROUTER_API_KEY provided")
    return OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)


_CATEGORY_BATCHES: Tuple[Tuple[str, ...], ...] = (
    ("topics", "agencies", "programs", "programStages"),
    ("legalReferences", "actionsDecisions", "requirements", "restrictions"),
    ("locations", "sectors", "pollutantsMeasurements", "datesDeadlines"),
    ("claims",),
)

_ENTAILMENT_REQUIRED_CATEGORIES = {
    "actionsDecisions",
    "requirements",
    "restrictions",
    "programStages",
    "datesDeadlines",
    "claims",
}


def _llm_schema(categories: Sequence[str]) -> Dict[str, Any]:
    evidence_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "quote": {"type": "string"},
            "page": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
            "section": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            "locator": {
                "anyOf": [
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {},
                        "required": [],
                    },
                    {"type": "null"},
                ]
            },
        },
        "required": ["quote", "page", "section", "locator"],
    }
    item_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "id": {"type": "string"},
            "label": {"type": "string"},
            "type": {"type": "string"},
            "category": {"type": "string", "enum": list(categories)},
            "normalizedValue": {"type": "string"},
            "confidence": {
                "anyOf": [
                    {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    {"type": "null"},
                ]
            },
            "source": {"type": "string"},
            "evidence": {"type": "array", "items": evidence_schema},
            "locator": {
                "anyOf": [
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {},
                        "required": [],
                    },
                    {"type": "null"},
                ]
            },
            "status": {"type": "string"},
        },
        "required": [
            "id",
            "label",
            "type",
            "category",
            "normalizedValue",
            "confidence",
            "source",
            "evidence",
            "locator",
            "status",
        ],
    }
    properties: Dict[str, Any] = {
        "profile": {"type": "string", "enum": [PROFILE]},
        "version": {"type": "integer", "enum": [1]},
        "domain": {"type": "string", "enum": [DOMAIN]},
        "items": {"type": "array", "items": item_schema},
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": ["profile", "version", "domain", "items"],
    }


def _critic_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "verdict": {
                            "type": "string",
                            "enum": ["supported", "contradicted", "insufficient"],
                        },
                        "reason": {"type": "string"},
                    },
                    "required": ["id", "verdict", "reason"],
                },
            }
        },
        "required": ["items"],
    }


def _window_text(window: Sequence[Dict[str, Any]]) -> str:
    return "\n\n".join(
        f"{_locator_prefix(unit.get('locator') or {}).strip()}\n{str(unit.get('text') or '').strip()}"
        for unit in window
        if str(unit.get("text") or "").strip()
    )


def _split_window(
    window: Sequence[Dict[str, Any]],
) -> Optional[Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]]:
    units = list(window)
    if len(units) > 1:
        midpoint = max(1, len(units) // 2)
        return units[:midpoint], units[midpoint:]
    if not units:
        return None
    unit = units[0]
    text = str(unit.get("text") or "")
    minimum = max(200, STRUCTURED_INTELLIGENCE_LLM_MIN_SPLIT_CHARS)
    if len(text) < minimum * 2:
        return None
    midpoint = len(text) // 2
    candidates = [
        text.rfind("\n", minimum, midpoint + 1),
        text.rfind(". ", minimum, midpoint + 1),
        text.find("\n", midpoint, len(text) - minimum),
        text.find(". ", midpoint, len(text) - minimum),
    ]
    valid = [point for point in candidates if minimum <= point <= len(text) - minimum]
    split_at = min(valid, key=lambda point: abs(point - midpoint)) if valid else midpoint
    if text[split_at : split_at + 2] == ". ":
        split_at += 2

    locator = _dict_copy(unit.get("locator"))
    source_unit_id = str(
        unit.get("sourceUnitId")
        or locator.get("sourceUnitId")
        or stable_operation_id("source-unit", locator, text)
    )
    base_start = int(locator.get("charStart") or 0)

    def part(raw: str, local_start: int, index: int) -> Dict[str, Any]:
        leading = len(raw) - len(raw.lstrip())
        value = raw.strip()
        start = base_start + local_start + leading
        loc = _dict_copy(locator)
        loc["adaptivePart"] = index
        loc["charStart"] = start
        loc["charEnd"] = start + len(value)
        loc["sourceUnitId"] = source_unit_id
        return {"text": value, "locator": loc, "sourceUnitId": source_unit_id}

    left = part(text[:split_at], 0, 1)
    right = part(text[split_at:], split_at, 2)
    if not left["text"] or not right["text"]:
        return None
    return [left], [right]


def _validate_category_payload(
    payload: Dict[str, Any], categories: Sequence[str]
) -> Dict[str, Any]:
    items = payload.get("items")
    if not isinstance(items, list):
        raise ValueError("Structured map response omitted items.")
    allowed = set(categories)
    if any(not isinstance(item, dict) or item.get("category") not in allowed for item in items):
        raise ValueError("Structured map response used an unrequested category.")
    return payload


def _run_entailment_critic(
    *,
    client: Any,
    items: Sequence[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int, int, int]:
    accepted: List[Dict[str, Any]] = []
    semantic: List[Dict[str, Any]] = []
    for item in items:
        if item.get("category") not in _ENTAILMENT_REQUIRED_CATEGORIES:
            item["validation"] = {
                **_dict_copy(item.get("validation")),
                "entailment": "exact_mention",
                "validator": "exact_mention_v1",
            }
            accepted.append(item)
        else:
            semantic.append(item)

    receipts: List[Dict[str, Any]] = []
    succeeded = 0
    failed = 0
    rejected = 0
    size = STRUCTURED_INTELLIGENCE_CRITIC_BATCH_SIZE
    for offset in range(0, len(semantic), size):
        batch = semantic[offset : offset + size]
        expected_ids = {str(item.get("id")) for item in batch}
        critic_input = [
            {
                "id": item.get("id"),
                "category": item.get("category"),
                "type": item.get("type"),
                "claim": item.get("label"),
                "evidence": [ev.get("quote") for ev in item.get("evidence", [])],
            }
            for item in batch
        ]
        operation_id = stable_operation_id(
            "entailment",
            STRUCTURED_INTELLIGENCE_LLM_MODEL,
            sorted(expected_ids),
            critic_input,
        )

        def request() -> Any:
            return client.chat.completions.create(
                model=STRUCTURED_INTELLIGENCE_LLM_MODEL,
                **chat_completion_kwargs(
                    model=STRUCTURED_INTELLIGENCE_LLM_MODEL,
                    temperature=0,
                    max_completion_tokens=max(800, len(batch) * 90),
                ),
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "intelligence_entailment_v1",
                        "strict": True,
                        "schema": _critic_schema(),
                    },
                },
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Judge whether each claim is logically entailed by its exact source evidence. "
                            "Check negation, modality, proposal versus adoption, actor, scope, and time. "
                            "Use supported only when the evidence proves the claim; otherwise use "
                            "contradicted or insufficient. Return every supplied id exactly once."
                        ),
                    },
                    {"role": "user", "content": json.dumps(critic_input, ensure_ascii=False)},
                ],
                timeout=STRUCTURED_INTELLIGENCE_LLM_TIMEOUT_S,
            )

        def validate(payload: Dict[str, Any]) -> Dict[str, Any]:
            decisions = payload.get("items")
            if not isinstance(decisions, list):
                raise ValueError("Critic response omitted items.")
            returned = [str(item.get("id")) for item in decisions if isinstance(item, dict)]
            if len(returned) != len(set(returned)) or set(returned) != expected_ids:
                raise ValueError("Critic response did not cover every requested item exactly once.")
            return payload

        outcome = execute_json_completion(
            operation_id=operation_id,
            request=request,
            validate=validate,
        )
        receipt = {**outcome.receipt, "operationType": "entailment"}
        receipts.append(receipt)
        if outcome.payload is None:
            failed += 1
            rejected += len(batch)
            continue
        succeeded += 1
        decisions = {
            str(decision.get("id")): decision
            for decision in outcome.payload.get("items") or []
            if isinstance(decision, dict)
        }
        for item in batch:
            decision = decisions.get(str(item.get("id"))) or {}
            verdict = str(decision.get("verdict") or "insufficient")
            if verdict != "supported":
                rejected += 1
                continue
            item["validation"] = {
                **_dict_copy(item.get("validation")),
                "entailment": "supported",
                "validator": "llm_critic_v1",
                "model": STRUCTURED_INTELLIGENCE_LLM_MODEL,
                "reason": _clean_text(decision.get("reason"), 300),
            }
            accepted.append(item)
    return accepted, receipts, succeeded, failed, rejected


def _extract_llm(
    *,
    content: str,
    file_name: Optional[str],
    deterministic: Dict[str, Any],
    grounding_units: Sequence[Dict[str, Any]] = (),
) -> Dict[str, Any]:
    if not STRUCTURED_INTELLIGENCE_LLM_ENABLED or not _has_llm_key():
        return _make_payload(
            [],
            map_coverage={
                "mode": "unavailable",
                "required": True,
                "attempted": False,
                "totalWindows": 0,
                "succeededWindows": 0,
                "failedWindows": 0,
                "validationTotalBatches": 0,
                "validationSucceededBatches": 0,
                "validationFailedBatches": 0,
                "complete": False,
                "receipts": [],
            },
        )
    body = (content or "").strip()
    if not body:
        return _make_payload(
            [],
            map_coverage={
                "mode": "empty_source",
                "required": True,
                "attempted": False,
                "totalWindows": 0,
                "succeededWindows": 0,
                "failedWindows": 0,
                "validationTotalBatches": 0,
                "validationSucceededBatches": 0,
                "validationFailedBatches": 0,
                "complete": False,
                "receipts": [],
            },
        )

    system_prompt = """Extract air-quality governance intelligence into the provided schema.
Rules:
- Return only schema-valid JSON containing the requested category batch.
- Every item must have direct document evidence.
- Extract plural facts; never collapse multiple GRAP stages, agencies, orders, dates, restrictions, or requirements into one item.
- Emit each supported item once in the items array.
- Do not invent facts not supported by the text.
- For agencies, programmes, stages, locations, sectors, and pollutants, the
  emitted label must be explicitly named in its evidence. Semantic association
  is not enough: Pollution Under Control is not CPCB, national capital is not
  NCR, odd-even is not GRAP, and generic pollution names no pollutant.
- Prefer full official names while retaining a stated acronym in the label when
  useful.
- Locations are open vocabulary. Extract every explicitly named state, district,
  city, town, village, locality, road, facility, and monitoring-station location,
  even when it is not present in the supplied policy taxonomy.
"""
    source_units = _candidate_units(
        body,
        grounding_units,
        max_chars=max(1000, STRUCTURED_INTELLIGENCE_LLM_MAX_CHARS),
        overlap=0,
    )
    windows: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    current_chars = 0
    max_chars = max(1000, STRUCTURED_INTELLIGENCE_LLM_MAX_CHARS)
    for unit in source_units:
        unit_chars = len(str(unit.get("text") or ""))
        if current and current_chars + unit_chars > max_chars:
            windows.append(current)
            current = []
            current_chars = 0
        current.append(unit)
        current_chars += unit_chars
    if current:
        windows.append(current)

    client = _client()
    mapped_items: List[Dict[str, Any]] = []
    receipts: List[Dict[str, Any]] = []

    def map_leaf(
        window: Sequence[Dict[str, Any]],
        categories: Sequence[str],
        lineage: str,
    ) -> None:
        document_text = _window_text(window)
        operation_id = stable_operation_id(
            "extract",
            STRUCTURED_INTELLIGENCE_LLM_MODEL,
            list(categories),
            lineage,
            [unit.get("sourceUnitId") for unit in window],
            document_text,
        )
        user_prompt = f"""File name:
{file_name or "unknown"}

Requested categories:
{", ".join(categories)}

Document text with source locators:
{document_text}
"""

        def request() -> Any:
            return client.chat.completions.create(
                model=STRUCTURED_INTELLIGENCE_LLM_MODEL,
                **chat_completion_kwargs(
                    model=STRUCTURED_INTELLIGENCE_LLM_MODEL,
                    temperature=0,
                    max_completion_tokens=STRUCTURED_INTELLIGENCE_LLM_MAX_OUTPUT_TOKENS,
                ),
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "structured_intelligence_map_v2",
                        "strict": True,
                        "schema": _llm_schema(categories),
                    },
                },
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                timeout=STRUCTURED_INTELLIGENCE_LLM_TIMEOUT_S,
            )

        outcome = execute_json_completion(
            operation_id=operation_id,
            request=request,
            validate=lambda payload: _validate_category_payload(payload, categories),
        )
        receipt = {
            **outcome.receipt,
            "operationType": "extract",
            "categories": list(categories),
            "lineage": lineage,
        }
        if outcome.payload is not None:
            receipts.append(receipt)
            mapped_items.extend(_payload_items(outcome.payload))
            return

        split = _split_window(window)
        if (
            split is not None
            and outcome.receipt.get("errorCode")
            in {"output_incomplete", "invalid_response", "empty_response"}
        ):
            receipts.append({**receipt, "status": "split"})
            map_leaf(split[0], categories, lineage + ".1")
            map_leaf(split[1], categories, lineage + ".2")
            return
        receipts.append(receipt)

    for window_index, window in enumerate(windows, start=1):
        for batch_index, categories in enumerate(_CATEGORY_BATCHES, start=1):
            map_leaf(window, categories, f"w{window_index}.b{batch_index}")

    grounded = _validated_llm_items(
        _make_payload(mapped_items),
        source_units,
        deterministic,
    )
    (
        validated,
        critic_receipts,
        critic_succeeded,
        critic_failed,
        rejected_items,
    ) = _run_entailment_critic(client=client, items=grounded)
    receipts.extend(critic_receipts)
    leaf_map_receipts = [
        receipt
        for receipt in receipts
        if receipt.get("operationType") == "extract"
        and receipt.get("status") != "split"
    ]
    map_succeeded = sum(
        1 for receipt in leaf_map_receipts if receipt.get("status") == "succeeded"
    )
    map_failed = sum(
        1 for receipt in leaf_map_receipts if receipt.get("status") == "failed"
    )
    validation_total = critic_succeeded + critic_failed
    complete = bool(leaf_map_receipts) and map_failed == 0 and critic_failed == 0
    return _make_payload(
        validated,
        map_coverage={
            "mode": "llm_map_merge",
            "required": True,
            "attempted": True,
            "totalWindows": len(leaf_map_receipts),
            "succeededWindows": map_succeeded,
            "failedWindows": map_failed,
            "validationTotalBatches": validation_total,
            "validationSucceededBatches": critic_succeeded,
            "validationFailedBatches": critic_failed,
            "rejectedItems": rejected_items,
            "complete": complete,
            "receipts": receipts,
        },
    )


def extract_structured_intelligence_deterministic(
    *,
    content: str,
    structured: Any = None,
    grounding_units: Sequence[Dict[str, Any]] = (),
) -> Dict[str, Any]:
    units = _candidate_units(content, grounding_units)
    items: List[Dict[str, Any]] = []
    _add_rule_matches(items, units, _TOPIC_RULES)
    _add_rule_matches(items, units, _AGENCY_RULES)
    _add_rule_matches(items, units, _LOCATION_RULES)
    _add_rule_matches(items, units, _SECTOR_RULES)
    _add_rule_matches(items, units, _ACTION_RULES)
    _add_rule_matches(items, units, _REQUIREMENT_RULES)
    _add_rule_matches(items, units, _RESTRICTION_RULES)
    _extract_grap(items, units)
    _extract_legal_refs(items, units)
    _extract_dates_measurements_claims(items, units)
    items.extend(_items_from_structured(structured, units))
    return _make_payload(items)


def build_structured_intelligence(
    *,
    content: str,
    file_name: Optional[str] = None,
    structured: Any = None,
    grounding_units: Sequence[Dict[str, Any]] = (),
    allow_llm: bool = False,
) -> Dict[str, Any]:
    if not STRUCTURED_INTELLIGENCE_ENABLED:
        return _make_payload(
            [],
            map_coverage={
                "mode": "disabled",
                "required": bool(allow_llm),
                "attempted": False,
                "totalWindows": 0,
                "succeededWindows": 0,
                "failedWindows": 0,
                "validationTotalBatches": 0,
                "validationSucceededBatches": 0,
                "validationFailedBatches": 0,
                "complete": False,
                "receipts": [],
            },
        )

    deterministic = extract_structured_intelligence_deterministic(
        content=content,
        structured=structured,
        grounding_units=grounding_units,
    )
    if not allow_llm:
        return deterministic

    llm_payload = _extract_llm(
        content=content,
        file_name=file_name,
        deterministic=deterministic,
        grounding_units=grounding_units,
    )
    source_units = _candidate_units(content, grounding_units)
    validated_llm_items = _validated_llm_items(
        llm_payload,
        source_units,
        deterministic,
    )
    validated_llm_items = [
        item
        for item in validated_llm_items
        if item.get("category") not in _ENTAILMENT_REQUIRED_CATEGORIES
        or _dict_copy(item.get("validation")).get("entailment") == "supported"
    ]
    return _make_payload(
        [
            *_payload_items(deterministic),
            *validated_llm_items,
        ],
        map_coverage=(
            llm_payload.get("mapCoverage")
            if isinstance(llm_payload.get("mapCoverage"), dict)
            else None
        ),
    )


__all__ = [
    "EvidenceAnchor",
    "IntelligenceItem",
    "StructuredIntelligenceV1",
    "build_structured_intelligence",
    "extract_structured_intelligence_deterministic",
]
