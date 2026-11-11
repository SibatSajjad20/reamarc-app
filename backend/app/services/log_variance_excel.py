"""
Excel (.xlsx) Export Generator for Log Variance (Summary, Daily Detail, Exceptions).
Uses OpenPyXL with standard styles matching attendance_excel.py.
"""
from __future__ import annotations

import io
from typing import Any, Dict, List, Optional
from datetime import datetime

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

NAVY_HEADER_HEX = "1E293B"
WHITE_HEX = "FFFFFF"
ALT_ROW_HEX = "F8FAFC"
YELLOW_WEEKEND_HEX = "FEF3C7"
RED_LATE_HEX = "FEE2E2"
FOOTER_GRAY_HEX = "E2E8F0"
BORDER_GRAY_HEX = "CBD5E1"
BORDER_DARK_HEX = "0F172A"

FONT_NAME = "Calibri"

FONT_TITLE = Font(name=FONT_NAME, size=13, bold=True, color="1E293B")
FONT_SUBTITLE = Font(name=FONT_NAME, size=10, italic=True, color="64748B")
FONT_HEADER = Font(name=FONT_NAME, size=10, bold=True, color="FFFFFF")
FONT_DATA_REGULAR = Font(name=FONT_NAME, size=10, color="0F172A")
FONT_DATA_BOLD = Font(name=FONT_NAME, size=10, bold=True, color="0F172A")
FONT_DATA_MUTED = Font(name=FONT_NAME, size=10, color="64748B")

FILL_NAVY = PatternFill(start_color=NAVY_HEADER_HEX, end_color=NAVY_HEADER_HEX, fill_type="solid")
FILL_WHITE = PatternFill(start_color=WHITE_HEX, end_color=WHITE_HEX, fill_type="solid")
FILL_ALT = PatternFill(start_color=ALT_ROW_HEX, end_color=ALT_ROW_HEX, fill_type="solid")
FILL_WEEKEND = PatternFill(start_color=YELLOW_WEEKEND_HEX, end_color=YELLOW_WEEKEND_HEX, fill_type="solid")
FILL_FOOTER = PatternFill(start_color=FOOTER_GRAY_HEX, end_color=FOOTER_GRAY_HEX, fill_type="solid")

THIN_SIDE = Side(style="thin", color=BORDER_GRAY_HEX)
MEDIUM_SIDE = Side(style="medium", color=BORDER_DARK_HEX)
DOUBLE_SIDE = Side(style="double", color=BORDER_DARK_HEX)

BORDER_CELL = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
BORDER_HEADER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=MEDIUM_SIDE)
BORDER_FOOTER = Border(left=THIN_SIDE, right=THIN_SIDE, top=MEDIUM_SIDE, bottom=DOUBLE_SIDE)

ALIGN_LEFT = Alignment(horizontal="left", vertical="center")
ALIGN_CENTER = Alignment(horizontal="center", vertical="center")
ALIGN_RIGHT = Alignment(horizontal="right", vertical="center")


def _m_to_h(minutes: Optional[int]) -> Optional[float]:
    if minutes is None:
        return None
    return round(minutes / 60.0, 2)


def generate_log_variance_excel(
    variance_data: Dict[str, Any],
    daily_details: List[Dict[str, Any]],
    exceptions_data: Dict[str, Any],
) -> io.BytesIO:
    """
    Generate 3-sheet workbook:
    1. Summary
    2. Daily detail
    3. Exceptions
    """
    wb = openpyxl.Workbook()

    # ──────────────────────────────────────────────────────────
    # SHEET 1: Summary
    # ──────────────────────────────────────────────────────────
    ws_summary = wb.active
    ws_summary.title = "Summary"
    ws_summary.views.sheetView[0].showGridLines = True

    rng = variance_data.get("range", {})
    start_d = rng.get("start", "")
    end_d = rng.get("end", "")

    # Title block
    ws_summary.cell(row=1, column=1, value="Log Variance Summary").font = FONT_TITLE
    ws_summary.cell(
        row=2,
        column=1,
        value=f"Range: {start_d} to {end_d} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    ).font = FONT_SUBTITLE

    summary_headers = [
        "Employee",
        "Department",
        "Days present",
        "Worked h",
        "Logged h",
        "Variance h",
        "Coverage %",
        "Avg logged/day",
        "Avg worked/day",
        "Avg per scheduled day",
        "Submission %",
        "Days missing",
        "Days under target",
        "Logged outside present days",
        "Inactive",
    ]

    start_row = 4
    for col_idx, h_text in enumerate(summary_headers, start=1):
        cell = ws_summary.cell(row=start_row, column=col_idx, value=h_text)
        cell.font = FONT_HEADER
        cell.fill = FILL_NAVY
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_HEADER

    curr_row = start_row + 1
    rows = variance_data.get("rows", [])
    for idx, r in enumerate(rows):
        fill = FILL_ALT if idx % 2 == 1 else FILL_WHITE
        worked_h = _m_to_h(r.get("worked"))
        logged_h = _m_to_h(r.get("logged"))
        variance_h = _m_to_h(r.get("variance"))
        avg_log_h = _m_to_h(r.get("avg_logged_per_day"))
        avg_work_h = _m_to_h(r.get("avg_worked_per_day"))
        avg_sched_h = _m_to_h(r.get("avg_logged_per_scheduled_day"))
        outside_h = _m_to_h(r.get("logged_outside"))

        values = [
            r.get("name"),
            r.get("department") or "—",
            r.get("days_present", 0),
            worked_h,
            logged_h,
            variance_h,
            r.get("coverage_pct"),
            avg_log_h,
            avg_work_h,
            avg_sched_h,
            r.get("submission_pct"),
            r.get("days_missing", 0),
            r.get("days_under_target", 0),
            outside_h,
            "Yes" if r.get("inactive") else "No",
        ]

        for col_idx, val in enumerate(values, start=1):
            cell = ws_summary.cell(row=curr_row, column=col_idx, value=val)
            cell.font = FONT_DATA_REGULAR
            cell.fill = fill
            cell.border = BORDER_CELL
            if col_idx in (1, 2):
                cell.alignment = ALIGN_LEFT
            elif col_idx in (3, 12, 13, 15):
                cell.alignment = ALIGN_CENTER
            else:
                cell.alignment = ALIGN_RIGHT
                if isinstance(val, float):
                    cell.number_format = "0.00"

        curr_row += 1

    # Team Totals row
    summary_data = variance_data.get("summary", {})
    team_worked_h = _m_to_h(summary_data.get("worked"))
    team_logged_h = _m_to_h(summary_data.get("logged"))
    team_variance_h = _m_to_h(summary_data.get("variance"))
    team_avg_log_h = _m_to_h(summary_data.get("avg_logged_per_day"))
    team_avg_work_h = _m_to_h(summary_data.get("avg_worked_per_day"))
    team_avg_sched_h = _m_to_h(summary_data.get("avg_logged_per_scheduled_day"))
    team_outside_h = _m_to_h(summary_data.get("logged_outside"))

    team_values = [
        f"Team total · {len(rows)} people",
        "—",
        summary_data.get("days_present", 0),
        team_worked_h,
        team_logged_h,
        team_variance_h,
        summary_data.get("coverage_pct"),
        team_avg_log_h,
        team_avg_work_h,
        team_avg_sched_h,
        summary_data.get("submission_pct"),
        summary_data.get("days_missing", 0),
        summary_data.get("days_under_target", 0),
        team_outside_h,
        "—",
    ]

    for col_idx, val in enumerate(team_values, start=1):
        cell = ws_summary.cell(row=curr_row, column=col_idx, value=val)
        cell.font = FONT_DATA_BOLD
        cell.fill = FILL_FOOTER
        cell.border = BORDER_FOOTER
        if col_idx in (1, 2):
            cell.alignment = ALIGN_LEFT
        elif col_idx in (3, 12, 13, 15):
            cell.alignment = ALIGN_CENTER
        else:
            cell.alignment = ALIGN_RIGHT
            if isinstance(val, float):
                cell.number_format = "0.00"

    curr_row += 2

    # Formula notes block
    notes = [
        "Formula Notes:",
        "• Worked = attendance working hours + pending overtime (rejected overtime excluded). Live shifts and past missing checkouts excluded.",
        "• Logged = sum of daily log hours utilized on that date. Late entries count on their work date.",
        "• Variance = Worked - Logged (positive = unlogged time, negative = over-logged).",
        "• Coverage % = (Total Logged ÷ Total Worked) × 100 over present days only. Target: 95%.",
        "• Avg Logged / Day = Total Logged ÷ Days Present (excludes off days, leave, holidays, and partial live today).",
        "• Submission % = Days with at least one log entry ÷ Days Present.",
        "• Under target = present day with more than 30m unlogged.",
    ]
    for n_text in notes:
        c = ws_summary.cell(row=curr_row, column=1, value=n_text)
        c.font = FONT_DATA_MUTED
        curr_row += 1

    # Auto-fit columns
    for col in ws_summary.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_summary.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # ──────────────────────────────────────────────────────────
    # SHEET 2: Daily detail
    # ──────────────────────────────────────────────────────────
    ws_detail = wb.create_sheet(title="Daily detail")
    ws_detail.views.sheetView[0].showGridLines = True

    ws_detail.cell(row=1, column=1, value="Daily Person-Day Breakdown").font = FONT_TITLE
    ws_detail.cell(
        row=2,
        column=1,
        value=f"Range: {start_d} to {end_d}",
    ).font = FONT_SUBTITLE

    detail_headers = [
        "Employee",
        "Department",
        "Date",
        "Status",
        "Check-In",
        "Check-Out",
        "Worked h",
        "Pending OT h",
        "Expected h",
        "Logged h",
        "Variance h",
        "Coverage %",
        "Tone",
        "Flags",
        "Entries Count",
        "Compare Ready",
    ]

    start_row = 4
    for col_idx, h_text in enumerate(detail_headers, start=1):
        cell = ws_detail.cell(row=start_row, column=col_idx, value=h_text)
        cell.font = FONT_HEADER
        cell.fill = FILL_NAVY
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_HEADER

    curr_row = start_row + 1
    for idx, day_row in enumerate(daily_details):
        fill = FILL_ALT if idx % 2 == 1 else FILL_WHITE
        worked_h = _m_to_h(day_row.get("worked"))
        pending_ot_h = _m_to_h(day_row.get("pending_ot"))
        expected_h = _m_to_h(day_row.get("expected"))
        logged_h = _m_to_h(day_row.get("logged"))
        variance_h = _m_to_h(day_row.get("variance"))

        values = [
            day_row.get("employee_name"),
            day_row.get("department") or "—",
            day_row.get("date"),
            day_row.get("status_label") or day_row.get("status"),
            day_row.get("check_in") or "—",
            day_row.get("check_out") or "—",
            worked_h,
            pending_ot_h,
            expected_h,
            logged_h,
            variance_h,
            day_row.get("coverage_pct"),
            day_row.get("tone"),
            ", ".join(day_row.get("flags") or []),
            day_row.get("entries_count", 0),
            "Yes" if day_row.get("compare_ready") else "No",
        ]

        for col_idx, val in enumerate(values, start=1):
            cell = ws_detail.cell(row=curr_row, column=col_idx, value=val)
            cell.font = FONT_DATA_REGULAR
            cell.fill = fill
            cell.border = BORDER_CELL
            if col_idx in (1, 2, 4, 14):
                cell.alignment = ALIGN_LEFT
            elif col_idx in (3, 5, 6, 13, 15, 16):
                cell.alignment = ALIGN_CENTER
            else:
                cell.alignment = ALIGN_RIGHT
                if isinstance(val, float):
                    cell.number_format = "0.00"

        curr_row += 1

    for col in ws_detail.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_detail.column_dimensions[col_letter].width = max(max_len + 3, 11)

    # ──────────────────────────────────────────────────────────
    # SHEET 3: Exceptions
    # ──────────────────────────────────────────────────────────
    ws_exc = wb.create_sheet(title="Exceptions")
    ws_exc.views.sheetView[0].showGridLines = True

    ws_exc.cell(row=1, column=1, value="Log Exceptions").font = FONT_TITLE
    ws_exc.cell(
        row=2,
        column=1,
        value=f"Range: {start_d} to {end_d}",
    ).font = FONT_SUBTITLE

    exc_headers = [
        "Employee",
        "Department",
        "Date",
        "Exception Type",
        "Detail",
        "Review State",
        "Worked h",
        "Logged h",
        "Variance h",
    ]

    start_row = 4
    for col_idx, h_text in enumerate(exc_headers, start=1):
        cell = ws_exc.cell(row=start_row, column=col_idx, value=h_text)
        cell.font = FONT_HEADER
        cell.fill = FILL_NAVY
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_HEADER

    curr_row = start_row + 1
    groups = exceptions_data.get("groups", [])
    exc_items: List[Dict[str, Any]] = []
    for g in groups:
        exc_items.extend(g.get("items") or [])

    for idx, item in enumerate(exc_items):
        fill = FILL_ALT if idx % 2 == 1 else FILL_WHITE
        worked_h = _m_to_h(item.get("worked"))
        logged_h = _m_to_h(item.get("logged"))
        variance_h = _m_to_h(item.get("variance"))

        values = [
            item.get("user_name"),
            item.get("department") or "—",
            item.get("date"),
            item.get("type_label") or item.get("type"),
            item.get("detail"),
            item.get("review_state"),
            worked_h,
            logged_h,
            variance_h,
        ]

        for col_idx, val in enumerate(values, start=1):
            cell = ws_exc.cell(row=curr_row, column=col_idx, value=val)
            cell.font = FONT_DATA_REGULAR
            cell.fill = fill
            cell.border = BORDER_CELL
            if col_idx in (1, 2, 4, 5, 6):
                cell.alignment = ALIGN_LEFT
            elif col_idx in (3,):
                cell.alignment = ALIGN_CENTER
            else:
                cell.alignment = ALIGN_RIGHT
                if isinstance(val, float):
                    cell.number_format = "0.00"

        curr_row += 1

    for col in ws_exc.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_exc.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
