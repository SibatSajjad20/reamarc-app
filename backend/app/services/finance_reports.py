"""Receivables reports service: Ageing Summary, Ageing Detail, Client Statement, Collections, and WHT Reports."""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.finance_pdf import NumberedCanvas, format_currency_amount

logger = logging.getLogger(__name__)


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _calc_days_overdue(due_date_str: str, as_of_str: str) -> int:
    try:
        due = datetime.strptime(due_date_str, "%Y-%m-%d")
        as_of = datetime.strptime(as_of_str, "%Y-%m-%d")
        delta = (as_of - due).days
        return max(0, delta)
    except Exception:
        return 0


def _get_age_bucket(days: int) -> str:
    if days <= 0:
        return "current"
    elif days <= 30:
        return "1_30"
    elif days <= 60:
        return "31_60"
    elif days <= 90:
        return "61_90"
    else:
        return "90_plus"


async def get_ageing_summary_report(
    db,
    company_id: str,
    as_of_date: Optional[str] = None,
    client_name: Optional[str] = None,
    currency: Optional[str] = None,
) -> Dict[str, Any]:
    """Receivables Ageing Summary: Client rows x Age Buckets x Currencies."""
    as_of = as_of_date or _today_str()
    coll = db["invoices"]

    query: Dict[str, Any] = {
        "company_id": company_id,
        "issue_date": {"$lte": as_of},
        "status": {"$in": ["issued", "partially_paid", "overdue", "paid"]},
    }
    if client_name:
        query["client_name"] = {"$regex": client_name.strip(), "$options": "i"}
    if currency and currency.upper() != "ALL":
        query["currency"] = currency.upper().strip()

    cursor = coll.find(query)
    invoices = await cursor.to_list(length=1000)

    # To calculate exact balance as of date:
    # balance_as_of = total - receipts posted on or before as_of date
    # (Receipts voided after as_of date still counted on as_of date!)
    clients_map: Dict[str, Dict[str, Any]] = {}
    currencies_summary: Dict[str, Dict[str, int]] = {}

    for inv in invoices:
        inv_id = inv["id"]
        c_name = inv.get("client_name", "Unknown Client")
        curr = inv.get("currency", "PKR")
        total = inv.get("total", 0)

        # Find receipts allocated to this invoice on or before as_of date
        rcpt_cursor = db["receipts"].find({
            "company_id": company_id,
            "date": {"$lte": as_of},
            "allocations.invoice_id": inv_id,
            "$or": [
                {"status": "posted"},
                {"status": "void", "voided_at": {"$gt": as_of}},
            ],
        })
        matched_receipts = await rcpt_cursor.to_list(length=50)

        paid_as_of = 0
        wht_as_of = 0
        for r in matched_receipts:
            for al in r.get("allocations", []):
                if al.get("invoice_id") == inv_id:
                    paid_as_of += al.get("amount", 0)
                    wht_as_of += al.get("wht", 0)

        bal_as_of = max(0, total - (paid_as_of + wht_as_of))
        if bal_as_of <= 0:
            continue

        days = _calc_days_overdue(inv.get("due_date", as_of), as_of)
        bucket = _get_age_bucket(days)

        client_key = f"{c_name}_{curr}"
        if client_key not in clients_map:
            clients_map[client_key] = {
                "client_name": c_name,
                "currency": curr,
                "current": 0,
                "1_30": 0,
                "31_60": 0,
                "61_90": 0,
                "90_plus": 0,
                "total": 0,
            }

        clients_map[client_key][bucket] += bal_as_of
        clients_map[client_key]["total"] += bal_as_of

        if curr not in currencies_summary:
            currencies_summary[curr] = {
                "current": 0,
                "1_30": 0,
                "31_60": 0,
                "61_90": 0,
                "90_plus": 0,
                "total": 0,
            }
        currencies_summary[curr][bucket] += bal_as_of
        currencies_summary[curr]["total"] += bal_as_of

    rows = sorted(clients_map.values(), key=lambda r: (r["currency"], -r["total"]))
    return {
        "as_of_date": as_of,
        "rows": rows,
        "currencies_summary": currencies_summary,
    }


async def get_ageing_detail_report(
    db,
    company_id: str,
    as_of_date: Optional[str] = None,
    client_name: Optional[str] = None,
    currency: Optional[str] = None,
) -> Dict[str, Any]:
    """Receivables Ageing Detail: Invoice rows grouped by Client."""
    as_of = as_of_date or _today_str()
    coll = db["invoices"]

    query: Dict[str, Any] = {
        "company_id": company_id,
        "issue_date": {"$lte": as_of},
        "status": {"$in": ["issued", "partially_paid", "overdue", "paid"]},
    }
    if client_name:
        query["client_name"] = {"$regex": client_name.strip(), "$options": "i"}
    if currency and currency.upper() != "ALL":
        query["currency"] = currency.upper().strip()

    cursor = coll.find(query).sort("due_date", 1)
    invoices = await cursor.to_list(length=1000)

    groups: Dict[str, Dict[str, Any]] = {}
    for inv in invoices:
        inv_id = inv["id"]
        c_name = inv.get("client_name", "Unknown Client")
        curr = inv.get("currency", "PKR")
        total = inv.get("total", 0)

        rcpt_cursor = db["receipts"].find({
            "company_id": company_id,
            "date": {"$lte": as_of},
            "allocations.invoice_id": inv_id,
            "$or": [
                {"status": "posted"},
                {"status": "void", "voided_at": {"$gt": as_of}},
            ],
        })
        matched_receipts = await rcpt_cursor.to_list(length=50)

        paid_as_of = 0
        wht_as_of = 0
        for r in matched_receipts:
            for al in r.get("allocations", []):
                if al.get("invoice_id") == inv_id:
                    paid_as_of += al.get("amount", 0)
                    wht_as_of += al.get("wht", 0)

        bal_as_of = max(0, total - (paid_as_of + wht_as_of))
        if bal_as_of <= 0:
            continue

        days = _calc_days_overdue(inv.get("due_date", as_of), as_of)

        group_key = f"{c_name}_{curr}"
        if group_key not in groups:
            groups[group_key] = {
                "client_name": c_name,
                "currency": curr,
                "invoices": [],
                "subtotal_total": 0,
                "subtotal_paid": 0,
                "subtotal_wht": 0,
                "subtotal_balance": 0,
            }

        inv_row = {
            "id": inv["id"],
            "number": inv.get("number"),
            "issue_date": inv.get("issue_date"),
            "due_date": inv.get("due_date"),
            "days_overdue": days,
            "total": total,
            "amount_paid": paid_as_of,
            "wht_settled": wht_as_of,
            "balance_due": bal_as_of,
            "status": "overdue" if days > 0 else "current",
        }
        groups[group_key]["invoices"].append(inv_row)
        groups[group_key]["subtotal_total"] += total
        groups[group_key]["subtotal_paid"] += paid_as_of
        groups[group_key]["subtotal_wht"] += wht_as_of
        groups[group_key]["subtotal_balance"] += bal_as_of

    return {"as_of_date": as_of, "groups": list(groups.values())}


async def get_client_statement_report(
    db,
    company_id: str,
    client_name: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    currency: Optional[str] = "PKR",
) -> Dict[str, Any]:
    """Client Statement: Opening balance + Chronological Invoices & Receipts with running balance."""
    start_date = date_from or "2020-01-01"
    end_date = date_to or _today_str()
    curr = (currency or "PKR").upper().strip()

    # 1. Calculate Opening Balance before start_date
    prior_inv_cursor = db["invoices"].find({
        "company_id": company_id,
        "client_name": {"$regex": f"^{client_name}$", "$options": "i"},
        "currency": curr,
        "issue_date": {"$lt": start_date},
        "status": {"$in": ["issued", "partially_paid", "overdue", "paid"]},
    })
    prior_invoices = await prior_inv_cursor.to_list(length=500)
    prior_inv_total = sum(i.get("total", 0) for i in prior_invoices)

    prior_rcpt_cursor = db["receipts"].find({
        "company_id": company_id,
        "client_name": {"$regex": f"^{client_name}$", "$options": "i"},
        "currency": curr,
        "date": {"$lt": start_date},
        "status": "posted",
    })
    prior_receipts = await prior_rcpt_cursor.to_list(length=500)
    prior_settled = sum(r.get("settles_total", 0) for r in prior_receipts)
    opening_balance = max(0, prior_inv_total - prior_settled)

    # 2. Collect Invoices and Receipts in Date Range
    period_invoices_cursor = db["invoices"].find({
        "company_id": company_id,
        "client_name": {"$regex": f"^{client_name}$", "$options": "i"},
        "currency": curr,
        "issue_date": {"$gte": start_date, "$lte": end_date},
        "status": {"$in": ["issued", "partially_paid", "overdue", "paid"]},
    })
    period_invoices = await period_invoices_cursor.to_list(length=500)

    period_receipts_cursor = db["receipts"].find({
        "company_id": company_id,
        "client_name": {"$regex": f"^{client_name}$", "$options": "i"},
        "currency": curr,
        "date": {"$gte": start_date, "$lte": end_date},
        "status": "posted",
    })
    period_receipts = await period_receipts_cursor.to_list(length=500)

    # 3. Interleave and Sort Chronologically
    transactions = []
    for inv in period_invoices:
        transactions.append({
            "type": "invoice",
            "date": inv.get("issue_date"),
            "number": inv.get("number"),
            "description": f"Invoice {inv.get('number')} (Due: {inv.get('due_date')})",
            "debit": inv.get("total", 0),
            "credit": 0,
        })
    for rcpt in period_receipts:
        memo = f"Receipt {rcpt.get('number')} via {rcpt.get('method', '').upper()}"
        if rcpt.get("reference_number"):
            memo += f" (Ref: {rcpt.get('reference_number')})"
        transactions.append({
            "type": "receipt",
            "date": rcpt.get("date"),
            "number": rcpt.get("number"),
            "description": memo,
            "debit": 0,
            "credit": rcpt.get("settles_total", 0),
        })

    transactions.sort(key=lambda t: t["date"])

    # Compute Running Balance
    running_balance = opening_balance
    for t in transactions:
        running_balance = running_balance + t["debit"] - t["credit"]
        t["running_balance"] = running_balance

    return {
        "client_name": client_name,
        "currency": curr,
        "date_from": start_date,
        "date_to": end_date,
        "opening_balance": opening_balance,
        "closing_balance": running_balance,
        "transactions": transactions,
    }


async def get_collections_report(
    db,
    company_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    method: Optional[str] = None,
    bank: Optional[str] = None,
) -> Dict[str, Any]:
    """Collections breakdown by method and bank account."""
    start_date = date_from or "2020-01-01"
    end_date = date_to or _today_str()

    query: Dict[str, Any] = {
        "company_id": company_id,
        "date": {"$gte": start_date, "$lte": end_date},
        "status": "posted",
    }
    if method and method.lower() != "all":
        query["method"] = method.lower().strip()
    if bank and bank.lower() != "all":
        query["bank"] = bank.lower().strip()

    cursor = db["receipts"].find(query).sort("date", -1)
    receipts = await cursor.to_list(length=1000)

    summary = {
        "cash_pkr": 0,
        "abl_pkr": 0,
        "meezan_pkr": 0,
        "total_wht_pkr": 0,
        "total_collected_pkr": 0,
    }

    for r in receipts:
        pkr = r.get("pkr_amount", 0)
        m = r.get("method")
        b = r.get("bank")

        summary["total_collected_pkr"] += pkr
        if m == "cash":
            summary["cash_pkr"] += pkr
        elif b == "abl":
            summary["abl_pkr"] += pkr
        elif b == "meezan":
            summary["meezan_pkr"] += pkr

        # Convert WHT to PKR for summary
        if r.get("currency") == "PKR":
            summary["total_wht_pkr"] += r.get("wht_amount", 0)
        elif r.get("exchange_rate"):
            summary["total_wht_pkr"] += int(round(r.get("wht_amount", 0) * r.get("exchange_rate")))

    return {
        "date_from": start_date,
        "date_to": end_date,
        "receipts": receipts,
        "summary": summary,
    }


async def get_wht_report(
    db,
    company_id: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    client_name: Optional[str] = None,
) -> Dict[str, Any]:
    """WHT withholding tracker with certificate verification status."""
    start_date = date_from or "2020-01-01"
    end_date = date_to or _today_str()

    query: Dict[str, Any] = {
        "company_id": company_id,
        "date": {"$gte": start_date, "$lte": end_date},
        "wht_amount": {"$gt": 0},
        "status": "posted",
    }
    if client_name:
        query["client_name"] = {"$regex": client_name.strip(), "$options": "i"}

    cursor = db["receipts"].find(query).sort("date", -1)
    records = await cursor.to_list(length=500)

    total_wht_pkr = 0
    total_with_cert = 0
    total_pending_cert = 0

    items = []
    for r in records:
        wht_amt = r.get("wht_amount", 0)
        has_cert = bool(r.get("wht_certificate_file_id"))
        if has_cert:
            total_with_cert += 1
        else:
            total_pending_cert += 1

        if r.get("currency") == "PKR":
            wht_pkr = wht_amt
        else:
            rate = r.get("exchange_rate") or 1.0
            wht_pkr = int(round(wht_amt * rate))
        total_wht_pkr += wht_pkr

        items.append({
            "receipt_id": r["id"],
            "receipt_number": r.get("number"),
            "date": r.get("date"),
            "client_name": r.get("client_name"),
            "currency": r.get("currency"),
            "wht_amount": wht_amt,
            "wht_pkr": wht_pkr,
            "has_certificate": has_cert,
            "certificate_file_id": r.get("wht_certificate_file_id"),
        })

    return {
        "date_from": start_date,
        "date_to": end_date,
        "total_wht_pkr": total_wht_pkr,
        "total_with_cert": total_with_cert,
        "total_pending_cert": total_pending_cert,
        "items": items,
    }


def export_ageing_summary_excel(report: Dict[str, Any]) -> bytes:
    """Generate professional Excel workbook for Ageing Summary report."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Ageing Summary"

    # Styling
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="2B2D42", end_color="2B2D42", fill_type="solid")
    sub_fill = PatternFill(start_color="E9E5F5", end_color="E9E5F5", fill_type="solid")
    bold_font = Font(name="Calibri", size=10, bold=True)
    num_fmt = "#,##0"

    ws.append([f"Receivables Ageing Summary (As of {report.get('as_of_date')})"])
    ws.merge_cells("A1:G1")
    ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="2B2D42")
    ws.append([])

    headers = ["Client Name", "Currency", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total"]
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=3, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="right" if col_idx > 2 else "left")

    row_num = 4
    for r in report.get("rows", []):
        ws.append([
            r["client_name"],
            r["currency"],
            r["current"] / 100.0,
            r["1_30"] / 100.0,
            r["31_60"] / 100.0,
            r["61_90"] / 100.0,
            r["90_plus"] / 100.0,
            r["total"] / 100.0,
        ])
        for c_idx in range(3, 9):
            ws.cell(row=row_num, column=c_idx).number_format = num_fmt
        row_num += 1

    # Totals per currency
    ws.append([])
    row_num += 1
    for curr, totals in report.get("currencies_summary", {}).items():
        ws.append([
            f"TOTAL {curr}",
            curr,
            totals["current"] / 100.0,
            totals["1_30"] / 100.0,
            totals["31_60"] / 100.0,
            totals["61_90"] / 100.0,
            totals["90_plus"] / 100.0,
            totals["total"] / 100.0,
        ])
        for c_idx in range(1, 9):
            c = ws.cell(row=row_num, column=c_idx)
            c.font = bold_font
            c.fill = sub_fill
            if c_idx >= 3:
                c.number_format = num_fmt
        row_num += 1

    # Adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_ageing_summary_pdf(report: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """Generate landscape PDF report for Ageing Summary."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()
    normal = styles["Normal"]

    th_style = ParagraphStyle("RTh", parent=normal, fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.HexColor("#2B2D42"))
    td_style = ParagraphStyle("RTd", parent=normal, fontName="Helvetica", fontSize=8, leading=10)
    td_right = ParagraphStyle("RTdRight", parent=td_style, alignment=2)
    bold_right = ParagraphStyle("RBoldRight", parent=td_style, fontName="Helvetica-Bold", alignment=2)

    story: List[Any] = []
    as_of = report.get("as_of_date", "")

    # Title
    story.append(Paragraph(f'<font size="16"><b>Receivables Ageing Summary</b></font>', normal))
    story.append(Paragraph(f'<font color="#64748B" size="9">As of: <b>{as_of}</b> · Generated on {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</font>', normal))
    story.append(Spacer(1, 15))

    table_data = [
        [
            Paragraph("Client Name", th_style),
            Paragraph("Currency", th_style),
            Paragraph("Current", bold_right),
            Paragraph("1-30 Days", bold_right),
            Paragraph("31-60 Days", bold_right),
            Paragraph("61-90 Days", bold_right),
            Paragraph("90+ Days", bold_right),
            Paragraph("Total", bold_right),
        ]
    ]

    for r in report.get("rows", []):
        curr = r["currency"]
        table_data.append([
            Paragraph(r["client_name"], td_style),
            Paragraph(curr, td_style),
            Paragraph(format_currency_amount(r["current"], curr), td_right),
            Paragraph(format_currency_amount(r["1_30"], curr), td_right),
            Paragraph(format_currency_amount(r["31_60"], curr), td_right),
            Paragraph(format_currency_amount(r["61_90"], curr), td_right),
            Paragraph(format_currency_amount(r["90_plus"], curr), td_right),
            Paragraph(format_currency_amount(r["total"], curr), bold_right),
        ])

    for curr, totals in report.get("currencies_summary", {}).items():
        table_data.append([
            Paragraph(f"<b>TOTAL {curr}</b>", th_style),
            Paragraph(curr, th_style),
            Paragraph(format_currency_amount(totals["current"], curr), bold_right),
            Paragraph(format_currency_amount(totals["1_30"], curr), bold_right),
            Paragraph(format_currency_amount(totals["31_60"], curr), bold_right),
            Paragraph(format_currency_amount(totals["61_90"], curr), bold_right),
            Paragraph(format_currency_amount(totals["90_plus"], curr), bold_right),
            Paragraph(format_currency_amount(totals["total"], curr), bold_right),
        ])

    col_widths = [180, 50, 85, 85, 85, 85, 85, 115]
    summary_table = Table(table_data, colWidths=col_widths)
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9E5F5")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(summary_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()
