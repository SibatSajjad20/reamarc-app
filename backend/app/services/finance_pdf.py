"""PDF generation for Invoices, Receipts, and Reports using ReportLab."""
from __future__ import annotations

from xml.sax.saxutils import escape

import io
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.finance_numbering import format_document_number

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.pdfgen import canvas
    from reportlab.platypus import HRFlowable, Image as RLImage, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
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
    RLImage = None  # type: ignore
    Paragraph = None  # type: ignore
    SimpleDocTemplate = None  # type: ignore
    Spacer = None  # type: ignore
    Table = None  # type: ignore
    TableStyle = None  # type: ignore
    REPORTLAB_AVAILABLE = False

_BaseCanvas = canvas.Canvas if REPORTLAB_AVAILABLE else object

# Built-in faces until Inter TTF files are registered.
FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"
FONT_BOLD_ITALIC = "Helvetica-BoldOblique"
_FONTS_READY = False


def format_invoice_date(value: Optional[str]) -> str:
    """Display helper: ISO YYYY-MM-DD in the DB becomes DD-MM-YYYY on documents."""
    if not value:
        return "—"
    raw = str(value).strip()[:10]
    try:
        return datetime.strptime(raw, "%Y-%m-%d").strftime("%d-%m-%Y")
    except ValueError:
        return str(value).strip() or "—"



def _ensure_pdf_fonts() -> None:
    """Register Inter (OFL) for invoice and receipt PDFs. Falls back to Helvetica."""
    global FONT_REGULAR, FONT_BOLD, FONT_ITALIC, FONT_BOLD_ITALIC, _FONTS_READY
    if _FONTS_READY:
        return
    _FONTS_READY = True
    if not REPORTLAB_AVAILABLE:
        return
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    here = Path(__file__).resolve()
    font_dirs = [
        here.parents[1] / "assets" / "fonts",
        here.parents[3] / "backend" / "app" / "assets" / "fonts",
    ]
    fonts_dir = next((d for d in font_dirs if (d / "Inter-Regular.ttf").is_file()), None)
    if fonts_dir is None:
        return
    regular = fonts_dir / "Inter-Regular.ttf"
    bold = fonts_dir / "Inter-Bold.ttf"
    italic = fonts_dir / "Inter-Italic.ttf"
    bold_italic = fonts_dir / "Inter-BoldItalic.ttf"
    if not all(p.is_file() for p in (regular, bold, italic, bold_italic)):
        return
    pdfmetrics.registerFont(TTFont("Inter", str(regular)))
    pdfmetrics.registerFont(TTFont("Inter-Bold", str(bold)))
    pdfmetrics.registerFont(TTFont("Inter-Italic", str(italic)))
    pdfmetrics.registerFont(TTFont("Inter-BoldItalic", str(bold_italic)))
    pdfmetrics.registerFontFamily(
        "Inter",
        normal="Inter",
        bold="Inter-Bold",
        italic="Inter-Italic",
        boldItalic="Inter-BoldItalic",
    )
    FONT_REGULAR = "Inter"
    FONT_BOLD = "Inter-Bold"
    FONT_ITALIC = "Inter-Italic"
    FONT_BOLD_ITALIC = "Inter-BoldItalic"


def _asset_path(filename: str) -> Optional[Path]:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[3] / "public" / "assets" / filename,
        here.parents[2] / "public" / "assets" / filename,
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _wordmark_path() -> Optional[Path]:
    return _asset_path("reamarc-wordmark.png")


def _stamp_path() -> Optional[Path]:
    return _asset_path("reamarc-stamp.png")


def _draw_status_stamp(canv: Any, text: str, fill_hex: str, stroke_hex: str) -> None:
    """Diagonal status badge whose box always wraps the label."""
    canv.saveState()
    page_w = getattr(canv, "_pagesize", A4)[0]
    canv.translate(page_w / 2, 480)
    canv.rotate(25)
    font_size = 32 if len(text) > 8 else 42
    canv.setFont(FONT_BOLD, font_size)
    canv.setFillColor(colors.HexColor(fill_hex), alpha=0.18)
    canv.setStrokeColor(colors.HexColor(stroke_hex), alpha=0.45)
    canv.setLineWidth(1.6)
    text_w = canv.stringWidth(text, FONT_BOLD, font_size)
    pad_x = 14
    pad_y = 7
    canv.drawCentredString(0, 0, text)
    canv.rect(
        -text_w / 2 - pad_x,
        -pad_y,
        text_w + 2 * pad_x,
        font_size + pad_y + 2,
        stroke=1,
        fill=0,
    )
    canv.restoreState()


REAMARC_COMPANY_ID = "company_reamarc"


def _is_reamarc(settings: Optional[Dict[str, Any]]) -> bool:
    """Reamarc's own wordmark/stamp only belong on Reamarc documents."""
    cid = (settings or {}).get("company_id")
    return cid in (None, "", REAMARC_COMPANY_ID)


def _wordmark_flowable(normal_style: Any, settings: Optional[Dict[str, Any]] = None) -> Any:
    if not _is_reamarc(settings):
        name = escape(str((settings or {}).get("company_name") or ""))
        return Paragraph(f'<font size="16"><b>{name}</b></font>', normal_style)
    path = _wordmark_path()
    if REPORTLAB_AVAILABLE and RLImage is not None and path is not None:
        img = RLImage(str(path), width=176, height=41.8)
        img.hAlign = "LEFT"
        return img
    return Paragraph(
        '<font color="#6847E0" size="16"><b>reamarc</b></font><br/>'
        '<font color="#64748B" size="7">DIGITAL SOLUTIONS</font>',
        normal_style,
    )


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
    if parts and hundreds:
        return f"{' '.join(parts)} And {_three_digits_to_words(hundreds)}"
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

    words = number_to_words_western(main_units)

    if currency == "PKR":
        curr_label = "Rupees"
        sub_label = "Paisa"
    elif currency == "USD":
        curr_label = "US Dollars"
        sub_label = "Cents"
    elif currency == "GBP":
        curr_label = "British Pounds"
        sub_label = "Pence"
    else:
        curr_label = currency
        sub_label = "Cents"

    if sub_units > 0:
        sub_words = _two_digits_to_words(sub_units)
        return f"{words} {curr_label} And {sub_words} {sub_label} Only"
    return f"{words} {curr_label} Only"


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
        self.setFont(FONT_REGULAR, 8)
        self.setFillColor(colors.HexColor("#64748B"))
        # Footer text
        footer_text = f"Page {self._pageNumber} of {page_count}"
        page_w = getattr(self, "_pagesize", A4)[0]
        self.drawRightString(page_w - 36, 20, footer_text)
        self.restoreState()


def generate_invoice_pdf(invoice: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """Generate professional PDF for an invoice matching Reamarc specifications."""
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("PDF generation requires 'reportlab'. Please install with: pip install reportlab")
    _ensure_pdf_fonts()
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
    normal = ParagraphStyle("InvoiceBody", parent=styles["Normal"], fontName=FONT_REGULAR)

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
        fontName=FONT_BOLD,
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0F172A"),
        alignment=2,  # right
    )
    style_company_details = ParagraphStyle(
        "CompanyDetails",
        parent=normal,
        fontName=FONT_REGULAR,
        fontSize=8.5,
        leading=12,
        textColor=text_muted,
        alignment=2,  # right
    )
    style_invoice_heading = ParagraphStyle(
        "InvoiceHeading",
        parent=normal,
        fontName=FONT_BOLD,
        fontSize=20,
        leading=24,
        textColor=primary_color,
    )
    style_label = ParagraphStyle(
        "LabelStyle",
        parent=normal,
        fontName=FONT_BOLD,
        fontSize=8.5,
        leading=11,
        textColor=text_muted,
    )
    style_meta_value = ParagraphStyle(
        "MetaValue",
        parent=normal,
        fontName=FONT_REGULAR,
        fontSize=8.5,
        leading=11,
        textColor=text_dark,
    )
    style_meta_label = ParagraphStyle(
        "MetaLabel",
        parent=style_label,
        alignment=2,
        leading=12,
    )
    style_meta_value_right = ParagraphStyle(
        "MetaValueRight",
        parent=style_meta_value,
        alignment=0,
        leading=12,
        fontName=FONT_REGULAR,
    )
    style_sig_label = ParagraphStyle(
        "SigLabel",
        parent=style_meta_value,
        alignment=1,
        fontName=FONT_BOLD,
        fontSize=8,
        textColor=text_dark,
    )
    style_sig_line = ParagraphStyle(
        "SigLine",
        parent=style_meta_value,
        alignment=1,
        textColor=colors.HexColor("#94A3B8"),
    )
    style_th = ParagraphStyle(
        "TableHeading",
        parent=normal,
        fontName=FONT_BOLD,
        fontSize=8.5,
        leading=11,
        textColor=primary_color,
    )
    style_td = ParagraphStyle(
        "TableCell",
        parent=normal,
        fontName=FONT_REGULAR,
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
        fontName=FONT_ITALIC,
        fontSize=8.5,
        leading=12,
        textColor=primary_color,
    )

    story: List[Any] = []

    # 1. Header: Logo (left) and Company Info (right)
    logo_p = _wordmark_flowable(normal, settings)

    comp_name = settings.get("company_name") or ""
    comp_addr = (settings.get("company_address") or "").replace("\n", "<br/>")
    comp_phone = settings.get("company_phone") or ""
    comp_email = settings.get("company_email") or ""
    comp_web = settings.get("company_website") or ""
    tax_id = settings.get("tax_id") or ""

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

    bill_to_html = f'<font color="#64748B"><b>BILL TO</b></font><br/>' \
                   f'<font color="#0F172A"><b>{client_name}</b></font><br/>'
    if b_addr:
        bill_to_html += f'<font color="#475569">{b_addr}</font><br/>'
    if b_contact:
        bill_to_html += f'<font color="#475569">{b_contact}</font><br/>'
    if billing.get("tax_id"):
        bill_to_html += f'<font color="#64748B">NTN/Tax ID: {billing.get("tax_id")}</font>'

    bill_to_p = Paragraph(bill_to_html, style_meta_value)

    # Right: bold labels in one column, values right-aligned in the other
    from reportlab.pdfbase.pdfmetrics import stringWidth

    inv_num = format_document_number(invoice.get("number") or "DRAFT")
    inv_date = format_invoice_date(invoice.get("issue_date"))
    due_date = format_invoice_date(invoice.get("due_date"))

    style_meta_label_col = ParagraphStyle(
        "MetaLabelCol",
        parent=normal,
        fontName=FONT_BOLD,
        fontSize=8,
        leading=10,
        alignment=2,
        textColor=text_muted,
    )
    style_meta_value_col = ParagraphStyle(
        "MetaValueCol",
        parent=normal,
        fontName=FONT_REGULAR,
        fontSize=8,
        leading=10,
        alignment=2,
        textColor=text_dark,
    )
    gap = stringWidth("  ", FONT_REGULAR, 8)
    label_w = max(stringWidth(s, FONT_BOLD, 8) for s in ("INVOICE", "ISSUE DATE", "DUE DATE")) + 1
    value_w = max(
        stringWidth(str(inv_num), FONT_BOLD, 8),
        stringWidth(inv_date, FONT_REGULAR, 8),
        stringWidth(due_date, FONT_REGULAR, 8),
    ) + 1
    meta_data = [
        [Paragraph("INVOICE", style_meta_label_col), Paragraph(f"<b>{inv_num}</b>", style_meta_value_col)],
        [Paragraph("ISSUE DATE", style_meta_label_col), Paragraph(inv_date, style_meta_value_col)],
        [Paragraph("DUE DATE", style_meta_label_col), Paragraph(due_date, style_meta_value_col)],
    ]
    meta_table = Table(meta_data, colWidths=[label_w + gap, value_w])
    meta_table.hAlign = "RIGHT"
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), gap),
        ("LEFTPADDING", (1, 0), (1, -1), 0),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
    ]))

    info_table = Table([[bill_to_p, meta_table]], colWidths=[323, 200])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
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
            Paragraph("SR", style_th),
            Paragraph("DESCRIPTION", style_th),
            Paragraph("QTY", style_th),
            Paragraph("RATE", style_th),
            Paragraph("AMOUNT", style_td_right),
        ])
        col_widths = [30, 273, 50, 80, 90]
    else:
        table_data.append([
            Paragraph("SR", style_th),
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
    discount_amount = invoice.get("discount_amount", 0)
    total = invoice.get("total", 0)
    amount_paid = invoice.get("amount_paid", 0)
    wht_settled = invoice.get("wht_settled", 0)
    balance_due = invoice.get("balance_due", 0)

    totals_style = TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#F1F5F9")),
    ])

    upper_rows = []
    if discount_amount > 0:
        upper_rows.append([
            Paragraph("Discount", style_label),
            Paragraph(f"-{format_currency_amount(discount_amount, currency)}", style_td_right),
        ])
    upper_rows.append([
        Paragraph('<font color="#0F172A"><b>TOTAL</b></font>', style_label),
        Paragraph(f'<font color="#0F172A"><b>{format_currency_amount(total, currency)}</b></font>', style_td_right),
    ])
    if amount_paid > 0:
        upper_rows.append([
            Paragraph("Amount Paid", style_label),
            Paragraph(f"-{format_currency_amount(amount_paid, currency)}", style_td_right),
        ])
    if wht_settled > 0:
        upper_rows.append([
            Paragraph("WHT Settled", style_label),
            Paragraph(f"-{format_currency_amount(wht_settled, currency)}", style_td_right),
        ])

    upper_table = Table(upper_rows, colWidths=[90, 110])
    upper_table.setStyle(totals_style)

    balance_table = Table(
        [[
            Paragraph('<font color="#5046E5" size="10"><b>BALANCE DUE</b></font>', style_label),
            Paragraph(
                f'<font color="#5046E5" size="10"><b>{format_currency_amount(balance_due, currency)}</b></font>',
                style_td_right,
            ),
        ]],
        colWidths=[90, 110],
    )
    balance_table.setStyle(totals_style)

    words = amount_in_words(balance_due if balance_due > 0 else total, currency)
    notes_text = invoice.get("notes") or settings.get("notes_template") or "We greatly appreciate your business and the opportunity to serve you."

    summary_table = Table(
        [
            [
                Paragraph(f'<font color="#64748B">Amount in words:</font><br/><b>{words}</b>', style_words),
                upper_table,
            ],
            [
                Paragraph(f'<font color="#475569">{notes_text}</font>', style_meta_value),
                balance_table,
            ],
        ],
        colWidths=[323, 200],
    )
    summary_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("VALIGN", (0, 1), (0, 1), "MIDDLE"),
        ("VALIGN", (1, 1), (1, 1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))

    # 5. Bank Details Card
    # Chosen pay_to_bank or default Meezan bank
    pay_to = invoice.get("pay_to_bank")
    if not pay_to:
        banks = settings.get("bank_accounts") or []
        pay_to = banks[0] if banks else {}

    bank_name = pay_to.get("bank_name") or ""
    acc_title = pay_to.get("account_title") or ""
    acc_num = pay_to.get("account_number") or ""
    iban = pay_to.get("iban") or ""
    swift = pay_to.get("swift_code") or ""

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

    # 6. Signatures: Account Manager | circular stamp (no caption) | CEO
    stamp_path = _stamp_path() if _is_reamarc(settings) else None
    if REPORTLAB_AVAILABLE and RLImage is not None and stamp_path is not None and stamp_path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        stamp_cell = RLImage(str(stamp_path), width=78, height=78)
        stamp_cell.hAlign = "CENTER"
    else:
        stamp_cell = Spacer(1, 78)

    manager_block = [
        Paragraph("________________________", style_sig_line),
        Spacer(1, 4),
        Paragraph("Account Manager", style_sig_label),
    ]
    ceo_block = [
        Paragraph("________________________", style_sig_line),
        Spacer(1, 4),
        Paragraph("CEO", style_sig_label),
    ]

    sig_table = Table(
        [[manager_block, stamp_cell, ceo_block]],
        colWidths=[186, 151, 186],
    )
    sig_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
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
        if status_label == "paid":
            _draw_status_stamp(canv, "PAID", "#10B981", "#10B981")
        elif status_label == "partially_paid":
            _draw_status_stamp(canv, "PARTIALLY PAID", "#F59E0B", "#F59E0B")
        elif status_label == "void":
            _draw_status_stamp(canv, "ON HOLD", "#EF4444", "#EF4444")

    doc.build(story, canvasmaker=NumberedCanvas, onFirstPage=_draw_decorations, onLaterPages=_draw_decorations)
    return buffer.getvalue()


def generate_receipt_pdf(receipt: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """Generate professional PDF for a receipt matching Page 3 of the uploaded reference."""
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("PDF generation requires 'reportlab'. Please install with: pip install reportlab")
    _ensure_pdf_fonts()
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
    normal = ParagraphStyle("ReceiptBody", parent=styles["Normal"], fontName=FONT_REGULAR)

    primary_color = colors.HexColor("#2B2D42")
    brand_purple = colors.HexColor("#5046E5")
    lavender_bg = colors.HexColor("#E9E5F5")
    border_color = colors.HexColor("#CBD5E1")
    text_muted = colors.HexColor("#64748B")
    text_dark = colors.HexColor("#1E293B")

    style_company_details = ParagraphStyle(
        "ReceiptCompDetails",
        parent=normal,
        fontName=FONT_REGULAR,
        fontSize=8.5,
        leading=12,
        textColor=text_muted,
        alignment=2,
    )
    style_th = ParagraphStyle(
        "RTh",
        parent=normal,
        fontName=FONT_BOLD,
        fontSize=8.5,
        leading=11,
        textColor=primary_color,
    )
    style_td = ParagraphStyle(
        "RTd",
        parent=normal,
        fontName=FONT_REGULAR,
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
    logo_p = _wordmark_flowable(normal, settings)

    comp_name = settings.get("company_name") or ""
    comp_addr = (settings.get("company_address") or "").replace("\n", "<br/>")
    comp_phone = settings.get("company_phone") or ""
    comp_email = settings.get("company_email") or ""
    comp_web = settings.get("company_website") or ""
    tax_id = settings.get("tax_id") or ""

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
        f'<font color="#0F172A" size="11"><b>{client_name}</b></font>',
        normal,
    )
    right_info = Paragraph(
        f'<font color="#1E293B"><b>Date:</b> {rcpt_date}</font><br/><br/>'
        f'<font color="#1E293B"><b>Reference No:</b> {ref_num}</font><br/>'
        f'<font color="#1E293B"><b>Receipt No:</b> {rcpt_num}</font>',
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
        inv_num = format_document_number(alloc.get("invoice_number", alloc.get("invoice_id", "—")))
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
    bank_name = (receipt.get("bank") or "").strip()
    if bank_name == "meezan":
        bank_label = "Meezan Bank"
    elif bank_name == "abl":
        bank_label = "Allied Bank"
    elif receipt.get("method") == "cash":
        bank_label = "Cash"
    else:
        bank_label = "this bank"
    memo_text = receipt.get("memo") or f"{client_name} received from {bank_label}"

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
            _draw_status_stamp(canv, "ON HOLD", "#EF4444", "#EF4444")

    doc.build(story, canvasmaker=NumberedCanvas, onFirstPage=_draw_decorations, onLaterPages=_draw_decorations)
    return buffer.getvalue()
