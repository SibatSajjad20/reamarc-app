## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Strict Scope & Quality Rules
- Touch ONLY files and services explicitly required for the assigned task.
- NEVER edit shared business logic in core services (`attendance_service.py`, `leave_balance.py`, `security.py`, `auth.py`, `database.py`) unless the user explicitly instructed work on that module.
- Never classify active work arrangements (`wfh`, `short_leave`, `night_shift`) as non-working leaves or absent locks.
- Every lock or validation gate must be tested for both the rejected case AND legitimate cases (especially WFH).
- Always audit `git diff --stat` before finishing to ensure zero unintended file edits.

