# The Anywhere Advisor Library

A members' library for financial advisors from Terrance McMahon and The Anywhere Advisor™. Each title ships as a complete package:

- **Ebook (PDF):** read online, or download a copy stamped with the student's email
- **Audiobook:** streaming player that remembers the student's place, with speed, sleep timer and timestamped chapter notes
- **Workbook:** exercises for every chapter, answered and saved online, plus a printable PDF
- **Course:** video lessons that walk the student through building it
- **Resources:** templates, checklists and AI prompt packs

The library delivers what students bought in the GoHighLevel funnel. It is also where they buy the next thing: other titles, course upgrades, the full bundle and strategy calls.

## Current titles

| Title | Series |
|---|---|
| The 1 Hour Webinar for Financial Advisors | The 1 Hour Series™ |
| The 1 Hour Book for Financial Advisors | The 1 Hour Series™ |
| Atomic Offers for Financial Advisors | 2027 AI Edition |

## Prototype

`prototype/index.html` is a working, single-file prototype of the full experience. Open it in a browser:

- **Welcome page** with a welcome video. Students who have already entered the library skip it.
- **Library** in List or Shelf layout, with locked titles, free first chapters and a bundle offer
- **Book page** with Audiobook, Course, Workbook, Resources and My notes tabs
- **Player** with resume, skip 15/30, speed, sleep timer, notes, and calls-to-action at chapter ends
- **Admin** (`#admin`): add titles; upload and replace covers, PDFs, chapter audio (single or bulk), workbook exercises, lesson videos and resources; draft/live status; version history and restore; GHL product mapping
- **GoHighLevel event panel** that shows the tags each student action would send

In the prototype, data and uploaded files are stored only in the browser (localStorage and IndexedDB).

## The app

A Next.js app in `src/`, backed by Supabase.

| Route | What it is |
|---|---|
| `/` | Welcome page. Students who have already entered go straight to `/library` |
| `/welcome` | Welcome page, always (the "Welcome video" link) |
| `/login` | Email sign-in link, no password |
| `/library` | The student's library: every live title, showing what they own |
| `/library/[slug]` | A title's chapters, lessons, exercises and resources |
| `/library/[slug]/workbook` | Guided workbook: answers autosave, progress bar, "Download as PDF" |
| `/library/[slug]/course/[lessonId]` | Course player: video, lesson list with checkmarks, "Complete & continue" |
| `/admin` | Staff only: every title with a checklist of what's missing; add a title |
| `/admin/titles/[id]` | Title editor: details, cover, ebook (PDF/EPUB with version history), audiobook (per-chapter or bulk upload, reorder, end-of-chapter calls-to-action), workbook, course (upload or video link), resources, GHL offers, change history |
| `/admin/students` | Every student, which titles and courses they have (tick to give or remove), progress, last active |
| `/admin/settings` | Welcome video and the booking calendar link |
| `GET /api/media/...` | Checks access, then hands out a short-lived link to a private file |

**Audiobook player:** a persistent player bar on every library page; it resumes on any device, with speed control (0.75×–2.5×), a sleep timer (minutes or end of chapter), skip back 15 and forward 30, chapter list, timestamped notes, lock-screen and headphone controls, and keyboard shortcuts (Space, ←, →). The first chapter is a free sample for students who don't own the book.

**Uploads** go straight from the browser to Supabase Storage (resumable), up to the project's file limit (currently 50 MB). For longer course videos, paste a Vimeo, Wistia, Bunny or unlisted YouTube link.
| `POST /api/ghl/purchase` | GoHighLevel purchase webhook (see below) |

Database: `supabase/migrations/0001_init.sql` (tables, row-level security, storage buckets) and `supabase/seed.sql` (the three launch titles).

### Setup

**1. Supabase**
1. Create a project at supabase.com, e.g. `anywhere-advisor-library`.
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
3. In **Authentication → URL Configuration**:
   - Set **Site URL** to `https://library.theanywhereadvisor.com`.
   - Add `http://localhost:3000/**` to **Redirect URLs**.
4. In **Authentication → Emails → Magic Link**, set the link in the template to:
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/library">Sign in to your library</a>
   ```
5. In **Authentication → Emails → SMTP Settings**, connect your own email sender. Supabase's built-in sender only allows a few emails an hour.
6. Make yourself the owner. Sign in once at `/login`, then run:
   ```sql
   update public.profiles set role = 'owner' where email = 'YOUR-EMAIL';
   ```

**2. Environment variables:** copy `.env.example` to `.env.local` (local) or add the same values in Vercel. The Supabase values are in **Project Settings → API**.

**3. Vercel:** import this GitHub repository, add the environment variables, then add the domain `library.theanywhereadvisor.com` under **Domains**.

**4. GoHighLevel**
1. Create a **Private Integration** token with the contacts scopes and set it as `GHL_API_TOKEN`.
2. In each purchase workflow, add a **Webhook** action:
   - URL: `https://library.theanywhereadvisor.com/api/ghl/purchase?secret=YOUR_GHL_WEBHOOK_SECRET`
   - Custom Data: `title` = `webinar`, `book`, `atomic` or `all`
   - Custom Data: `grant` = `book`, `course` or `both`
3. Optional: create a contact custom field (e.g. "Library login link"), put its ID in `GHL_LOGIN_LINK_FIELD_ID`, and include that field in your GHL welcome email. The login email then comes from your own GHL account. Without it, Supabase sends the login email.

**Run locally**
```bash
npm install
npm run dev
```

## Production plan

### Stack (proposed)

| Concern | Choice |
|---|---|
| App | Next.js (App Router, TypeScript), hosted on Vercel |
| Database and auth | Supabase (Postgres, magic-link login for students, role-based admin) |
| File storage | Supabase Storage or Cloudflare R2, served through short-lived signed URLs |
| Course video | Bunny Stream (or Vimeo / Wistia) |
| PDF stamping | Server-side watermark with the student's email at download |
| CRM and payments | GoHighLevel: funnels, order forms, workflows and calendars |

### GoHighLevel integration

**Inbound (GHL to library)**
- A purchase workflow fires a webhook to `POST /api/ghl/purchase` with the contact and product.
- The library creates the student account if needed, grants the matching title or course, and emails a login link.

**Outbound (library to GHL):** the library adds tags to the contact, and GHL workflows act on them.

| Tag | When it's added |
|---|---|
| `aa-{title}-owner` / `aa-{title}-course` | Purchased the book / the course |
| `aa-{title}-started` | Started listening |
| `aa-{title}-chNN-complete` | Finished a chapter |
| `aa-{title}-audiobook-finished` | Finished the audiobook (strategy-call invite) |
| `aa-{title}-workbook-exNN-complete` | Finished a workbook exercise |
| `aa-{title}-course-lessonNN-complete` | Finished a course lesson |
| `aa-{title}-course-finished` | Finished the course (implementation-call invite) |
| `aa-{title}-sample-finished` | Finished the free chapter without buying (unlock offer) |
| `welcome-video-played`, `library-entered` | Onboarding |

GHL location: `OU1HhJC2zJE9FO6uhfVV`

### Data model (outline)

- `titles`: slug, title, subtitle, series, description, status (draft/live), cover, course name, GHL product IDs
- `chapters`: title, order, audio file, duration, end-of-chapter call-to-action
- `exercises`: title, chapter, questions
- `lessons`: title, order, video (upload or host link), duration
- `resources`: name, file
- `files`: storage key, name, size, type, version history
- `students` and `entitlements`: who owns which title or course
- `progress`: audio position, completed chapters, lessons and exercises
- `notes` and `answers`: timestamped notes, workbook answers
- `events`: activity log mirrored to GHL

### Roadmap

1. **Foundation (built):** Next.js app, Supabase schema and security rules, student magic-link login, admin roles, GHL purchase webhook, library and admin overview
2. **Admin:** title editor, uploads and replacements to storage, version history
3. **Student library:** welcome page, library, book page, audio player with synced progress, notes, workbook
4. **Course:** video hosting integration and lesson progress
5. **GoHighLevel:** purchase webhook, tag sync, one-click unlock orders, booking calendar link
6. **Launch:** The 1 Hour Webinar first, then The 1 Hour Book and Atomic Offers
