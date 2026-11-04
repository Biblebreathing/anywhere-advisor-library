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

1. **Foundation:** Next.js app, Supabase schema, student magic-link login, admin roles
2. **Admin:** title editor, uploads and replacements to storage, version history
3. **Student library:** welcome page, library, book page, audio player with synced progress, notes, workbook
4. **Course:** video hosting integration and lesson progress
5. **GoHighLevel:** purchase webhook, tag sync, one-click unlock orders, booking calendar link
6. **Launch:** The 1 Hour Webinar first, then The 1 Hour Book and Atomic Offers
