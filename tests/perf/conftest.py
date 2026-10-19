"""Count Mongo commands issued during a request (Motor CommandListener)."""
from __future__ import annotations

from typing import List

from pymongo import monitoring


WRITE_COMMANDS = frozenset(
    {"insert", "update", "delete", "findAndModify", "bulkWrite"}
)


class CommandCounter(monitoring.CommandListener):
    def __init__(self) -> None:
        self.command_names: List[str] = []
        self.writes = 0

    def started(self, event: monitoring.CommandStartedEvent) -> None:
        name = event.command_name
        self.command_names.append(name)
        if name in WRITE_COMMANDS:
            self.writes += 1

    def succeeded(self, event: monitoring.CommandSucceededEvent) -> None:
        return

    def failed(self, event: monitoring.CommandFailedEvent) -> None:
        return

    def reset(self) -> None:
        self.command_names.clear()
        self.writes = 0

    @property
    def commands(self) -> List[str]:
        return list(self.command_names)


_LISTENER = CommandCounter()
try:
    monitoring.register(_LISTENER)
except Exception:
    pass


def command_counter() -> CommandCounter:
    return _LISTENER
