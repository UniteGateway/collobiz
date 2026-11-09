# COLLABIZ pilot: go-live checklist

**Status:** prepared on 9 Nov 2026. **Nothing has been bought, registered or deployed.** Every step marked **[You]** needs a Unite Group decision, an account or a payment. Every step marked **[IT]** can be done by any Linux/Docker engineer using this document.

This checklist covers one small, controlled pilot: one server, 10–20 invited partners and a handful of Unite Group staff. A full production rollout needs the extra items in [section 9](#9-before-a-full-launch-not-needed-for-the-pilot).

The deployment files are in the repository:

| File | Purpose |
|---|---|
| `infra/pilot/docker-compose.pilot.yml` | Whole pilot stack on one server: PostgreSQL, Redis, API, partner web, admin console, Caddy (HTTPS) |
| `infra/pilot/Caddyfile` | HTTPS front door. Automatic certificates, security headers, admin restricted by IP. |
| `infra/pilot/pilot.env.example` | Every setting the pilot needs. Copy it to `pilot.env` on the server. |
| `infra/backup/backup.sh`, `restore.sh` | Daily database and document backup, and restore |
| `docs/deployment.md` | Background: architecture, image builds, mobile builds |
| `docs/runbooks/backup-restore.md` | Restore drill |

**What was verified in the build sandbox (9 Nov 2026):**
- The compose file resolves correctly (`docker compose config`).
- The API and web images were built and run on 6 Nov.
- E-mail delivery over SMTP is tested against a test mail server: sign-in codes, retries, and failure after 5 attempts (`apps/api/test/mail-smtp.e2e.ts`).
- The Caddyfile was **not** validated here, because the sandbox could not run Caddy. Step 4.6 validates it on the server.

---

## 1. Decisions and accounts: [You], about 1–2 weeks before launch

| # | Item | Options and notes | Owner | Done |
|---|---|---|---|---|
| 1.1 | **Pilot owner** at Unite Group | One person who decides, answers partners and runs the weekly review | | ☐ |
| 1.2 | **Hosting**: one Linux server | 4 vCPU, 8 GB RAM, 80 GB SSD, Ubuntu 24.04 LTS, Docker. Any provider works. For Indian data residency choose an **India region** (Mumbai/Hyderabad/Chennai). Typical cost ₹2,500–₹6,000/month. | | ☐ |
| 1.3 | **Domain names** | Two names, e.g. `collabiz.unitegroup.in` (partners) and `admin.collabiz.unitegroup.in` (staff). A sub-domain of an existing Unite domain is enough; no new domain purchase is needed. | | ☐ |
| 1.4 | **E-mail sending (SMTP)** | Required: sign-in codes and invitations go by e-mail. Any SMTP provider works: Zoho Mail, Google Workspace, Microsoft 365, Amazon SES, Brevo, SendGrid. The sender domain must be verified (SPF + DKIM). | | ☐ |
| 1.5 | **SMS** | Not required for the pilot. Partners verify by e-mail. SMS needs a DLT-registered provider later (blocker B-04). | | ☐ n/a |
| 1.6 | **Legal review** of the agreement pack | `docs/pilot/legal-review-pack.docx`: partner terms, lead registration, privacy notice, NDA, offer/commission wording. See section 7. | | ☐ |
| 1.7 | **Real commission rates and TDS/GST treatment** | Replace the demo commission policy (blocker B-10). Finance and the CA to confirm. | | ☐ |
| 1.8 | **Operating legal entity** | Which Unite company is the contracting principal named in agreements (blocker B-01) | | ☐ |
| 1.9 | **Pilot partners and business** | See `docs/pilot/pilot-plan.md`. Choose 10–20 partners and one Unite business to offer. | | ☐ |
| 1.10 | **Admin office IPs** | Public IP ranges of Unite offices or VPN, to lock the admin console (`ADMIN_ALLOW_IPS`) | | ☐ |

## 2. Prepare the server: [IT], about 1 hour

- ☐ 2.1 Create the server from 1.2. Use SSH keys only and disable password login.
- ☐ 2.2 Firewall: allow inbound **22** (from the office IP only, if possible), **80** and **443**. Block everything else.
- ☐ 2.3 Install Docker Engine and the Compose plugin from docker.com's official instructions. Then `sudo usermod -aG docker <deploy-user>`.
- ☐ 2.4 Turn on automatic security updates (`unattended-upgrades`).
- ☐ 2.5 Set the time zone to UTC (`timedatectl set-timezone UTC`). The app shows Indian times itself.
- ☐ 2.6 Install the PostgreSQL client for backups: `sudo apt-get install -y postgresql-client-16`.

## 3. DNS and e-mail records: [You/IT], allow up to 24 h to take effect

- ☐ 3.1 `A` record: `collabiz.<domain>` → server IP.
- ☐ 3.2 `A` record: `admin.collabiz.<domain>` → server IP.
- ☐ 3.3 SPF and DKIM records for the sender domain, exactly as the SMTP provider shows. Add a DMARC record (`p=none` to start).
- ☐ 3.4 Check from a laptop: `nslookup collabiz.<domain>` returns the server IP.

## 4. Install COLLABIZ: [IT], about 1 hour

```bash
git clone <repository> collabiz && cd collabiz
git checkout <release tag or commit approved for the pilot>
cp infra/pilot/pilot.env.example infra/pilot/pilot.env
chmod 600 infra/pilot/pilot.env
nano infra/pilot/pilot.env        # fill in every <…> value; generate each secret with: openssl rand -hex 32
```

- ☐ 4.1 Fill in `pilot.env`: domains, `ACME_EMAIL`, `ADMIN_ALLOW_IPS`, five generated secrets, and SMTP details.
- ☐ 4.2 **Store a copy of `FIELD_ENCRYPTION_KEY` and `POSTGRES_PASSWORD` in the company password manager**, separately from backups. Without the key, stored bank and PAN details cannot be read.
- ☐ 4.3 Confirm `DEMO_MODE=false` and `DEV_EXPOSE_OTP=false`.
- ☐ 4.4 Build and start:
  ```bash
  docker compose -f infra/pilot/docker-compose.pilot.yml --env-file infra/pilot/pilot.env up -d --build
  docker compose -f infra/pilot/docker-compose.pilot.yml ps          # all services "running"/"healthy"
  docker compose -f infra/pilot/docker-compose.pilot.yml logs api | tail -20   # "Migrations applied", no errors
  ```
- ☐ 4.5 The API applies all database migrations by itself on start. **Never run the demo seed on this server.** It refuses in production anyway.
- ☐ 4.6 Validate the HTTPS config: `docker compose -f infra/pilot/docker-compose.pilot.yml exec caddy caddy validate --config /etc/caddy/Caddyfile`.
- ☐ 4.7 Open `https://collabiz.<domain>`. You should see a padlock (valid certificate) and the public home page, **without** the "Demonstration environment" ribbon.
- ☐ 4.8 Open `https://admin.collabiz.<domain>` from the office: the admin sign-in page appears. From a phone on mobile data it must show "Not available from this network".

## 5. First administrator and configuration: [IT + pilot owner], about 1 hour

The demo seed never runs on this server. Instead, the **bootstrap command** sets up a clean database. It is safe to run more than once. It creates:
- the Unite Group platform organization;
- the agreement texts partners accept;
- the 47 Unite Group businesses, all **closed** to partners.

It creates no demo people, companies or money (tested in `apps/api/test/bootstrap.e2e.ts`).

```bash
C="docker compose -f infra/pilot/docker-compose.pilot.yml --env-file infra/pilot/pilot.env"
$C exec api node dist/db/bootstrap.js --platform-name "<registered name of the operating Unite company>"   # decision 1.8
```

- ☐ 5.1 The pilot owner registers at `https://collabiz.<domain>/register` with their work e-mail. **Check that the verification code arrives by e-mail.** This proves SMTP works.
- ☐ 5.2 Make them the first super admin. Record who ran this and when; the action is also written to the audit log.
  ```bash
  $C exec api node dist/db/bootstrap.js --super-admin <owner e-mail>
  ```
- ☐ 5.2a Publish the lawyer-approved agreement texts. Put one file per agreement in a folder: `partner_terms.md`, `lead_registration.md`, `privacy_notice.md`. The first line of each file is `# Title`. Copy the folder into the container and run:
  ```bash
  docker cp ./reviewed-agreements "$($C ps -q api)":/tmp/agreements
  $C exec api node dist/db/bootstrap.js --agreements /tmp/agreements --legal-reviewed
  ```
  A changed text becomes a new version and replaces the draft. Partners who accepted the draft are asked to accept the new version.
- ☐ 5.2b Load the Unite Powertek product catalogue: 360 products taken from www.unitepowertek.com, published in the COLLABIZ catalogue. It is safe to repeat; products are matched by PT code. Add `--draft` to import them for review instead of publishing.
  ```bash
  $C exec api node dist/db/import-catalogue.js powertek
  ```
- ☐ 5.3 The super admin signs in to the admin console and enrols two-factor authentication. Admin actions are blocked until this is done.
- ☐ 5.4 In the admin console:
  1. Create the Unite Group company records you will use (Group companies). Give each its real legal entity name (B-01).
  2. Invite the other Unite staff (Users & roles) and give each the smallest role they need.
  3. In **Commission policy**, enter the approved rates (1.7). Delete or close the demo rates.
  4. In **Unite businesses**, open only the pilot business (e.g. SOLCART). Leave everything else closed.
  5. Confirm the agreements shown in partner sign-up are the reviewed versions (step 5.2a).
- ☐ 5.5 Turn on the backup job (section 6) **before** inviting partners.

## 6. Backups and monitoring: [IT], about 1 hour

- ☐ 6.1 Daily backup at 02:00 IST, kept for 30 days and copied off the server:
  ```bash
  # /etc/cron.d/collabiz-backup  (runs as the deploy user)
  30 20 * * * deploy cd /home/deploy/collabiz && DATABASE_URL="postgres://collabiz_app:<pw>@127.0.0.1:5432/collabiz" STORAGE_DIR=/var/lib/docker/volumes/collabiz-pilot_storage/_data BACKUP_DIR=/home/deploy/backups infra/backup/backup.sh && find /home/deploy/backups -maxdepth 1 -mtime +30 -exec rm -rf {} +
  ```
  For `pg_dump` to reach the database on 127.0.0.1, publish Postgres on the loopback interface only: add `ports: ['127.0.0.1:5432:5432']` to the `postgres` service. Never publish it on `0.0.0.0`.
- ☐ 6.2 Copy backups off the server every night, encrypted. Use the hosting provider's object storage or a Unite file server, e.g. with `rclone` or `restic`.
- ☐ 6.3 **Restore drill before launch**: restore last night's backup into a scratch database, following `docs/runbooks/backup-restore.md`, and record the time it took.
- ☐ 6.4 Enable the hosting provider's server snapshots, weekly.
- ☐ 6.5 Uptime check (UptimeRobot, Better Stack or the provider's monitoring). Check `https://collabiz.<domain>/api/v1/health` every 5 minutes and alert the pilot owner and IT by e-mail.
- ☐ 6.6 Disk alert at 80% full.

## 7. Legal and content sign-off: [You], before partners are invited

- ☐ 7.1 Lawyer returns `docs/pilot/legal-review-pack.docx` with changes and answers to the questions in it.
- ☐ 7.2 Remove the "DRAFT — subject to legal review" wording only from documents the lawyer has approved, and publish them with step 5.2a.
- ☐ 7.3 Confirm the privacy notice names the data controller, the grievance officer and the contact e-mail (DPDP Act 2023).
- ☐ 7.4 Pilot partners receive the pilot letter (template in the pilot plan). Its key points: this is a pilot, earnings are not guaranteed, and feedback is expected.

## 8. Launch day: [Pilot owner + IT]

- ☐ 8.1 Smoke test with a real test account (not a demo account):
  1. register;
  2. receive the e-mail code;
  3. complete onboarding with test documents;
  4. a Unite admin verifies the company;
  5. send a test direct offer to it;
  6. respond;
  7. send a pilot check-in (Help & support → Pilot check-in);
  8. see it under **Pilot feedback** in the admin console.

  Then close the test account.
- ☐ 8.2 Send invitations to the first 5 partners only (day 1). Add the rest after 2–3 days without problems.
- ☐ 8.3 A named person watches the support queue daily during the first week. Support tickets are in the partner web app; give that person the `moderator` (support) role in Users & roles.
- ☐ 8.4 Record the release commit and the date in the change log.

## 9. Before a full launch (not needed for the pilot)

- Managed PostgreSQL with point-in-time recovery, and S3-compatible document storage (B-03). The pilot keeps documents on a backed-up server volume.
- An e-signature provider for legally binding signatures (B-08). The pilot uses click-to-accept with a typed name, a timestamp, the IP address and a document hash as evidence.
- SMS provider with DLT registration (B-04).
- Android and iOS store releases through Expo EAS. This needs Google Play and Apple developer accounts (B-06). For the pilot, partners use the mobile web, or testers install an internal APK.
- Load test, external penetration test, and centralised logs.
- Regulatory clearance before opening any finance/investment business (B-09). These stay locked in the app until a super admin records clearance.

## Rollback

Migrations only move forward. To undo a release:
1. Stop the stack (`docker compose … down`, which keeps the volumes).
2. Restore the backup taken just before the release (`infra/backup/restore.sh`).
3. Check out the previous release commit.
4. Run `up -d --build`.

Take a manual backup immediately before every release.
