"""PDF generation for Invoices, Receipts, and Reports using ReportLab."""
from __future__ import annotations

import io
import math
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.pdfgen import canvas
    from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    REPORTLAB_AVAILABLE = True
except ImportError:
    colors = None  # type: ignore
    A4 = None  # type: ignore
    ParagraphStyle = None  # type: ignore
    getSampleStyleSheet = None  # type: ignore
    inch = None  # type: ignore
    canvas = None  # type: ignore
    HRFlowable = None  # type: ignore
    KeepTogether = None  # type: ignore
    Paragraph = None  # type: ignore
    SimpleDocTemplate = None  # type: ignore
    Spacer = None  # type: ignore
    Table = None  # type: ignore
    TableStyle = None  # type: ignore
    REPORTLAB_AVAILABLE = False

_BaseCanvas = canvas.Canvas if REPORTLAB_AVAILABLE else object


# Number to words helper supporting Pakistani numbering (Crores, Lakhs) and International (Millions)
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two_digits_to_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    tens = _TENS[n // 10]
    ones = _ONES[n % 10]
    return f"{tens} {ones}".strip() if ones else tens


def _three_digits_to_words(n: int) -> str:
    hundreds = n // 100
    rest = n % 100
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_two_digits_to_words(rest))
    return " ".join(parts)


def number_to_words_pakistani(amount: int) -> str:
    """Convert integer number into Pakistani numbering words (Crore, Lakh, Thousand)."""
    if amount == 0:
        return "Zero"

    parts = []
    crores = amount // 10000000
    amount %= 10000000

    lakhs = amount // 100000
    amount %= 100000

    thousands = amount // 1000
    amount %= 1000

    hundreds = amount

    if crores:
        parts.append(f"{_three_digits_to_words(crores)} Crore")
    if lakhs:
        parts.append(f"{_two_digits_to_words(lakhs)} Lakh")
    if thousands:
        parts.append(f"{_two_digits_to_words(thousands)} Thousand")
    if hundreds:
        parts.append(_three_digits_to_words(hundreds))

    return " ".join(parts)


def number_to_words_western(amount: int) -> str:
    """Convert integer number into Western numbering words (Billion, Million, Thousand)."""
    if amount == 0:
        return "Zero"

    parts = []
    billions = amount // 1000000000
    amount %= 1000000000

    millions = amount // 1000000
    amount %= 1000000

    thousands = amount // 1000
    amount %= 1000

    hundreds = amount

    if billions:
        parts.append(f"{_three_digits_to_words(billions)} Billion")
    if millions:
        parts.append(f"{_three_digits_to_words(millions)} Million")
    if thousands:
        parts.append(f"{_three_digits_to_words(thousands)} Thousand")
    if hundreds:
        parts.append(_three_digits_to_words(hundreds))

    return " ".join(parts)


def amount_in_words(minor_units: int, currency: str = "PKR") -> str:
    """Return amount in words with currency prefix and Only suffix.
    
    e.g. 145,000 PKR (14500000 minor units) -> 'Rupees One Lakh Forty Five Thousand Only'
    """
    currency = currency.strip().upper()
    main_units = minor_units // 100
    sub_units = minor_units % 100

    if currency == "PKR":
        words = number_to_words_pakistani(main_units)
        curr_label = "Rupees"
        sub_label = "Paisa"
    elif currency == "USD":
        words = number_to_words_western(main_units)
        curr_label = "US Dollars"
        sub_label = "Cents"
    elif currency == "GBP":
        words = number_to_words_western(main_units)
        curr_label = "British Pounds"
        sub_label = "Pence"
    else:
        words = number_to_words_western(main_units)
        curr_label = currency
        sub_label = "Cents"

    if sub_units > 0:
        sub_words = _two_digits_to_words(sub_units)
        return f"{curr_label} {words} and {sub_words} {sub_label} Only"
    return f"{curr_label} {words} Only"


def format_currency_amount(minor_units: int, currency: str = "PKR") -> str:
    """Format minor units into human readable string with commas and currency code."""
    val = minor_units / 100.0
    if val.is_integer():
        formatted = f"{int(val):,}"
    else:
        formatted = f"{val:,.2f}"
    return f"{currency} {formatted}"


class NumberedCanvas(_BaseCanvas):
    """Two-pass canvas to calculate and print total page numbers."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        # Footer text
        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(A4[0] - 36, 25, footer_text)
        self.restoreState()


def generate_invoice_pdf(invoice: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """Generate professional PDF for an invoice matching Reamarc specifications."""
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("PDF generation requires 'reportlab'. Please install with: pip install reportlab")
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()
    normal = styles["Normal"]

    # Custom styles
    primary_color = colors.HexColor("#2B2D42")
    brand_purple = colors.HexColor("#5046E5")
    lavender_bg = colors.HexColor("#E9E5F5")
    border_color = colors.HexColor("#CBD5E1")
    text_muted = colors.HexColor("#64748B")
    text_dark = colors.HexColor("#1E293B")

    style_company_title = ParagraphStyle(
        "CompanyTitle",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0F172A"),
        alignment=2,  # right
    )
    style_company_details = ParagraphStyle(
        "CompanyDetails",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=text_muted,
        alignment=2,  # right
    )
    style_invoice_heading = ParagraphStyle(
        "InvoiceHeading",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=primary_color,
    )
    style_label = ParagraphStyle(
        "LabelStyle",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=text_muted,
    )
    style_meta_value = ParagraphStyle(
        "MetaValue",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=text_dark,
    )
    style_th = ParagraphStyle(
        "TableHeading",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=primary_color,
    )
    style_td = ParagraphStyle(
        "TableCell",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=text_dark,
    )
    style_td_right = ParagraphStyle(
        "TableCellRight",
        parent=style_td,
        alignment=2,
    )
    style_words = ParagraphStyle(
        "WordsStyle",
        parent=normal,
        fontName="Helvetica-Oblique",
        fontSize=8.5,
        leading=12,
        textColor=primary_color,
    )

    story: List[Any] = []

    # 1. Header: Logo (left) and Company Info (right)
    # Using stylish vector typography for Reamarc Realty Digital Solutions logo
    logo_p = Paragraph(
        '<font color="#5046E5" size="20"><b>R</b></font> '
        '<font color="#1E293B" size="18"><b>reamarc</b></font><br/>'
        '<font color="#64748B" size="7">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Realty Digital Solutions</font>',
        normal,
    )

    comp_name = settings.get("company_name", "Reamarc - Digital Solutions")
    comp_addr = settings.get("company_address", "3rd Floor, Bldg. A-26, Business Bay, Sector-F, DHA-1\nPunjab PK").replace("\n", "<br/>")
    comp_phone = settings.get("company_phone", "+92 3070205555")
    comp_email = settings.get("company_email", "faizan.khan@reamarc.io")
    comp_web = settings.get("company_website", "http://reamarc.io")
    tax_id = settings.get("tax_id", "Govt. UID 9926976-3")

    comp_info_html = f"<b>{comp_name}</b><br/>{comp_addr}<br/>{comp_phone}<br/>{comp_email}<br/>{comp_web}<br/>{tax_id}"
    comp_p = Paragraph(comp_info_html, style_company_details)

    header_table = Table([[logo_p, comp_p]], colWidths=[200, 323])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 20))

    # 2. Invoice Title + Meta Section
    # Left: BILL TO
    billing = invoice.get("client_billing") or {}
    client_name = invoice.get("client_name", "Client")
    b_addr = (billing.get("address") or "").replace("\n", "<br/>")
    b_contact = " · ".join(filter(None, [billing.get("email"), billing.get("phone")]))

    bill_to_html = f'<font color="#1E293B"><b>INVOICE</b></font><br/><br/>' \
                   f'<font color="#64748B"><b>BILL TO</b></font><br/>' \
                   f'<font color="#0F172A"><b>{client_name}</b></font><br/>'
    if b_addr:
        bill_to_html += f'<font color="#475569">{b_addr}</font><br/>'
    if b_contact:
        bill_to_html += f'<font color="#475569">{b_contact}</font><br/>'
    if billing.get("tax_id"):
        bill_to_html += f'<font color="#64748B">NTN/Tax ID: {billing.get("tax_id")}</font>'

    bill_to_p = Paragraph(bill_to_html, style_meta_value)

    # Right: Invoice metadata table
    inv_num = invoice.get("number", "DRAFT")
    inv_date = invoice.get("issue_date", "")
    terms = invoice.get("terms", "Due on receipt")
    due_date = invoice.get("due_date", "")
    ref = invoice.get("reference") or "—"

    meta_data = [
        [Paragraph("INVOICE", style_label), Paragraph(f"<b>{inv_num}</b>", style_meta_value)],
        [Paragraph("DATE", style_label), Paragraph(inv_date, style_meta_value)],
        [Paragraph("TERMS", style_label), Paragraph(terms, style_meta_value)],
        [Paragraph("DUE DATE", style_label), Paragraph(due_date, style_meta_value)],
        [Paragraph("REFERENCE", style_label), Paragraph(ref, style_meta_value)],
    ]
    meta_table = Table(meta_data, colWidths=[80, 120])
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    info_table = Table([[bill_to_p, meta_table]], colWidths=[323, 200])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))

    # 3. Line Items Table
    currency = invoice.get("currency", "PKR")
    items = invoice.get("line_items", [])
    has_qty_rate = any(float(it.get("quantity", 1)) != 1 or it.get("quantity") is None for it in items)

    # Table headers matching the clean lavender theme
    table_data = []
    if has_qty_rate:
        table_data.append([
            Paragraph("SL", style_th),
            Paragraph("DESCRIPTION", style_th),
            Paragraph("QTY", style_th),
            Paragraph("RATE", style_th),
            Paragraph("AMOUNT", style_td_right),
        ])
        col_widths = [30, 273, 50, 80, 90]
    else:
        table_data.append([
            Paragraph("SL", style_th),
            Paragraph("DESCRIPTION", style_th),
            Paragraph("AMOUNT", style_td_right),
        ])
        col_widths = [30, 393, 100]

    for idx, item in enumerate(items, 1):
        desc = item.get("description", "")
        amt = format_currency_amount(item.get("amount", 0), currency)
        if has_qty_rate:
            qty = f"{item.get('quantity', 1):g}"
            rate = format_currency_amount(item.get("rate", 0), currency)
            table_data.append([
                Paragraph(str(idx), style_td),
                Paragraph(desc, style_td),
                Paragraph(qty, style_td),
                Paragraph(rate, style_td),
                Paragraph(amt, style_td_right),
            ])
        else:
            table_data.append([
                Paragraph(str(idx), style_td),
                Paragraph(desc, style_td),
                Paragraph(amt, style_td_right),
            ])

    items_table = Table(table_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), lavender_bg),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 15))

    # 4. Totals and Notes Section
    subtotal = invoice.get("subtotal", 0)
    discount_amount = invoice.get("discount_amount", 0)
    total = invoice.get("total", 0)
    amount_paid = invoice.get("amount_paid", 0)
    wht_settled = invoice.get("wht_settled", 0)
    balance_due = invoice.get("balance_due", 0)

    # Right side: Totals Box
    totals_rows = [
        [Paragraph("Subtotal", style_label), Paragraph(format_currency_amount(subtotal, currency), style_td_right)],
    ]
    if discount_amount > 0:
        totals_rows.append([
            Paragraph("Discount", style_label),
            Paragraph(f"-{format_currency_amount(discount_amount, currency)}", style_td_right),
        ])
    totals_rows.append([
        Paragraph("<b>Total</b>", style_label),
        Paragraph(f"<b>{format_currency_amount(total, currency)}</b>", style_td_right),
    ])
    if amount_paid > 0:
        totals_rows.append([
            Paragraph("Amount Paid", style_label),
            Paragraph(f"-{format_currency_amount(amount_paid, currency)}", style_td_right),
        ])
    if wht_settled > 0:
        totals_rows.append([
            Paragraph("WHT Settled", style_label),
            Paragraph(f"-{format_currency_amount(wht_settled, currency)}", style_td_right),
        ])
    totals_rows.append([
        Paragraph('<font color="#5046E5" size="10"><b>BALANCE DUE</b></font>', style_label),
        Paragraph(f'<font color="#5046E5" size="10"><b>{format_currency_amount(balance_due, currency)}</b></font>', style_td_right),
    ])

    totals_table = Table(totals_rows, colWidths=[90, 110])
    totals_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#F1F5F9")),
    ]))

    # Left side: Amount in words & client thank you
    words = amount_in_words(balance_due if balance_due > 0 else total, currency)
    notes_text = invoice.get("notes") or settings.get("notes_template") or "We greatly appreciate your business and the opportunity to serve you."
    left_summary = [
        Paragraph(f'<font color="#64748B">Amount in words:</font><br/><b>{words}</b>', style_words),
        Spacer(1, 8),
        Paragraph(f'<font color="#475569">{notes_text}</font>', style_meta_value),
    ]

    summary_table = Table([[left_summary, totals_table]], colWidths=[323, 200])
    summary_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))

    # 5. Bank Details Card
    # Chosen pay_to_bank or default Meezan bank
    pay_to = invoice.get("pay_to_bank")
    if not pay_to:
        banks = settings.get("bank_accounts") or []
        pay_to = banks[0] if banks else {}

    bank_name = pay_to.get("bank_name", "Meezan Bank")
    acc_title = pay_to.get("account_title", "Reamarc")
    acc_num = pay_to.get("account_number", "08140109366221")
    iban = pay_to.get("iban", "PK23MEZN0008140109366221")
    swift = pay_to.get("swift_code", "MEZNPKKAGRD")

    bank_html = f"<b>Please make payment to:</b><br/>" \
                f"Bank Name: {bank_name}<br/>" \
                f"Account Title: {acc_title}<br/>" \
                f"Account #: {acc_num}<br/>" \
                f"IBAN #: {iban}<br/>" \
                f"Swift Code : {swift}"

    bank_p = Paragraph(bank_html, style_meta_value)
    bank_card = Table([[bank_p]], colWidths=[523])
    bank_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, border_color),
    ]))
    story.append(bank_card)
    story.append(Spacer(1, 25))

    # 6. Signatures Row
    sig_labels = settings.get("signature_labels") or ["Account Officer", "Account Manager", "General Manager"]
    sig_cols = []
    for sig in sig_labels[:3]:
        sig_cols.append(Paragraph(f'<font color="#94A3B8">___________________</font><br/><b>{sig}</b>', style_meta_value))

    # Fill up to 3 cols
    while len(sig_cols) < 3:
        sig_cols.append(Paragraph("", style_meta_value))

    sig_table = Table([sig_cols], colWidths=[174, 174, 175])
    sig_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 20))

    # 7. Terms / Closing footer notice
    terms_text = invoice.get("terms_text") or settings.get("terms_template") or (
        "If you have any questions or require further clarification, please do not hesitate to contact us. "
        "We appreciate the opportunity to work with you and look forward to your response."
    )
    story.append(Paragraph(f'<font color="#64748B" size="7.5">{terms_text}</font>', normal))

    # Draw Status Watermark on Canvas if needed
    status_label = (invoice.get("status") or "").lower()

    def _draw_decorations(canv, document):
        if status_label in ("paid", "partially_paid", "void"):
            canv.saveState()
            canv.setFont("Helvetica-Bold", 45)
            canv.translate(300, 480)
            canv.rotate(25)
            if status_label == "paid":
                canv.setFillColor(colors.HexColor("#10B981"), alpha=0.18)
                canv.setStrokeColor(colors.HexColor("#10B981"), alpha=0.4)
                text = "PAID"
            elif status_label == "partially_paid":
                canv.setFillColor(colors.HexColor("#F59E0B"), alpha=0.18)
                canv.setStrokeColor(colors.HexColor("#F59E0B"), alpha=0.4)
                text = "PARTIALLY PAID"
            else:
                canv.setFillColor(colors.HexColor("#EF4444"), alpha=0.18)
                canv.setStrokeColor(colors.HexColor("#EF4444"), alpha=0.4)
                text = "VOID"

            canv.drawCentredString(0, 0, text)
            canv.rect(-130, -15, 260, 60, stroke=1, fill=0)
            canv.restoreState()

    doc.build(story, canvasmaker=NumberedCanvas, onFirstPage=_draw_decorations, onLaterPages=_draw_decorations)
    return buffer.getvalue()


def generate_receipt_pdf(receipt: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """Generate professional PDF for a receipt matching Page 3 of the uploaded reference."""
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("PDF generation requires 'reportlab'. Please install with: pip install reportlab")
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()
    normal = styles["Normal"]

    primary_color = colors.HexColor("#2B2D42")
    brand_purple = colors.HexColor("#5046E5")
    lavender_bg = colors.HexColor("#E9E5F5")
    border_color = colors.HexColor("#CBD5E1")
    text_muted = colors.HexColor("#64748B")
    text_dark = colors.HexColor("#1E293B")

    style_company_details = ParagraphStyle(
        "ReceiptCompDetails",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=text_muted,
        alignment=2,
    )
    style_th = ParagraphStyle(
        "RTh",
        parent=normal,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=primary_color,
    )
    style_td = ParagraphStyle(
        "RTd",
        parent=normal,
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=text_dark,
    )
    style_td_right = ParagraphStyle(
        "RTdRight",
        parent=style_td,
        alignment=2,
    )

    story: List[Any] = []

    # 1. Header
    logo_p = Paragraph(
        '<font color="#5046E5" size="20"><b>R</b></font> '
        '<font color="#1E293B" size="18"><b>reamarc</b></font><br/>'
        '<font color="#64748B" size="7">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Realty Digital Solutions</font>',
        normal,
    )

    comp_name = settings.get("company_name", "Reamarc - Digital Solutions")
    comp_addr = settings.get("company_address", "3rd Floor, Bldg. A-26, Business Bay, Sector-F, DHA-1\nPunjab PK").replace("\n", "<br/>")
    comp_phone = settings.get("company_phone", "+92 3070205555")
    comp_email = settings.get("company_email", "faizan.khan@reamarc.io")
    comp_web = settings.get("company_website", "http://reamarc.io")
    tax_id = settings.get("tax_id", "Govt. UID 9926976-3")

    comp_info_html = f"<b>{comp_name}</b><br/>{comp_addr}<br/>{comp_phone}<br/>{comp_email}<br/>{comp_web}<br/>{tax_id}"
    comp_p = Paragraph(comp_info_html, style_company_details)

    header_table = Table([[logo_p, comp_p]], colWidths=[200, 323])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 20))

    # 2. Receipt Title & Customer / Date info
    client_name = receipt.get("client_name", "Client")
    rcpt_date = receipt.get("date", "")
    rcpt_num = receipt.get("number", "")
    ref_num = receipt.get("reference_number") or receipt.get("id") or "—"

    left_info = Paragraph(
        f'<font color="#1E293B" size="20"><b>Receipt</b></font><br/><br/>'
        f'<font color="#64748B"><b>Received From</b></font><br/>'
        f'<font color="#0F172A" size="11"><b>{client_name}</b></font><br/>'
        f'<font color="#64748B">Receipt No: <b>{rcpt_num}</b></font>',
        normal,
    )
    right_info = Paragraph(
        f'<font color="#1E293B"><b>Date:</b> {rcpt_date}</font><br/><br/>'
        f'<font color="#1E293B"><b>Reference No:</b> {ref_num}</font>',
        ParagraphStyle("RMetaRight", parent=normal, alignment=2, leading=14),
    )

    cust_table = Table([[left_info, right_info]], colWidths=[300, 223])
    cust_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(cust_table)
    story.append(Spacer(1, 25))

    # 3. Allocations Table: Invoice Number | Invoice Date | Paid Date | Invoice Amount | Amount Paid | Balance
    currency = receipt.get("currency", "PKR")
    allocations = receipt.get("allocations", [])

    table_data = [
        [
            Paragraph("Invoice Number", style_th),
            Paragraph("Invoice Date", style_th),
            Paragraph("Paid Date", style_th),
            Paragraph("Invoice Amount", style_td_right),
            Paragraph("Amount Paid", style_td_right),
            Paragraph("Balance", style_td_right),
        ]
    ]

    total_paid_in_table = 0
    for alloc in allocations:
        inv_num = alloc.get("invoice_number", alloc.get("invoice_id", "—"))
        inv_date = alloc.get("invoice_date", rcpt_date)
        paid_date = rcpt_date
        inv_total = alloc.get("invoice_total", alloc.get("amount", 0))
        amt_paid = alloc.get("amount", 0) + alloc.get("wht", 0)
        bal = alloc.get("invoice_balance_due", 0)

        total_paid_in_table += amt_paid
        table_data.append([
            Paragraph(inv_num, style_td),
            Paragraph(inv_date, style_td),
            Paragraph(paid_date, style_td),
            Paragraph(format_currency_amount(inv_total, currency), style_td_right),
            Paragraph(format_currency_amount(amt_paid, currency), style_td_right),
            Paragraph(format_currency_amount(bal, currency), style_td_right),
        ])

    if not allocations:
        # Unallocated on-account payment
        amt_rec = receipt.get("amount_received", 0)
        table_data.append([
            Paragraph("On-Account Payment", style_td),
            Paragraph(rcpt_date, style_td),
            Paragraph(rcpt_date, style_td),
            Paragraph(format_currency_amount(amt_rec, currency), style_td_right),
            Paragraph(format_currency_amount(amt_rec, currency), style_td_right),
            Paragraph(format_currency_amount(0, currency), style_td_right),
        ])

    alloc_table = Table(table_data, colWidths=[100, 80, 80, 88, 88, 87])
    alloc_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), lavender_bg),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(alloc_table)
    story.append(Spacer(1, 15))

    # 4. Memo and Total Settled / Balance
    memo_text = receipt.get("memo") or f"Amount Received via {receipt.get('method', 'bank').upper()}"
    if receipt.get("bank"):
        memo_text += f" ({receipt.get('bank', '').upper()})"
    if receipt.get("reference_number"):
        memo_text += f" Ref # {receipt.get('reference_number')}"

    memo_p = Paragraph(f"<b>Memo:</b> {memo_text}", style_td)

    # Balance due or remaining unapplied credit
    settles_total = receipt.get("settles_total") or (receipt.get("amount_received", 0) + receipt.get("wht_amount", 0))
    right_summary = Paragraph(
        f'<font color="#1E293B" size="11"><b>Total Settled: {format_currency_amount(settles_total, currency)}</b></font>',
        ParagraphStyle("RightSum", parent=normal, alignment=2),
    )

    bottom_table = Table([[memo_p, right_summary]], colWidths=[323, 200])
    bottom_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(bottom_table)
    story.append(Spacer(1, 15))

    # Amount in words
    words = amount_in_words(receipt.get("amount_received", 0), currency)
    story.append(Paragraph(f'<font color="#64748B">Amount in words:</font> <i>{words}</i>', style_td))

    # Draw VOID stamp if voided
    status_label = (receipt.get("status") or "").lower()

    def _draw_decorations(canv, document):
        if status_label == "void":
            canv.saveState()
            canv.setFont("Helvetica-Bold", 45)
            canv.translate(300, 480)
            canv.rotate(25)
            canv.setFillColor(colors.HexColor("#EF4444"), alpha=0.18)
            canv.setStrokeColor(colors.HexColor("#EF4444"), alpha=0.4)
            canv.drawCentredString(0, 0, "VOID")
            canv.rect(-130, -15, 260, 60, stroke=1, fill=0)
            canv.restoreState()

    doc.build(story, canvasmaker=NumberedCanvas, onFirstPage=_draw_decorations, onLaterPages=_draw_decorations)
    return buffer.getvalue()
