# ERPNext + Frappe HR + India Payroll + India Compliance (separate service)

This stack provides HR, Indian payroll (PF, ESI, PT, LWF, TDS) and GST accounting to COLLABIZ. It runs **beside** COLLABIZ with its own database. COLLABIZ reads and writes only through ERPNext's REST API. No ERPNext code is copied into COLLABIZ, so COLLABIZ's own licence is unaffected. The four apps are GPL-3.0, and running them as a separate service is normal use.

| App | Repository | Branch |
|---|---|---|
| ERPNext (accounts, stock, buying, manufacturing, POS) | github.com/frappe/erpnext | `version-16` |
| Frappe HR (employees, attendance, leave, payroll engine) | github.com/frappe/hrms | `version-16` |
| India Payroll (statutory deductions and returns) | github.com/frappe/india-payroll | `version-16` (it has **no** version-15 branch) |
| India Compliance (GST, e-invoice, e-way bill) | github.com/resilient-tech/india-compliance | `version-16` |

Branches were checked with `git ls-remote` on 9 Nov 2026. The compose file was checked with `docker compose config`. **The image has not been built or run in the COLLABIZ sandbox**, which cannot run containers. Steps 1–4 have to be run on a real server.

## Option A — Frappe Cloud (managed, simplest)
Create a site at frappe.io/cloud in an India region and install ERPNext, HRMS, India Payroll and India Compliance from the marketplace. Then go straight to step 4.

## Option B — self-hosted with Docker (about 4 GB RAM extra)

**1. Build the image** with the four apps, using the official frappe_docker repository:
```bash
git clone https://github.com/frappe/frappe_docker && cd frappe_docker
export APPS_JSON_BASE64=$(base64 -w 0 /path/to/collabiz/infra/erpnext/apps.json)
docker build --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe --build-arg=FRAPPE_BRANCH=version-16 \
  --build-arg=APPS_JSON_BASE64=$APPS_JSON_BASE64 --tag=unite/erpnext-hr:v16 --file=images/layered/Containerfile .
```

**2. Start the stack:**
```bash
cp infra/erpnext/erpnext.env.example infra/erpnext/erpnext.env && chmod 600 infra/erpnext/erpnext.env   # fill in values
docker compose -f infra/erpnext/docker-compose.erpnext.yml --env-file infra/erpnext/erpnext.env up -d
```

**3. Create the site and install the apps:**
```bash
C="docker compose -f infra/erpnext/docker-compose.erpnext.yml --env-file infra/erpnext/erpnext.env"
$C exec backend bench new-site $ERP_SITE --mariadb-user-host-login-scope='%' --db-root-password $DB_ROOT_PASSWORD --admin-password '<strong password>'
for app in erpnext hrms india_compliance india_payroll; do $C exec backend bench --site $ERP_SITE install-app $app; done
```
ERPNext listens on `127.0.0.1:8080` only. To reach it from the office, add a block to `infra/pilot/Caddyfile`, restricted to office IPs like the admin console:
```
erp.collabiz.<your-domain> {
	@blocked not remote_ip {$ADMIN_ALLOW_IPS}
	respond @blocked "Not available from this network" 403
	reverse_proxy host.docker.internal:8080
}
```
On Linux, also add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `caddy` service in `infra/pilot/docker-compose.pilot.yml`, so Caddy can reach port 8080 on the host.

**4. Connect COLLABIZ:**
1. In ERPNext, create the user `collabiz-integration@<your-domain>` with the roles **HR User**, **HR Manager** (for leave approvals) and **Accounts User**.
2. On that user, go to **Settings → API Access → Generate Keys**.
3. Put the settings in COLLABIZ's secrets (`pilot.env`):
   ```
   ERPNEXT_URL=https://erp.collabiz.<your-domain>
   ERPNEXT_API_KEY=<api key>
   ERPNEXT_API_SECRET=<api secret>
   ```
   For commission posting (Finance), your CA chooses these accounts:
   ```
   ERPNEXT_COMMISSION_EXPENSE_ACCOUNT=Commission Paid - <ABBR>
   ERPNEXT_COMMISSION_PAYABLE_ACCOUNT=Creditors - <ABBR>
   ERPNEXT_TDS_PAYABLE_ACCOUNT=TDS Payable - <ABBR>
   ```
4. Restart COLLABIZ. Workspace → Apps → Integrations should show **ERPNext: Connected**. HR, Payroll and Finance then show live data instead of sample data.

## Before payroll goes live
- Your CA sets up: chart of accounts, GST settings (India Compliance), salary components and structures, PF/ESI/PT registrations, and income-tax slabs.
- Run one parallel payroll month against your current process, and compare the payslips line by line before switching over.
- Back up the ERPNext `db` and `sites` volumes daily. Use the same off-site copy as COLLABIZ (go-live checklist §6).
