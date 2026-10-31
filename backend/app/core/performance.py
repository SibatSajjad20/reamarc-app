"""Per-request timing and Mongo command instrumentation."""
from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Optional

from pymongo import monitoring


@dataclass
class RequestMetrics:
    mongo_commands: int = 0


_request_metrics: ContextVar[Optional[RequestMetrics]] = ContextVar(
    "request_metrics", default=None
)


def begin_request_metrics() -> tuple[RequestMetrics, Token]:
    metrics = RequestMetrics()
    return metrics, _request_metrics.set(metrics)


def end_request_metrics(token: Token) -> None:
    _request_metrics.reset(token)


class MongoCommandCounter(monitoring.CommandListener):
    """Count commands without logging command payloads or database data."""

    def started(self, event) -> None:  # pragma: no cover - called by PyMongo
        metrics = _request_metrics.get()
        if metrics is not None:
            metrics.mongo_commands += 1

    def succeeded(self, event) -> None:  # pragma: no cover
        return None

    def failed(self, event) -> None:  # pragma: no cover
        return None
