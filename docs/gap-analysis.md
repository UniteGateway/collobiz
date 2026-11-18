# COLLABIZ — gap analysis (18 Nov 2026)

## Comparison with www.collabiz.co — not possible from this environment
`www.collabiz.co` and `collabiz.co` do not resolve from the build environment (DNS lookup fails / network policy denies
the host), so the live website could not be read and **no feature-by-feature comparison has been made**. Nothing below
claims what the website contains. To complete the comparison, either:
- add `www.collabiz.co` (and `collabiz.co`) to the environment's allowed domains, or
- share the site's pages (PDF, screenshots or text), and each promised feature will be mapped to the app with a status.

## Done in this round
| Area | What changed |
|---|---|
| Real photography | 43 royalty-free Pexels photos (Pexels License, IDs in `apps/web/public/photos/CREDITS.md`), bundled locally as WebP |
| Home | Full-width photo hero by business domain, six photo programme tiles, notice board first, layout gaps removed |
| Energy | New **Energy desk** on Home for energy partners: quotes, kW quoted, quote pipeline, energy opportunities and tenders, kW-by-month and quotes-by-month bars, quotes-by-type donut, Powertek enquiries by product line, latest energy opportunities — all from real records |
| Business news | Live business-news panel on Home, auto-refreshing every 10 minutes; reads public RSS headlines server-side (headline, link, source, time only), cached 15 minutes; COLLABIZ news shown when feeds are unreachable |
| Module pages | Photo headers on every module home page and a compact photo band on the other tabbed pages |
| Public site & sign-in | Photo in the landing hero, new "Industries" photo section, photo behind the sign-in showcase |

## Still missing / blocked
| Item | Status | Needed |
|---|---|---|
| Live business news | Built; **feeds blocked** in this environment, so the panel shows COLLABIZ news and says live headlines are unavailable | Allow `economictimes.indiatimes.com` and `www.business-standard.com` (or set `NEWS_FEEDS` to approved feeds); in production the server needs outbound HTTPS (on Node 22 behind a proxy, set `NODE_USE_ENV_PROXY=1`) |
| Website comparison | Not done | Access to www.collabiz.co or its content |
| App logos | 12 of 48 Unite apps have artwork (portfolio Part 1 + BIZO) | Logos for the remaining apps (portfolio Part 2) |
| Native mobile app | Uses the new data (notice board, energy figures via the API) but not yet the photography | Next step: bundle a small photo set in the Expo app |
| Admin console | Functional styling; not yet given photo headers | Next step if wanted |
| Push, e-mail, WhatsApp delivery | Built, not connected | Expo/EAS credentials, SMTP provider, WhatsApp Business provider + approved template |
| BIZO sign-on/sync | Link only | BIZO API details |
| Payments, LeadDNA, e-invoicing, SMS | Adapters only | Provider choice and credentials |
| Real price lists, tariffs, costs | Samples/illustrative | Unite's actual figures |
| Production hosting | Not deployed | Approval and hosting decision |
