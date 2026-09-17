# Daymark

A personal task manager with durable lists, private notes/files, and optional Gmail deadline reminders.

## Included

- Named General, Year, Month, Week and Day lists.
- Mark existing lists as Important with the bookmark button. Marked lists also appear on the Important page; click again to unmark them.
- Urgent, Must and Not Important priorities on lists and tasks.
- Priority-first sorting. A list inherits the highest priority of its unfinished tasks when that is higher than its own priority. Deadlines break ties, then names.
- Optional task/list deadlines entered and displayed in the browser timezone, stored as UTC milliseconds.
- Automatic Done page when all tasks are checked. Empty lists remain active until explicitly completed.
- Complete list checks all tasks; reopen list unchecks all tasks. Unchecking an individual task reopens its list. Nothing is automatically deleted.
- Important items with text, a private file, or both. Editable text, titles and replacement files. Maximum 10 MB per file and 20,000 characters per note.
- Recycle bin for lists (including their tasks), individual tasks, and Important notes/files. Restore within 30 days or permanently delete with confirmation. Separately deleted tasks remain in the bin when their list is restored.
- ChatGPT sign-in (the final sign-in method selected for this project). Production identity comes from the Sites dispatcher; every data/file request checks ownership.
- Responsive layout, keyboard dialogs, named controls and an optional WebMCP tool to stage a new list.

## Stack

TypeScript, React, Vinext/Vite, Cloudflare Workers, D1 (SQLite), R2 object storage, and Drizzle migrations. The separately deployable reminder bridge uses Python 3.13, Flask, Waitress, SQLite and Gmail SMTP. The website has no browser-only data store and includes no production credentials or user data.

## Run locally

Install Node.js 22.13+ (Node 24 recommended) and npm. In this directory:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_reflective_flatman.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_strange_shatterstar.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_jazzy_fantastic_four.sql
npm run dev
```

Apply the initial migration only once to a fresh local database. Open the URL printed by the server (normally http://localhost:5173). Click Sign in with ChatGPT: local development intentionally uses a simulated test user, not a real account. This test identity is excluded from production builds. Do not expose the development server to the internet.

Apply each migration once, in order. Existing installations should apply only migrations they have not yet run: `0001_strange_shatterstar.sql` adds the recycle bin and `0002_jazzy_fantastic_four.sql` adds Important lists. New database changes should generate new migrations with `npm run db:generate`; never rewrite already applied migrations.

Recycle-bin items expire 30 days after deletion and cannot be restored after expiry. Cleanup runs on workspace requests and every minute while `npm run dev` is running. The built Worker includes an hourly scheduled cleanup handler and cron configuration; the deployment host must support and install that trigger for cleanup while nobody visits. Physical deletion occurs on the next cleanup run and removes attached files as well as database rows. Cleanup retries failed file removals. A stopped local server resumes cleanup when started and accessed again. Deleting a list permanently also removes its tasks, including separately deleted tasks inside it. Replacing a note's file is still an edit, not a recoverable deletion.

## Hosted deployment

The included `.openai/hosting.json` identifies this project's private Sites deployment. D1 and R2 are provisioned by Sites and migrations apply during publication. Open this project in Codex with Sites and request publishing an update. Runtime secrets are configured in Sites environment settings, never in the hosting manifest or source code.

This source is designed for Sites hosting. Deploying elsewhere requires replacing the dispatcher authentication integration with a real identity provider and configuring database/bucket bindings. Never accept `oai-authenticated-user-*` headers directly from an untrusted public client.

## Activate Gmail reminders

The website is usable without email. Reminders are **not active until the separate service and environment settings below are configured**. Gmail credentials alone are insufficient: the reminder service must also remain running.

1. Sign in to **alinassef1220@gmail.com**, enable two-step verification, and create a Gmail app password. Keep it private. Google account policies may prevent app-password creation. See https://support.google.com/accounts/answer/185833 . Do not use your normal Gmail password.
2. Deploy the `reminder-service` folder to an always-on Python or Docker host with HTTPS, outbound access to smtp.gmail.com:587, and a persistent disk. Run exactly one instance. For local development:

```sh
cd reminder-service
python -m venv .venv
# Activate .venv using your shell, then:
pip install -r requirements.txt
# Copy .env.example to .env and fill it privately.
python service.py
```

3. Set `GMAIL_APP_PASSWORD` to the app password. Generate a shared secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`, and set it as `REMINDER_BRIDGE_TOKEN`. Set `REMINDER_DB` to a persistent file location. For Docker, mount persistent storage at `/data`. Terminate HTTPS at the hosting proxy; port 8080 itself is HTTP and should not be exposed without that proxy. The service has no browser UI and does not require CORS.
4. In the website's Sites environment settings, set `REMINDER_BRIDGE_URL` to the service HTTPS origin and `REMINDER_BRIDGE_TOKEN` to the same shared secret (mark the token secret). Redeploy the website to apply the settings. The `.env.example` at the project root lists these two values; do not commit a filled environment file.
5. Open the website to synchronize existing deadlines. Create a test task due in 90 minutes; it becomes eligible immediately. Verify arrival at your signed-in email address, including spam folders. The sender is fixed to alinassef1220@gmail.com. SMTP setup reference: https://support.google.com/mail/answer/7104828 .

### Reminder behavior and limitations

The website sends only active item IDs, titles, deadlines and the signed-in user's email to your private reminder service. Files and Important notes are never sent there. The service stores a durable queue and checks every 30 seconds, including when the browser is closed. It sends within the final two hours before a deadline. Items already overdue are not emailed. There can be a delay of about 30 seconds plus provider delivery time.

Snapshots are versioned; old retries cannot overwrite a newer completion or deadline. Completed items cancel queued reminders after successful synchronization. Changing a deadline schedules a fresh warning. Failed SMTP delivery retries with backoff while the deadline is still in the future. Successful delivery is recorded; like other SMTP systems, a crash immediately after Gmail accepts a message but before recording success can produce a duplicate.

If the bridge is unreachable, the website still saves tasks and displays the reminder warning. Synchronization retries on the next workspace load or edit. Until a later successful sync, the bridge may retain an older deadline/completion state. Keep both services healthy and reload after an outage. For high-scale production, a managed retry queue would improve this boundary.

The UI connection indicator confirms configuration/snapshot acceptance, not delivery to an inbox. Live Gmail delivery could not be verified without your private credentials. The included tests use a mock sender and never send mail.

## Verification

```sh
npx tsc --noEmit
npm run build
# Run while local dev preview is active; creates local fixture data only:
node tests/api.mjs
node tests/recycle.mjs
# With the reminder Python dependencies installed:
python -m unittest discover -s reminder-service -v
```

Integration checks cover authentication, spoofed headers, cross-origin request rejection, all periods, validation, task/list editing and completion, optional deadlines, and private file upload/download. Reminder tests cover the exact two-hour boundary, deduplication, cancellation, stale revisions, deadline changes, retries, owner isolation and overdue items.

## Suggested next additions

Recurring tasks would save the most time for routines. Other useful future improvements: search across Important notes and tasks and a calendar view. These are suggestions, not unfinished controls in the current website.
