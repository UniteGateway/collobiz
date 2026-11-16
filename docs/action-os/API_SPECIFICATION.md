# API (`/v1/action-os`)

| Method | Path | Notes |
|---|---|---|
| GET | /dashboard | Refreshes; counts, top 30 items, latest plan, source health, schedule |
| GET | /notices?status=open·snoozed·done·archived·all&app=&org=&band= | Own items only |
| GET | /notices/:id | Item, comments, own feedback, team for assignment (marks read) |
| POST | /notices/:id/acknowledge · pin · complete · reopen · snooze · archive · assign · escalate · comments · feedback | |
| GET | /plans · /plans/:id | Own plans; detail includes deliveries and each item's current status |
| POST | /plans/generate `{ kind }` | weekly · daily · on_demand; up to 10 manual plans a day |
| GET / PATCH | /preferences | Schedule, time zone, quiet hours, channels, businesses, apps |
| GET | /notifications/status | Channel readiness and recent deliveries |
| POST | /notifications/test | Test to each chosen channel (12 an hour) |
| GET | /integrations | Built-in connectors; registered apps for Unite admins |
| POST | /integrations · /integrations/:id/enabled | Unite admins |
| POST | /integrations/events | Public; `X-Action-App` + bearer secret |
| GET | /admin/analytics | Unite admins; counts only |
| POST | /admin/run-due | Unite admins; runs the scheduler now |
