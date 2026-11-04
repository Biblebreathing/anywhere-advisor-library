-- Seed: the three launch titles, drafted from the cover copy. Replace with final content in admin.
-- Safe to run once on an empty database.

-- The 1 Hour Webinar
with t_webinar as (
  insert into public.titles (slug, title, subtitle, series, description, status, cover_path, course_name, sort_order)
  values ('webinar', 'The 1 Hour Webinar', 'for Financial Advisors', 'The 1 Hour Series™', 'How to build a 60-minute, AI-powered webinar that attracts prospects, builds trust and creates qualified appointments.', 'live', '/covers/webinar.jpg', 'Build Your 1 Hour Webinar', 0)
  returning id
)
, ch as (
  insert into public.chapters (title_id, position, name, duration_seconds, cta)
  select id, x.position, x.name, x.secs, x.cta from t_webinar, (values
    (0, 'Introduction: You May Have a Location Problem', 540, null),
    (1, 'From Territory to One-to-Many', 960, null),
    (2, 'The 400/40 Model', 840, null),
    (3, 'A Real Audience Strategy', 1080, null),
    (4, 'The Ten Gates of Agreement', 1440, 'Want help mapping the Ten Gates to your own webinar?'),
    (5, 'An Offer Worth Responding To', 1140, 'Ready to replace “free consultation” with a real offer?'),
    (6, 'Your Exact 60-Minute Webinar', 1560, null),
    (7, 'The AI-Powered Build Process', 1260, 'Want us to build your webinar with you, using AI?'),
    (8, 'Plan, Create, Practice', 900, null),
    (9, 'Deliver', 780, null),
    (10, 'The Reinvite Engine', 1020, null),
    (11, 'Stop Driving Farther. Start Reaching Farther.', 480, 'You finished the book. Let''s put your webinar on the calendar.')
  ) as x(position, name, secs, cta)
  returning id, position
)
, ex as (
  insert into public.exercises (title_id, position, name, chapter_id, questions)
  select (select id from t_webinar), x.position, x.name, (select id from ch where ch.position = x.chpos), x.questions from (values
    (0, 'Draw your circle', 0, array['Where do most of your clients live today, and how far away is your farthest one?','What would change in your practice if location no longer limited who you could serve?']::text[]),
    (1, 'Your one-to-many shift', 1, array['Which conversation do you repeat most often in one-on-one meetings?']::text[]),
    (2, 'Run your 400/40 numbers', 2, array['How many people could you invite to a webinar today?','How many attendees would you need to book 10 appointments?']::text[]),
    (3, 'Define your audience', 3, array['Describe your ideal attendee in one paragraph: age, situation, the worry that keeps them up at night.']::text[]),
    (4, 'Map the Ten Gates', 4, array['Which gate does your current presentation skip or rush?']::text[]),
    (5, 'Build an offer worth responding to', 5, array['What real result can a prospect get from meeting with you?','Rewrite your “free consultation” as an offer built around that result.']::text[]),
    (6, 'Block out your 60 minutes', 6, array['List each block of your webinar with the minutes it gets.']::text[]),
    (7, 'Your AI research brief', 7, array['Write the prompt you''ll use to have AI research and outline your topic.']::text[]),
    (8, 'Your practice plan', 8, array['When will you rehearse, and who will watch and give feedback?']::text[]),
    (9, 'Delivery-day checklist', 9, array['What could go wrong on the day, and what''s your backup for each?']::text[]),
    (10, 'Your reinvite sequence', 10, array['Who gets reinvited after each webinar, and what message do they get?']::text[]),
    (11, 'Your 90-day webinar calendar', 11, array['Set the dates and topics of your next three webinars.']::text[])
  ) as x(position, name, chpos, questions)
  returning id
)
, ls as (
  insert into public.lessons (title_id, position, name, duration_seconds, is_bonus)
  select id, x.position, x.name, x.secs, x.bonus from t_webinar, (values
    (0, 'Welcome & how to use this course', 360, false),
    (1, 'From Territory to One-to-Many', 540, false),
    (2, 'The 400/40 Model', 480, false),
    (3, 'A Real Audience Strategy', 600, false),
    (4, 'The Ten Gates of Agreement', 780, false),
    (5, 'An Offer Worth Responding To', 600, false),
    (6, 'Your Exact 60-Minute Webinar', 840, false),
    (7, 'The AI-Powered Build Process', 720, false),
    (8, 'Plan, Create, Practice', 480, false),
    (9, 'Deliver', 420, false),
    (10, 'The Reinvite Engine', 540, false),
    (11, 'Stop Driving Farther. Start Reaching Farther.', 360, false),
    (12, 'Live build: put it all together', 1920, true)
  ) as x(position, name, secs, bonus)
  returning id
)
insert into public.resources (title_id, position, name)
select id, x.position, x.name from t_webinar, (values
  (0, 'Ten Gates of Agreement checklist'),
  (1, '60-minute webinar block template'),
  (2, 'AI prompt pack for webinar drafting')
) as x(position, name);

-- The 1 Hour Book
with t_book as (
  insert into public.titles (slug, title, subtitle, series, description, status, cover_path, course_name, sort_order)
  values ('book', 'The 1 Hour Book', 'for Financial Advisors', 'The 1 Hour Series™', 'How to write your book in 60 minutes with AI, and turn it into authority, credibility, leads, opportunities and freedom.', 'live', '/covers/book.jpg', 'Write Your 1 Hour Book', 1)
  returning id
)
, ch as (
  insert into public.chapters (title_id, position, name, duration_seconds, cta)
  select id, x.position, x.name, x.secs, x.cta from t_book, (values
    (0, 'Introduction: Why Every Advisor Needs a Book', 600, null),
    (1, 'Authority', 900, null),
    (2, 'Credibility', 840, null),
    (3, 'Leads', 1020, 'Want your book wired into a lead funnel?'),
    (4, 'Opportunities', 780, null),
    (5, 'Freedom', 720, null),
    (6, 'The 60-Minute Method', 1320, null),
    (7, 'Writing With AI', 1200, null),
    (8, 'From Manuscript to Marketing Asset', 960, 'You finished the book. Let''s map out yours.')
  ) as x(position, name, secs, cta)
  returning id, position
)
, ex as (
  insert into public.exercises (title_id, position, name, chapter_id, questions)
  select (select id from t_book), x.position, x.name, (select id from ch where ch.position = x.chpos), x.questions from (values
    (0, 'Why your book, why now', 0, array['What do you want your book to do for your practice in the next 12 months?']::text[]),
    (1, 'Your authority position', 1, array['What do you want to be known for, in one sentence?']::text[]),
    (2, 'Your reader', 3, array['Who exactly is this book for, and what problem do they bring to you?']::text[]),
    (3, 'Your chapter outline', 6, array['List your chapter titles in order.']::text[]),
    (4, 'Your AI drafting prompts', 7, array['Write the prompt you''ll use to draft your first chapter with AI.']::text[]),
    (5, 'Your launch plan', 8, array['How will the book reach prospects: funnel, seminar, webinar, referral partners?']::text[])
  ) as x(position, name, chpos, questions)
  returning id
)
, ls as (
  insert into public.lessons (title_id, position, name, duration_seconds, is_bonus)
  select id, x.position, x.name, x.secs, x.bonus from t_book, (values
    (0, 'Welcome & how to use this course', 360, false),
    (1, 'Authority', 480, false),
    (2, 'Credibility', 480, false),
    (3, 'Leads', 540, false),
    (4, 'Opportunities', 420, false),
    (5, 'Freedom', 420, false),
    (6, 'The 60-Minute Method', 720, false),
    (7, 'Writing With AI', 660, false),
    (8, 'From Manuscript to Marketing Asset', 540, false),
    (9, 'Live build: put it all together', 1920, true)
  ) as x(position, name, secs, bonus)
  returning id
)
insert into public.resources (title_id, position, name)
select id, x.position, x.name from t_book, (values
  (0, 'Book outline template'),
  (1, 'AI prompt pack for chapter drafting'),
  (2, 'Launch checklist')
) as x(position, name);

-- Atomic Offers
with t_atomic as (
  insert into public.titles (slug, title, subtitle, series, description, status, cover_path, course_name, sort_order)
  values ('atomic', 'Atomic Offers', 'for Financial Advisors', '2027 AI Edition', 'How to create an insanely powerful offer your prospects can''t refuse. Same principles, a more powerful playbook.', 'live', '/covers/atomic.jpg', 'Build Your Atomic Offer', 2)
  returning id
)
, ch as (
  insert into public.chapters (title_id, position, name, duration_seconds, cta)
  select id, x.position, x.name, x.secs, x.cta from t_atomic, (values
    (0, 'Introduction: The Offer Is the Business', 540, null),
    (1, 'Why “Free Consultation” Fails', 840, null),
    (2, 'Anatomy of an Atomic Offer', 1140, null),
    (3, 'Stacking Value', 960, null),
    (4, 'Risk Reversal', 780, null),
    (5, 'Urgency Without Pressure', 720, null),
    (6, 'AI Strategies for 2027', 1320, 'Want help building your Atomic Offer with AI?'),
    (7, 'Launching Your Offer', 900, 'You finished the book. Let''s build your offer together.')
  ) as x(position, name, secs, cta)
  returning id, position
)
, ex as (
  insert into public.exercises (title_id, position, name, chapter_id, questions)
  select (select id from t_atomic), x.position, x.name, (select id from ch where ch.position = x.chpos), x.questions from (values
    (0, 'Audit your current offer', 1, array['Write your current offer exactly as a prospect hears it today.']::text[]),
    (1, 'The result you sell', 2, array['What result does a prospect walk away with after working with you?']::text[]),
    (2, 'Stack your value', 3, array['List everything included in your offer, with what each piece is worth to the client.']::text[]),
    (3, 'Your risk reversal', 4, array['What can you promise that removes the prospect''s risk of saying yes?']::text[]),
    (4, 'Your reason to act now', 5, array['Why should a prospect respond this month and not next year?']::text[]),
    (5, 'Draft your offer with AI', 6, array['Paste your AI-assisted offer draft, then mark what you''ll keep.']::text[])
  ) as x(position, name, chpos, questions)
  returning id
)
, ls as (
  insert into public.lessons (title_id, position, name, duration_seconds, is_bonus)
  select id, x.position, x.name, x.secs, x.bonus from t_atomic, (values
    (0, 'Welcome & how to use this course', 360, false),
    (1, 'Why “Free Consultation” Fails', 480, false),
    (2, 'Anatomy of an Atomic Offer', 600, false),
    (3, 'Stacking Value', 540, false),
    (4, 'Risk Reversal', 420, false),
    (5, 'Urgency Without Pressure', 420, false),
    (6, 'AI Strategies for 2027', 720, false),
    (7, 'Launching Your Offer', 480, false),
    (8, 'Live build: put it all together', 1920, true)
  ) as x(position, name, secs, bonus)
  returning id
)
insert into public.resources (title_id, position, name)
select id, x.position, x.name from t_atomic, (values
  (0, 'Offer builder worksheet'),
  (1, 'AI prompt pack for offers'),
  (2, 'Compliance review checklist')
) as x(position, name);

