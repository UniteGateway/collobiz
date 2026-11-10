/**
 * External providers COLLABIZ is designed to use but that need an account, a contract or approval first (instruction:
 * never invent success). Each one reports "not connected" with what is needed; features that depend on it say so to the
 * user and offer the manual route (e.g. download the JSON and upload it on the government portal).
 */
import { ServiceUnavailableException } from '@nestjs/common';

export const PROVIDERS = {
  gst_filing: { name: 'GST e-invoice and e-way bill filing (GSP)', needs: 'A GST Suvidha Provider account with API access, and the business’s e-invoice API credentials. Paid service; needs approval and a contract.', manual: 'Download the JSON and upload it on the e-invoice portal (einvoice1.gst.gov.in) or e-way bill portal.' },
  gstin_lookup: { name: 'Live GSTIN status lookup', needs: 'A GST public-search API provider account (paid) or a GSP.', manual: 'COLLABIZ checks the format and check digit; confirm the registration is active on the GST portal’s “Search Taxpayer”.' },
  mca_lookup: { name: 'Company (CIN) lookup', needs: 'An MCA data provider account (paid).', manual: 'Check the company on the MCA portal and upload the incorporation certificate for review.' },
  esign: { name: 'Aadhaar eSign / digital signature', needs: 'An agreement with a licensed eSign Service Provider (ESP) or ASP (paid; requires approval).', manual: 'Print the document, sign it, and upload the signed copy — or use typed acceptance where the law allows.' },
  whatsapp: { name: 'WhatsApp Business messages', needs: 'A WhatsApp Business Platform account with approved message templates (paid per conversation).', manual: 'Notifications arrive in COLLABIZ and by email once email is set up.' },
  treds: { name: 'TReDS invoice discounting', needs: 'Registration of the business on an RBI-licensed TReDS platform (RXIL, M1xchange or Invoicemart). COLLABIZ never handles the money.', manual: 'Use the prepared invoice details to upload the invoice on your TReDS platform yourself.' },
  tender_feed: { name: 'Public tender feeds', needs: 'Approval to read the chosen public sources (CPPP / GeM / state portals) within their terms, and network access to them.', manual: 'Upload tender documents yourself in the Tender analyzer.' },
} as const;
export type ProviderKey = keyof typeof PROVIDERS;

/** No adapter is connected in this build; each returns false until one is built and configured with approved credentials. */
export const providerConnected = (_k: ProviderKey) => false;
export function providerStatus() {
  return Object.entries(PROVIDERS).map(([key, p]) => ({ key, ...p, connected: providerConnected(key as ProviderKey) }));
}
export function requireProvider(k: ProviderKey): never {
  const p = PROVIDERS[k];
  throw new ServiceUnavailableException({ statusCode: 503, message: `${p.name} is not connected yet. ${p.manual}`, blocker: k, needs: p.needs });
}
