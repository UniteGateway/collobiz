# ERPNext connection: HR, payroll and accounting (Phases B and C)

**Status (9 Nov 2026): not connected.** The workspace shows ERPNext as "Not connected" until the settings below are filled in. Nothing has been bought or registered.

## Why connect ERPNext instead of building from scratch
ERPNext (open source, by Frappe) already covers, and is used in production in India for:
- Indian payroll: PF, ESI, professional tax, TDS on salary and Form 16;
- GST accounting and e-invoicing;
- leave and attendance, and multi-company books.

Rebuilding and certifying this ourselves would take months and carry compliance risk. COLLABIZ stays the place people work in. ERPNext is the system of record for people and money, behind the scenes.

## What each side owns

| Data | Owner | Direction |
|---|---|---|
| Group companies (legal names, GSTIN) | COLLABIZ workspace | COLLABIZ → ERPNext *Company* |
| Employees, departments, attendance, leave | ERPNext | ERPNext → COLLABIZ (read; shown in the HR app) |
| Salary structures, payroll runs, payslips | ERPNext | Shown in COLLABIZ; run in ERPNext by HR/finance |
| Partner commission (approved lines) | COLLABIZ ledger | COLLABIZ → ERPNext *Purchase Invoice* / *Journal Entry*, with TDS |
| Customer payments for offer sales | ERPNext (bank) | ERPNext → COLLABIZ, marks the sale paid so commission becomes earned |
| Chart of accounts, GST returns, bank reconciliation | ERPNext | Reports shown in COLLABIZ Finance |

## What is needed (Unite Group decision)
1. **An ERPNext site.** Either Frappe Cloud (managed, about ₹2,500–8,000/month depending on users), or self-hosted on the same server provider as COLLABIZ. Choose an India region.
2. **A dedicated integration user** in ERPNext with only the roles it needs (HR User, Accounts User). Generate an **API key and secret** for that user.
3. **Settings in COLLABIZ** (secrets manager, never in git):
   ```
   ERPNEXT_URL=https://<your-site>.frappe.cloud
   ERPNEXT_API_KEY=<key>
   ERPNEXT_API_SECRET=<secret>
   ```
4. **Your CA** sets up the chart of accounts and the GST and TDS settings in ERPNext before any commission is posted.

## Delivery plan
- **Phase B (People):**
  - Workspace HR app: employee directory, departments, leave requests and approvals, attendance, read through the ERPNext REST API (`/api/resource/Employee`, `Leave Application`, `Attendance`).
  - Payroll app: payroll runs and payslips, read-only in COLLABIZ and run in ERPNext.
  - Unite Group people in COLLABIZ are matched to ERPNext employees by work e-mail.
- **Phase C (Finance):**
  - Approved commission lines post to ERPNext automatically and idempotently: one document per line, keyed by the COLLABIZ entry ID.
  - Customer payments flow back to COLLABIZ to mark sales paid.
  - Group financials (revenue by company, receivables, payables) show in the workspace.

Every call is logged, and retries are safe. If ERPNext is unreachable, the COLLABIZ apps keep working and show "ERPNext unavailable" instead of failing.
