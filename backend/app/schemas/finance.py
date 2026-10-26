"""Pydantic schemas for Reamarc Finance Module.

All monetary amounts are represented as integer minor units (e.g. paisa for PKR, cents for USD/GBP)
to prevent any floating-point precision or rounding drift.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


VALID_CURRENCIES = ("PKR", "USD", "GBP")
VALID_METHODS = ("cash", "bank")
VALID_BANKS = ("abl", "meezan")
VALID_INVOICE_STATUSES = ("draft", "issued", "partially_paid", "paid", "overdue", "void", "deleted")
VALID_RECEIPT_STATUSES = ("posted", "pending", "void", "deleted")
VALID_LEDGER_SOURCES = ("receipt", "transfer", "opening_balance", "adjustment", "reversal")
VALID_TERMS_PRESETS = ("Due on receipt", "Net 7", "Net 15", "Net 30", "Custom")


class BankAccountConfig(BaseModel):
    bank_id: str = Field(..., description="'abl' or 'meezan'")
    bank_name: str = Field(..., description="e.g. Meezan Bank, Allied Bank Limited")
    account_title: str = Field(default="Reamarc")
    account_number: str = Field(default="")
    iban: str = Field(default="")
    swift_code: str = Field(default="")
    branch: Optional[str] = None


class FinanceSettingsBase(BaseModel):
    company_name: str = "Reamarc - Digital Solutions"
    company_address: str = "3rd Floor, Bldg. A-26, Business Bay, Sector-F, DHA-1\nPunjab PK"
    company_phone: str = "+92 3070205555"
    company_email: str = "faizan.khan@reamarc.io"
    company_website: str = "http://reamarc.io"
    tax_id: str = "Govt. UID 9926976-3"
    invoice_prefix: str = "INV-"
    receipt_prefix: str = "RCT-"
    default_payment_terms: str = "Due on receipt"
    bank_accounts: List[BankAccountConfig] = Field(default_factory=list)
    signature_labels: List[str] = Field(
        default_factory=lambda: ["Account Manager", "Stamp", "CEO"]
    )
    notes_template: str = "We greatly appreciate your business and the opportunity to serve you."
    terms_template: str = (
        "If you have any questions or require further clarification, please do not hesitate to contact us. "
        "We appreciate the opportunity to work with you and look forward to your response."
    )


class FinanceSettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_website: Optional[str] = None
    tax_id: Optional[str] = None
    invoice_prefix: Optional[str] = None
    receipt_prefix: Optional[str] = None
    default_payment_terms: Optional[str] = None
    bank_accounts: Optional[List[BankAccountConfig]] = None
    signature_labels: Optional[List[str]] = None
    notes_template: Optional[str] = None
    terms_template: Optional[str] = None


class FinanceSettingsResponse(FinanceSettingsBase):
    id: str
    company_id: str
    updated_at: Optional[str] = None


class FinanceServiceCreate(BaseModel):
    name: str = Field(..., min_length=1)
    default_rate: int = Field(default=0, ge=0, description="Rate in minor units (paisa)")
    currency: str = Field(default="PKR")
    description: Optional[str] = ""
    is_active: bool = True

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        curr = v.strip().upper()
        if curr not in VALID_CURRENCIES:
            raise ValueError(f"Invalid currency '{curr}'. Must be one of {VALID_CURRENCIES}")
        return curr


class FinanceServiceUpdate(BaseModel):
    name: Optional[str] = None
    default_rate: Optional[int] = Field(default=None, ge=0)
    currency: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        curr = v.strip().upper()
        if curr not in VALID_CURRENCIES:
            raise ValueError(f"Invalid currency '{curr}'. Must be one of {VALID_CURRENCIES}")
        return curr


class FinanceServiceResponse(BaseModel):
    id: str
    company_id: str
    name: str
    default_rate: int
    currency: str
    description: Optional[str] = ""
    is_active: bool = True
    created_at: str
    updated_at: str


class InvoiceLineItem(BaseModel):
    serial: int = Field(default=1, ge=1)
    service_id: Optional[str] = None
    description: str = Field(..., min_length=1)
    quantity: float = Field(default=1.0, gt=0)
    rate: int = Field(..., ge=0, description="Unit rate in minor units")
    amount: int = Field(default=0, ge=0, description="Total line amount in minor units")

    @model_validator(mode="after")
    def compute_amount(self) -> InvoiceLineItem:
        self.amount = int(round(self.quantity * self.rate))
        return self


class ClientBillingDetails(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None


class InvoiceCreate(BaseModel):
    workspace_id: Optional[str] = None
    client_name: str = Field(..., min_length=1)
    client_billing: Optional[ClientBillingDetails] = Field(default_factory=ClientBillingDetails)
    issue_date: str = Field(..., description="YYYY-MM-DD")
    due_date: str = Field(..., description="YYYY-MM-DD")
    terms: str = "Due on receipt"
    reference: Optional[str] = None
    currency: str = "PKR"
    line_items: List[InvoiceLineItem] = Field(..., min_length=1)
    discount_type: Literal["amount", "percent"] = "amount"
    discount_value: int = Field(default=0, ge=0, description="Amount in minor units or percent integer (0-100)")
    notes: Optional[str] = None
    terms_text: Optional[str] = None
    pay_to_bank: Optional[Dict[str, Any]] = None
    is_recurring: bool = False
    recurring_interval: Optional[str] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        curr = v.strip().upper()
        if curr not in VALID_CURRENCIES:
            raise ValueError(f"Currency must be one of {VALID_CURRENCIES}")
        return curr

    @field_validator("issue_date", "due_date")
    @classmethod
    def validate_dates(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v.strip()):
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v.strip()


class InvoiceUpdate(BaseModel):
    workspace_id: Optional[str] = None
    client_name: Optional[str] = None
    client_billing: Optional[ClientBillingDetails] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    terms: Optional[str] = None
    reference: Optional[str] = None
    currency: Optional[str] = None
    line_items: Optional[List[InvoiceLineItem]] = None
    discount_type: Optional[Literal["amount", "percent"]] = None
    discount_value: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None
    terms_text: Optional[str] = None
    pay_to_bank: Optional[Dict[str, Any]] = None
    is_recurring: Optional[bool] = None
    recurring_interval: Optional[str] = None


class InvoiceVoidRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Reason for voiding the invoice")


class InvoiceResponse(BaseModel):
    id: str
    company_id: str
    number: str
    workspace_id: Optional[str] = None
    client_name: str
    client_billing: Optional[Dict[str, Any]] = None
    issue_date: str
    due_date: str
    terms: str
    reference: Optional[str] = None
    currency: str
    line_items: List[Dict[str, Any]]
    subtotal: int
    discount_type: str
    discount_value: int
    discount_amount: int
    total: int
    amount_paid: int
    wht_settled: int
    balance_due: int
    status: str
    notes: Optional[str] = None
    terms_text: Optional[str] = None
    pay_to_bank: Optional[Dict[str, Any]] = None
    pdf_file_id: Optional[str] = None
    share_token: Optional[str] = None
    void_reason: Optional[str] = None
    voided_at: Optional[str] = None
    voided_by: Optional[str] = None
    deleted_reason: Optional[str] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    is_recurring: bool = False
    recurring_interval: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: str


class ReceiptAllocation(BaseModel):
    invoice_id: str
    invoice_number: Optional[str] = None
    amount: int = Field(default=0, ge=0, description="Amount received allocated in invoice currency")
    wht: int = Field(default=0, ge=0, description="WHT withheld allocated in invoice currency")

    @model_validator(mode="after")
    def validate_non_zero(self) -> ReceiptAllocation:
        if self.amount + self.wht <= 0:
            raise ValueError("Allocation must have a positive amount or wht")
        return self


class ReceiptCreate(BaseModel):
    workspace_id: Optional[str] = None
    client_name: str = Field(..., min_length=1)
    date: str = Field(..., description="YYYY-MM-DD")
    currency: str = "PKR"
    amount_received: int = Field(default=0, ge=0, description="Minor units received in invoice currency")
    wht_amount: int = Field(default=0, ge=0, description="Minor units WHT withheld in invoice currency")
    method: Literal["cash", "bank"]
    bank: Optional[str] = Field(default=None, description="'abl' or 'meezan'")
    reference_number: Optional[str] = Field(default=None, description="Required for bank transfer / cheque")
    exchange_rate: Optional[float] = Field(default=None, gt=0, description="Required if currency is USD or GBP")
    memo: Optional[str] = None
    allocations: List[ReceiptAllocation] = Field(default_factory=list)
    proof_file_ids: List[str] = Field(default_factory=list)
    wht_certificate_file_id: Optional[str] = None
    is_cheque: bool = False

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        curr = v.strip().upper()
        if curr not in VALID_CURRENCIES:
            raise ValueError(f"Currency must be one of {VALID_CURRENCIES}")
        return curr

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v.strip()):
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v.strip()

    @model_validator(mode="after")
    def validate_method_and_currency(self) -> ReceiptCreate:
        if self.amount_received + self.wht_amount <= 0:
            raise ValueError("Receipt must have positive amount_received or wht_amount")

        if self.method == "bank":
            if not self.bank or self.bank.lower() not in VALID_BANKS:
                raise ValueError(f"Bank payment requires bank to be one of {VALID_BANKS}")
            if not self.reference_number or not self.reference_number.strip():
                raise ValueError("Bank payment requires a reference number (transaction ID / cheque no)")
            self.bank = self.bank.lower()
        elif self.method == "cash":
            if self.bank:
                raise ValueError("Cash payments must not specify a bank account")

        if self.currency != "PKR":
            if not self.exchange_rate or self.exchange_rate <= 0:
                raise ValueError(f"Foreign currency ({self.currency}) receipt requires a positive exchange rate")

        # Validate total allocations do not exceed total settlement
        total_alloc_amount = sum(a.amount for a in self.allocations)
        total_alloc_wht = sum(a.wht for a in self.allocations)
        if total_alloc_amount > self.amount_received:
            raise ValueError(
                f"Allocated amount ({total_alloc_amount}) exceeds total amount received ({self.amount_received})"
            )
        if total_alloc_wht > self.wht_amount:
            raise ValueError(
                f"Allocated WHT ({total_alloc_wht}) exceeds total WHT amount ({self.wht_amount})"
            )

        return self


class ReceiptVoidRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Reason for placing the receipt on hold")


class ReceiptDeleteRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Reason for deleting the receipt (record is retained)")


class InvoiceDeleteRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Reason for deleting the invoice (record is retained)")


class ReceiptResponse(BaseModel):
    id: str
    company_id: str
    number: str
    workspace_id: Optional[str] = None
    client_name: str
    date: str
    currency: str
    amount_received: int
    wht_amount: int
    settles_total: int
    method: str
    bank: Optional[str] = None
    reference_number: Optional[str] = None
    exchange_rate: Optional[float] = None
    pkr_amount: int
    allocations: List[Dict[str, Any]]
    unapplied_amount: int
    memo: Optional[str] = None
    proof_file_ids: List[str] = Field(default_factory=list)
    wht_certificate_file_id: Optional[str] = None
    status: str
    is_cheque: bool = False
    void_reason: Optional[str] = None
    voided_at: Optional[str] = None
    voided_by: Optional[str] = None
    deleted_reason: Optional[str] = None
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str


class FinanceAccountResponse(BaseModel):
    id: str
    company_id: str
    code: str
    name: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    iban: Optional[str] = None
    currency: str = "PKR"
    balance: int = Field(default=0, description="Dynamic balance computed from ledger entries in PKR paisa")


class FinanceLedgerEntryResponse(BaseModel):
    id: str
    company_id: str
    account_code: str
    date: str
    direction: Literal["in", "out"]
    amount: int
    source_type: str
    source_id: Optional[str] = None
    memo: Optional[str] = None
    slip_file_id: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str


class FinanceTransferCreate(BaseModel):
    from_account: Literal["cash"] = "cash"
    to_account: Literal["abl", "meezan"]
    amount: int = Field(..., gt=0, description="PKR paisa to transfer from cash to bank")
    date: str = Field(..., description="YYYY-MM-DD")
    deposit_slip_reference: Optional[str] = None
    slip_file_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v.strip()):
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v.strip()


class FinanceTransferResponse(BaseModel):
    id: str
    company_id: str
    from_account: str
    to_account: str
    amount: int
    date: str
    deposit_slip_reference: Optional[str] = None
    slip_file_id: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str


class FinanceOpeningBalanceCreate(BaseModel):
    account_code: Literal["cash", "abl", "meezan"]
    amount: int = Field(..., ge=0, description="PKR paisa opening balance")
    date: str = Field(..., description="YYYY-MM-DD")
    memo: Optional[str] = "Opening Balance"


class FinanceAdjustmentCreate(BaseModel):
    account_code: Literal["cash", "abl", "meezan"]
    direction: Literal["in", "out"]
    amount: int = Field(..., gt=0, description="PKR paisa adjustment amount")
    date: str = Field(..., description="YYYY-MM-DD")
    memo: str = Field(..., min_length=3)
    reason: str = Field(..., min_length=3)


class RecurringInvoiceCreate(BaseModel):
    template_invoice: InvoiceCreate
    frequency: Literal["weekly", "bi-weekly", "monthly", "quarterly"] = "monthly"
    next_run_date: str = Field(..., description="YYYY-MM-DD")
    auto_issue: bool = False
    is_active: bool = True


class RecurringInvoiceUpdate(BaseModel):
    template_invoice: Optional[InvoiceCreate] = None
    frequency: Optional[Literal["weekly", "bi-weekly", "monthly", "quarterly"]] = None
    next_run_date: Optional[str] = None
    auto_issue: Optional[bool] = None
    is_active: Optional[bool] = None


class RecurringInvoiceResponse(BaseModel):
    id: str
    company_id: str
    template_invoice: Dict[str, Any]
    frequency: str
    next_run_date: str
    auto_issue: bool
    is_active: bool
    last_run_at: Optional[str] = None
    created_at: str
    updated_at: str
