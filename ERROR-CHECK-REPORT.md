# Error Check Report — E-Guide Guidance Management

**Date:** October 26, 2026  
**Branch:** `laravel-migration` (nothing committed yet; every fix below is a local change)

## Summary

Every page for all 6 roles was opened, every form was filled in and submitted, and every button was clicked, including Delete and Deactivate in a separate final pass. The whole referral workflow was run from the teacher's referral to the stage 7 acknowledgement.

| Result | Count |
|---|---|
| Bugs found and fixed | **5** |
| Needs your decision | **2** (referrals for unregistered students; staff Feedback page) |
| Pages tested | 52 (6 roles) |
| Buttons, links and forms used | 300+ in the main run, plus separate tests |
| JavaScript crashes on any page | 0 |
| Server errors (HTTP 500) | 0 |

## How it was tested

- **Separate test database (`guidance_test`).** It holds the table structure, the lookup lists (regions, provinces, cities, barangays, schools, sections, case categories) and 6 test accounts, one per role. **No real student records were used.**
- **Separate copy of the app** on `http://127.0.0.1:8130`, with emails turned off so nobody received test messages.
- **Automated Chrome** logged in through the real login pages as each role and then:
  - opened every page
  - filled every visible form with realistic values
  - uploaded test files (PDF and PNG)
  - submitted every form
  - clicked every button, link, tab and calendar day
  - pressed "Yes" on the app's confirmation boxes
- **What counted as an error:**
  - JavaScript errors and console errors
  - failed requests and HTTP 4xx/5xx responses
  - API replies with `success: false` or that weren't JSON
  - browser pop-ups
  - red error messages shown on screen
- **Each bug was reproduced** with a separate script before it was fixed, and checked again after the fix.

## Bugs found and fixed

### 1. Missing profile photo on every staff page
- **What happened:** Accounts without a photo showed a broken image, and 41 pages got a "404 not found". The default picture pointed to `uploads/profile-images/default-profile.jpg`, which isn't on the server (the `uploads/` folder is not in git).
- **Fix:** The default picture is now `img/deped-seal.jpg`, which is in the project.
- **File:** `public/js/utils.js`

### 2. Student address saved "Select city or municipality" as the city name
- **What happened:** On Student Information, if the student left city, province or barangay unpicked, the placeholder text itself was saved as the address.
- **Fix:** An unpicked dropdown now saves an empty value.
- **File:** `public/pages/student/student-information.js`

### 3. Documents → Upload did nothing when no file was chosen
- **What happened:** The file input is hidden (the dashed box is the picker), but it was marked `required`. The browser blocked the upload with no message, so the button looked broken.
- **Fix:** Removed `required`. The page now says "Please fill in all required fields".
- **Files:** `resources/views/counselor/documents.blade.php`, `resources/views/coordinator/documents.blade.php`, `resources/views/other-school/documents.blade.php`

### 4. Report Settings → letterhead PDF: false "Could not read that PDF"
- **What happened:** Choosing a second PDF while the first one was still loading drew both on the same canvas. The user saw "Could not read that PDF — try a different file", the preview could be half-drawn, and it could be labeled with the wrong file name. Saving would then crop a broken image. The first load is slow because the PDF reader downloads on first use, so this is easy to trigger on a slow connection.
- **Fix:** A new pick cancels the one still loading. Only the latest file counts.
- **Files:** `public/pages/coordinator/report-case.js`, `public/pages/other-school/report-case.js`, `public/pages/sdo/district-report-cases.js`

### 5. "Today" was yesterday before 8 AM
- **What happened:** Dates were taken in UTC time. The Philippines is UTC+8, so from midnight to 7:59 AM "today" was still yesterday. Classes start around 7 AM, so this affects real use. Affected:
  - new counseling case date
  - teacher's referral date
  - follow-up dates (one of them is read-only, so the counselor couldn't correct it)
  - the dashboard's "this week" sessions
  - the date in export file names
- **Fix:** A new `localDateString()` helper in `utils.js` uses the phone or computer's own time. Checked at 01:12 AM: every default date now shows the correct day.
- **Files:**
  - `public/js/utils.js`
  - `public/pages/counselor/` `counseling.js`, `counselor.js`, `referral-status.js`, `report-case.js`, `schedule.js`
  - `public/pages/other-school/` `counseling.js`, `other-school.js`, `referrals.js`, `report-case.js`, `schedule.js`, `account.js`
  - `public/pages/coordinator/` `report-case.js`, `account.js`
  - `public/pages/sdo/` `district-report-cases.js`, `school-reports.js`

### Also changed earlier in this session (you asked for these)
- **Login error message:** The raw "Unexpected token '<' … is not valid JSON" text is now a friendly message ("Can't reach the server…", "Your session has expired…", "The server ran into a problem…"). Files: `public/js/loader.js`, `public/js/auth.js`, `resources/views/auth/` `login`, `register`, `staff-login`, `staff-register.blade.php`.
- **VS Code dev tunnel:** Pages were hanging, and links pointed to localhost. Files: `app/Http/Middleware/TrustProxies.php`, `app/Http/Middleware/SetContentLength.php` (new), `app/Http/Kernel.php`. These don't affect InfinityFree.
- **Database collation for InfinityFree:** `utf8mb4_0900_ai_ci` changed to `utf8mb4_unicode_ci`. Already committed in `5f2f9d2`.

## Needs your decision

### 1. Referrals for unregistered students

- **What happens:** The teacher's referral form accepts a student name that isn't registered. It shows "No matching student found in school records" but still lets the teacher submit.
- **The problem:** At stage 5 the counselor can't open the counseling case for that referral ("Student not found in school records. Please register the student first…"), so the referral gets stuck at counseling.

| Option | What it means |
|---|---|
| **A. Block it on the referral form (recommended)** | The teacher must pick a registered student before submitting. Records stay clean, and the student can later see and rate the case. |
| B. Let counseling cases accept unregistered names | More flexible, but the student has no account linked, so they can't see or rate the case and it won't appear in their history. |

### 2. The staff "Feedback" page doesn't save to the server

- **What happens:** On the counselor, coordinator and other-school **Feedback** page, submitting shows "Feedback submitted successfully!", but the feedback is only stored in that browser (local storage). It never reaches the database.
- **The problem:** Nobody else can ever read it, and it disappears if the browser data is cleared or the user switches phones. The page looks like an early prototype. The server has no code for staff feedback (the `feedback` table is for a different feature, the student conversation threads).

| Option | What it means |
|---|---|
| **A. Make it real** | Save to the database and show it to someone (for example the SDO, or a system admin). You decide who should read staff feedback. |
| B. Remove the page | Take it out of the staff menus if it isn't needed. |

Students' "Rate a counseling session" feedback is **not** affected. It saves to the server and works.

Tell me which option you want for each and I'll make the change.

## Checked and working

- **Login and logout** for all 6 roles. A deactivated account is blocked from logging in.
- **Student:**
  - Student Information wizard: all steps saved
  - appointment request
  - schedule, dashboard, profile, referral status
  - rating a counseling session
- **Teacher:** referral form submitted; referral status and dashboard show it.
- **Full referral workflow (counselor), stages 1 → 7:**
  - screening
  - assessment with file
  - urgency
  - consent with file
  - intervention
  - follow-up
  - acknowledgement form
  - stage history
- **Counseling cases:**
  - student search and suggestions
  - adding a registered student
  - saving the case
  - the case shows on the student's feedback page
- **Documents:** upload an image for a student ID, search, open the preview.
- **Schedule:** creating events. Past dates and Saturdays are correctly refused.
- **Report Settings:** uploading a letterhead PDF and showing the crop editor.
- **SDO:**
  - school management
  - add section
  - add case category (duplicates correctly refused)
  - school reports
  - district analytics
  - district report cases
- **Analytics, report cases, feedback, profile** pages for every staff role.
- **Approving and deleting** (each checked in the database afterwards):
  - counselor approves an appointment request
  - counselor rejects an appointment request
  - student deletes their rating
  - coordinator deletes a schedule event
  - coordinator deletes a document
  - coordinator and other-school deactivate a student account (that student then can't log in)
  - coordinator removes the school's report letterhead
  - SDO reverts to the built-in letterhead
  - SDO deletes a case category
- **After everything else**, every page for every role was opened once more and logout was tested: no errors.

### Messages that look like errors but are correct
These came up during the test and are the app doing its job:
- "You cannot schedule an event for a date that has already passed."
- "Saturday is not available. Please select a weekday."
- "Select a student first." (Export PDF with no student chosen)
- "Please enter a Student ID" / "Please select a file to upload"
- "That category already exists under this section."
- "Add at least one student before saving the case."
- The note shown under Import Accounts about not renaming the template columns.

## Smaller things noticed (not changed)

- **Schedule events can cover an approved appointment.** A counselor can create an All Day event on a date where a student already has an approved appointment, with no warning. The appointment stays "approved" and the student isn't told. Consider a warning when an event overlaps approved appointments.
- **Some confirmation boxes are the browser's plain pop-up.** Examples: "Delete this rating?", "Reject this appointment request?", "Are you sure you want to delete this document?". Others use the app's own styled dialog (`confirmAction()` in `utils.js`). It works either way; it just looks different.

## Not covered by this test

- **Real emails.** EmailJS was turned off. Send one real referral on the live site to check the email arrives.
- **InfinityFree itself.** The test ran on PHP 8.1 and MySQL 8. InfinityFree uses MariaDB 10.4 and has its own upload size limits.
- **Phone screen sizes.** The test used a laptop-sized window (1366 × 900).
- **Import Accounts with a real Excel file.**
- **Two people editing the same record at the same time**, and speed with many records.

## Files to upload to InfinityFree

Upload each file into the same folder inside `htdocs`.

```
public/js/utils.js
public/js/loader.js
public/js/auth.js
public/pages/student/student-information.js
public/pages/counselor/counseling.js
public/pages/counselor/counselor.js
public/pages/counselor/referral-status.js
public/pages/counselor/report-case.js
public/pages/counselor/schedule.js
public/pages/coordinator/account.js
public/pages/coordinator/report-case.js
public/pages/other-school/account.js
public/pages/other-school/counseling.js
public/pages/other-school/other-school.js
public/pages/other-school/referrals.js
public/pages/other-school/report-case.js
public/pages/other-school/schedule.js
public/pages/sdo/district-report-cases.js
public/pages/sdo/school-reports.js
resources/views/auth/login.blade.php
resources/views/auth/register.blade.php
resources/views/auth/staff-login.blade.php
resources/views/auth/staff-register.blade.php
resources/views/counselor/documents.blade.php
resources/views/coordinator/documents.blade.php
resources/views/other-school/documents.blade.php
app/Http/Middleware/TrustProxies.php
app/Http/Middleware/SetContentLength.php
app/Http/Kernel.php
```

The last three are only for the VS Code tunnel and are safe to upload too.

**Your own changes are not in this list.** I didn't touch these files, so upload them only if they're ready:
- `app/Http/Middleware/EnsureActiveSession.php`
- `app/Support/Legacy/session-guard.php`
- `public/.htaccess`
- `routes/web.php`
- `public/error.php`
- `resources/views/errors/`
