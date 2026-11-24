# Profanity filter word lists

Used by `App\Support\ProfanityFilter` to keep bad words out of what students
write: rating comments (`api/student-ratings`), feedback threads
(`api/feedback`) and their replies (`api/feedback-replies`). Students see a
warning while typing (`public/js/profanity-guard.js` → `api/profanity-check`),
and the server refuses the text again when it is saved.

## Files

| File | What's in it |
| --- | --- |
| `en.txt` | English. Generated from the LDNOOBW list (see Credits), with changes listed at the top of the file. |
| `fil.txt` | Filipino / Tagalog, with common Taglish and texting spellings. |
| `ph-regional.txt` | Cebuano / Bisaya and Ilocano. |
| `world.txt` | The strongest, clear-cut swear words in about 20 other languages. |
| `allow.txt` | **Never blocked**, by the lists or by Sightengine. |

## Format

One word or phrase per line. Lines starting with `#` are comments. Add
`|mild` after a milder word (`stupid|mild`). Mild words are blocked unless
`PROFANITY_BLOCK_MILD=false` is set in `.env`.

Only list the plain form of a word. The filter already catches:

- leet and symbols: `g@go`, `sh1t`, `$hit`
- stretched letters: `gaaago`, `fuuuck`
- spaced or dotted letters: `g a g o`, `f.u.c.k`
- masks: `f*ck`, `p**a`
- letters from other alphabets that look the same (`fuсk` with a Cyrillic с)
- endings and Filipino affixes: `gagong`, `putanginamo`, `kabobohan`, `nakakagago`
- phrases written as one word: `anakngputa`

Matching ignores case and accents. Chinese, Japanese, Korean and Thai entries
match anywhere in the text, since those languages don't put spaces between
words.

## Before adding a word

A word that is harmless in another language, or in another sense, will block
ordinary feedback. Watch out for:

- **Everyday Filipino words.** Full foreign lists were left out because
  they block `aso`, `mama`, `pinto`, `muna`, `suka`, `pito`, `puto` and `am`.
- **What a student needs to tell a counselor.** Words about abuse, the body,
  health, puberty or identity belong in `allow.txt`, never on a block list:
  rape, harassment, "kill myself", gay, bakla and so on.

When unsure, put the word in `allow.txt` or leave it to Sightengine.

## Sightengine (optional)

Set `SIGHTENGINE_API_USER` and `SIGHTENGINE_API_SECRET` in `.env` (free plan
at https://sightengine.com: 2,000 checks a month, at most 500 a day). Every
submitted text is then also checked by Sightengine's rule-based profanity
detection, in the 18 languages listed in `SIGHTENGINE_LANGUAGES` (Tagalog
included).

- It runs only when a student submits, never while typing.
- The same text is checked at most once a day.
- If Sightengine can't be reached or is over quota, the word lists still apply.

Settings are in `config/guidance.php` under `profanity`.

## Credits

`en.txt` is adapted from the "List of Dirty, Naughty, Obscene, and Otherwise
Bad Words" by LDNOOBW, https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words,
licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Changes are described at the top of `en.txt`.
