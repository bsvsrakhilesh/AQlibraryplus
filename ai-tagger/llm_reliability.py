from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional


LLM_WINDOW_MAX_ATTEMPTS = max(
    1, int(os.getenv("LLM_WINDOW_MAX_ATTEMPTS", "3"))
)
LLM_WINDOW_RETRY_BASE_SECONDS = max(
    0.0, float(os.getenv("LLM_WINDOW_RETRY_BASE_SECONDS", "0.5"))
)
LLM_OPERATION_VERSION = os.getenv(
    "LLM_OPERATION_VERSION", "ai-tag-map-v3"
)


class CompletionFailure(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class CompletionOutcome:
    payload: Optional[Dict[str, Any]]
    receipt: Dict[str, Any]


def stable_operation_id(*parts: Any) -> str:
    canonical = json.dumps(
        [LLM_OPERATION_VERSION, *parts],
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return "op_" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:20]


def _error_code(exc: BaseException) -> str:
    if isinstance(exc, CompletionFailure):
        return exc.code
    status = getattr(exc, "status_code", None)
    if status == 429:
        return "rate_limited"
    if status in (408, 409):
        return "transient_http"
    if isinstance(status, int) and status >= 500:
        return "upstream_error"
    name = exc.__class__.__name__.casefold()
    if "timeout" in name:
        return "timeout"
    if isinstance(exc, (json.JSONDecodeError, ValueError, TypeError, KeyError)):
        return "invalid_response"
    return "request_failed"


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, CompletionFailure):
        return exc.retryable
    status = getattr(exc, "status_code", None)
    if status in (408, 409, 429):
        return True
    if isinstance(status, int) and status >= 500:
        return True
    name = exc.__class__.__name__.casefold()
    if "timeout" in name or "connection" in name:
        return True
    return isinstance(exc, (json.JSONDecodeError, ValueError, TypeError, KeyError))


def _parse_response(response: Any) -> Dict[str, Any]:
    choices = getattr(response, "choices", None) or []
    if not choices:
        raise CompletionFailure(
            "empty_response", "The model returned no choices.", retryable=True
        )
    choice = choices[0]
    finish_reason = str(getattr(choice, "finish_reason", "") or "").casefold()
    if finish_reason in {"length", "max_tokens"}:
        raise CompletionFailure(
            "output_incomplete",
            "The structured response reached its output limit.",
            retryable=False,
        )
    if finish_reason == "content_filter":
        raise CompletionFailure(
            "content_filtered",
            "The structured response was filtered.",
            retryable=False,
        )
    message = getattr(choice, "message", None)
    refusal = getattr(message, "refusal", None)
    if refusal:
        raise CompletionFailure(
            "refused", "The model refused the extraction request.", retryable=False
        )
    raw = str(getattr(message, "content", "") or "").strip()
    if not raw:
        raise CompletionFailure(
            "empty_response", "The model returned empty content.", retryable=True
        )
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise CompletionFailure(
            "invalid_response", "Expected a JSON object.", retryable=True
        )
    return parsed


def execute_json_completion(
    *,
    operation_id: str,
    request: Callable[[], Any],
    validate: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
    max_attempts: int = LLM_WINDOW_MAX_ATTEMPTS,
    retry_base_seconds: float = LLM_WINDOW_RETRY_BASE_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> CompletionOutcome:
    attempts = 0
    last_code = "request_failed"
    for attempt in range(1, max(1, int(max_attempts)) + 1):
        attempts = attempt
        try:
            payload = _parse_response(request())
            if validate is not None:
                payload = validate(payload)
            item_count = len(payload.get("items") or [])
            return CompletionOutcome(
                payload=payload,
                receipt={
                    "operationId": operation_id,
                    "status": "succeeded",
                    "attempts": attempts,
                    "itemCount": item_count,
                    "errorCode": None,
                },
            )
        except Exception as exc:
            last_code = _error_code(exc)
            if not _retryable(exc) or attempt >= max(1, int(max_attempts)):
                break
            delay = max(0.0, retry_base_seconds) * (2 ** (attempt - 1))
            if delay:
                sleep(delay)

    return CompletionOutcome(
        payload=None,
        receipt={
            "operationId": operation_id,
            "status": "failed",
            "attempts": attempts,
            "itemCount": 0,
            "errorCode": last_code,
        },
    )


__all__ = [
    "CompletionFailure",
    "CompletionOutcome",
    "execute_json_completion",
    "stable_operation_id",
]
