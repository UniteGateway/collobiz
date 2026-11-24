# Unite Club

A members' business club with local chapters, in the spirit of Rotary, Lions and BNI. Separate from the **Unite Industry
Club** (selling under the Unite Powertek brand, free power, OEM).

| Who | Where |
|---|---|
| Public | `/unite-club` (what it is, values, how to join, chapters), `/unite-club/<chapter>` (schedule, filled categories, upcoming events, apply) |
| Members | `/my-club` (my chapters, find a chapter, start a chapter), `/my-club/<chapter>` (meetings & events, members, referrals, applications for officers) |
| Unite admins | Admin → Unite Club (chapters): approve or decline proposed chapters |

## Rules
- **Chapters**: any signed-in business member proposes one; a Unite admin approves it; the proposer becomes president.
- **Joining**: apply with your business category; the chapter president or secretary approves. When the chapter uses the
  *one member per business category* rule (default), a category already held by an active member cannot apply or be approved
  ("Chartered Accountants" and "chartered accountant" count as the same).
- **Roles**: president, secretary, treasurer, member. The president hands over roles (one holder each); a president must hand
  over before leaving.
- **Privacy**: the public sees the chapter, its schedule, member count and filled categories — never member names. Only
  active members see the member list, events and referrals.
- **Meetings & events**: chapter meeting, service project, social, business visit. Officers schedule them; members RSVP.
  An *online* event opens a U meet room (video + chat) for every active member. Members log service hours on service projects.
- **Referrals**: a member passes a contact who needs what another member sells. The giver must confirm the person agreed;
  contact details go only to the receiving member. The receiver marks it contacted, won or lost and may report the value of
  business won — shown as *reported by members*, never verified by COLLABIZ.
- **Money**: COLLABIZ does not collect club dues; any dues are set and collected by the chapter itself.

API: `apps/api/src/modules/unite-club/unite-club.controller.ts` · tests `apps/api/test/unite-club.e2e.ts`,
`packages/types/src/unite-club.test.ts`, browser suite "Unite Club" in `scripts/e2e-suites.mjs`. Migration 0069.
