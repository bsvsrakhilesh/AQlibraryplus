# ai-tagger/reranker.py
import os
from typing import List, Optional


def has_llm_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY"))


def get_llm_model() -> str:
    return os.getenv("LLM_MODEL", "gpt-4o-mini")


def _extract_json_array(s: str) -> Optional[List[str]]:
    import json
    import re

    if not s:
        return None

    # Strip common Markdown fences if present.
    s = re.sub(r"^```(?:json)?\s*", "", s.strip(), flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s.strip())

    # Fast path: valid JSON.
    try:
        data = json.loads(s)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except Exception:
        pass

    # Best-effort: find the first JSON array in the text.
    start = s.find("[")
    end = s.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        data = json.loads(s[start : end + 1])
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except Exception:
        return None

    return None

def _openai_client():
    from openai import OpenAI
    base = os.getenv("OPENAI_BASE_URL") or os.getenv("OPENROUTER_BASE_URL")
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("No OPENAI_API_KEY/OPENROUTER_API_KEY provided")
    client = OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)
    model = get_llm_model()
    return client, model

PROMPT = """You are an assistant that turns candidate keywords into FINAL tags for search.
Return a JSON array of 10–20 concise tags (each 1–3 words). Deduplicate synonyms. Prefer technical/domain terms.
Candidates:
{cands}

Output ONLY a JSON array of strings.
"""

def rerank_with_llm(candidates: List[str], topk: int = 20, context_text: Optional[str] = None) -> List[str]:
    # small & cheap – only pass candidates
    if not candidates:
        return []
    if not has_llm_key():
        return candidates[:topk]

    client, model = _openai_client()

    snippet = (context_text or "").strip()
    if len(snippet) > 6000:
        snippet = snippet[:6000] + "..."

    content = PROMPT.format(cands="\n".join(f"- {c}" for c in candidates[:120]))
    if snippet:
        content = f"{content}\n\nContent snippet:\n{snippet}\n"
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Return only valid JSON. No prose."},
            {"role": "user", "content": content},
        ],
        temperature=0.2,
        max_tokens=256,
    )
    txt = (resp.choices[0].message.content or "").strip()
    arr = _extract_json_array(txt)
    if arr:
        return arr[:topk]
    # fallback to top candidates
    return candidates[:topk]
