# Website content, guide chat and U meet

## Website content (Admin → Website content)
- **Social links**: Facebook, Instagram, YouTube, LinkedIn, X, WhatsApp, Telegram. Only `https` links on each network's own
  host are accepted. Links appear as large icons in the dark footer of every public page and as a strip at the bottom of every
  signed-in page. A network with no link is hidden — the site never shows placeholder links.
- **Videos**: paste a YouTube link (watch, youtu.be, shorts, embed or live) and choose where it appears: the home page, any
  listed public page, any Unite product page (`product:<slug>`), or a members' module (`module:dashboard`, `module:umeet`).
  Pages show a thumbnail first; the player (youtube-nocookie.com) loads only when the visitor presses play. Hidden videos stay
  in the library. If a page has no video, the section does not appear.
- Videos are YouTube links, not file uploads: upload the video to Unite's YouTube channel first.
- API: `GET /public/site`, `GET /admin/site`, `PUT /admin/site/social`, `POST|PUT|DELETE /admin/site/videos[/:id]` (Unite
  admins and super admins; changes are audited).

## Inner page design
Public inner pages use `components/PageHero.tsx`: a large hero in one of three layouts (cover photo, split with framed photos,
colour band with a photo strip) and eight colour tones, so each module looks different; plus photo mosaics, image + text
features, photo cards and a closing photo call to action. Listing screens get their look from `components/PublicScreen.tsx`.

| Page | Layout · tone |
|---|---|
| About | cover · navy |
| How it works | split · ocean |
| Get started | cover · teal |
| Join | split · sunrise |
| Membership | band · plum |
| Industry Club | band · forest |
| Unite businesses | cover · graphite |
| Sell Unite products | split · earth |
| Store | split · sunrise |
| Contact | split · ocean |
| Group companies / Catalogue / Opportunities / Success stories / Locations | cover navy / split teal / band ocean / split sunrise / cover graphite |

## COLLABIZ guide chat
A "Need help?" button on every public and signed-in page. The guide is **rules-based** (not a language model): it answers
common questions (solar, dealerships, Unite products, joining, earning, U meet, prices, sign-in, tenders, GO EB5, contact)
with links to the right page. "Talk to a person" hands the chat to the Unite team — visitors give an email first; members are
known. Unite admins are notified and answer in **Admin → Guide chats**; the reply appears in the visitor's chat window (and as
a notification for members). While the team has the chat, the guide stays quiet.
The conversation is kept with a random token in the browser (only its hash is stored).

## U meet
- `/umeet`: start a meeting now (60 minutes, optional invitees — colleagues or members of verified businesses, as for
  scheduled meetings), see upcoming meetings, schedule one.
- The meeting room shows the video **inside the page** when the video provider is Jitsi (`MEETING_PROVIDER=jitsi`,
  `MEETING_JITSI_BASE_URL`), with a "Open in a new tab" fallback, plus a meeting chat for attendees only and the existing
  agenda, attendance and minutes.
- With `MEETING_PROVIDER=local` meetings, chat, attendance and minutes work without video.
- **Production:** the public meet.jit.si may require a moderator to sign in and is not suitable for business use; self-host
  Jitsi (or another provider) and set `MEETING_JITSI_BASE_URL`. The web app's CSP and Permissions-Policy allow that host.

## Open items for Unite
- Unite Group's official social media links (none are filled in; nothing is invented).
- The YouTube videos Unite has made, to add in Website content.
- A self-hosted video service for U meet in production.
