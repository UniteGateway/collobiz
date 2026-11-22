# GO EB5 — deployment checklist

Nothing has been deployed. Do not deploy without explicit authorisation.

## Before switching the module on (legal and business — owner: CITRUS360 / Unite Group)
- [ ] U.S. counsel confirms CITRUS360 LLC's authority, the consultancy scope, the fees, the refund terms and the governing law. Record each approval in **GO EB5 → Settings**, with the reference.
- [ ] Counsel replaces the draft agreement text in `engagement.controller.ts` (`agreementBody`) with the approved template. Then re-approve the template gate.
- [ ] Counsel advises on Form I-956K promoter registration and securities-law (broker-dealer) issues for every partner arrangement. Partner compensation stays disabled until then.
- [ ] CITRUS360 confirms its billing channel (bank account and invoicing entity). Bank details are sent to clients outside COLLABIZ and are never stored in code.
- [ ] Privacy policy and consent text are reviewed for India (DPDP Act) and the U.S. Update `CONSENT` in `leads.controller.ts` and the form wording if counsel changes it.
- [ ] Retention periods are set for each document category (`retainUntil` on document requests).
- [ ] Marketing material is reviewed: no promises of visas, approvals, timelines or returns.

## Technical (owner: engineering)
- [ ] Run the migration `0051_go_eb5.sql`. It is additive only: new `eb5_*` tables, nothing existing changes.
- [ ] Set `FIELD_ENCRYPTION_KEY` (64 hex characters) from the secrets manager. Lead contact details, applications and documents are encrypted with it. **If the key is lost, the encrypted data is lost too.** Back it up separately.
- [ ] Storage: the local driver writes encrypted files with mode 600. S3 needs credentials (blocker B-03); if S3 is used, also turn on bucket encryption.
- [ ] Malware scanning: the local hook only rejects the EICAR test file. Connect ClamAV or a vendor scanner for production.
- [ ] Email delivery: invitations and notifications go to the outbox. Set `MAIL_DRIVER=smtp` and `SMTP_URL` to deliver them. SMS has no provider (blocker B-04).
- [ ] Create the staff accounts and grant roles in **GO EB5 → Settings → Staff roles**. Each person must turn on two-step sign-in before the role works.
- [ ] Do **not** run the demo seed in production. It switches the `go_eb5` flag on and creates demo users, a demo partner, demo leads and the proposed Texas project.
- [ ] Switch the flag on in production only when the legal checklist above is complete:
  `insert into feature_flags (key, enabled, description) values ('go_eb5', true, 'GO EB5') on conflict (key) do update set enabled = true;`
- [ ] Run the checks: API `npx jest --runInBand test/eb5.e2e.ts`, types `npx vitest run src/eb5.test.ts`, browser `SUITE="GO EB5" scripts/e2e-run.sh`, accessibility `node scripts/a11y-scan.mjs`.

## Known limits
- Signatures are recorded click-to-sign: typed full name, consent, time, IP address and a SHA-256 fingerprint of the exact text. A licensed e-signature provider (DocuSign, Adobe Sign or similar) is not connected.
- PDFs are produced with the browser's "Save as PDF" from A4 pages, not server-generated.
- The mobile app has no GO EB5 screens yet. The web screens are responsive for phones and tablets.
- Calendar invitations (ICS, Google or Outlook) are not sent. Consultations notify inside COLLABIZ only.
