<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Normalizer;
use Throwable;
use Transliterator;

/**
 * Keeps bad words out of what students write (feedback threads, replies and
 * rating comments).
 *
 * Two layers:
 *  1. Word lists in resources/profanity (English, Filipino, other Philippine
 *     languages, and the strongest words in about 20 more languages). Always
 *     on, free and offline. Catches the usual disguises: leet speak (g@go,
 *     sh1t), stretched letters (gaaago), spaced or dotted letters (f u c k,
 *     g.a.g.o), masks (f*ck), look-alike letters from other alphabets, and
 *     common endings (gagong, putanginamo, kabobohan).
 *  2. Optionally Sightengine (https://sightengine.com), when an API key is
 *     set in .env: rule-based checks in 18 languages. Only used when a
 *     student submits, never for the as-you-type check, so the free plan's
 *     quota lasts. If it can't be reached, layer 1 still applies.
 *
 * Words in resources/profanity/allow.txt are never blocked by either layer,
 * so a student can always describe abuse, their body, health or identity to
 * a counselor.
 */
final class ProfanityFilter
{
    private const LIST_FILES = ['en.txt', 'fil.txt', 'ph-regional.txt', 'world.txt'];
    private const ALLOW_FILE = 'allow.txt';
    private const SIGHTENGINE_URL = 'https://api.sightengine.com/1.0/text/check.json';

    // Endings a listed word may carry ("fucking", "gagong", "putanginamo").
    private const SUFFIXES = ['ings', 'ing', 'ers', 'er', 'ed', 'es', 's', 'han', 'hin', 'an', 'in', 'ng', 'nyo', 'niyo', 'mo', 'ka', 'ko'];
    // The only endings for listed words of four letters or fewer. Short
    // words with English endings are too often other words: "spic" +
    // "es" = "spices", "tit" + "an" = "titan", "cock" + "er" = "cocker".
    // Tested against the 50,000 most common English and Tagalog words.
    private const SHORT_WORD_SUFFIXES = ['s', 'ing', 'ng', 'nyo', 'niyo', 'mo', 'ka', 'ko', 'han', 'hin'];
    // Phrases are also caught written as one word ("putanginamo"), but only
    // when that's at least this long: short ones collide ("du ma" -> "duma"
    // in Tagalog "dumaan").
    private const MIN_JOINED_PHRASE = 6;
    // Endings allowed after a Filipino prefix ("kabobohan", "nakakagago").
    private const PH_SUFFIXES = ['han', 'hin', 'an', 'in', 'ng', 'nyo', 'mo', 'ka', 'ko'];
    private const PH_PREFIXES = ['nakaka', 'pinaka', 'napaka', 'naka', 'nag', 'mag', 'pag', 'ka', 'ma', 'na', 'pa'];

    // Digits and symbols used in place of letters.
    private const LEET = ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '8' => 'b', '9' => 'g',
        '@' => 'a', '$' => 's', '!' => 'i', '|' => 'i', '+' => 't', '€' => 'e'];

    // Latin letters that losing accents doesn't turn into plain ASCII.
    private const LATIN_FOLD = ['ß' => 'ss', 'ø' => 'o', 'đ' => 'd', 'ł' => 'l', 'æ' => 'ae', 'œ' => 'oe', 'ı' => 'i', 'þ' => 'th', 'ð' => 'd'];

    // Cyrillic and Greek letters that look like Latin ones ("fuсk" with a
    // Cyrillic "с"). Only folded in words that mix alphabets, so real
    // Russian or Greek words are left alone.
    private const HOMOGLYPHS = ['а' => 'a', 'в' => 'b', 'е' => 'e', 'ё' => 'e', 'к' => 'k', 'м' => 'm', 'н' => 'h', 'о' => 'o',
        'р' => 'p', 'с' => 'c', 'т' => 't', 'у' => 'y', 'х' => 'x', 'і' => 'i', 'ј' => 'j', 'ѕ' => 's', 'α' => 'a', 'β' => 'b',
        'ε' => 'e', 'ι' => 'i', 'κ' => 'k', 'ν' => 'v', 'ο' => 'o', 'ρ' => 'p', 'τ' => 't', 'υ' => 'u', 'χ' => 'x'];

    // Scripts written without spaces between words: their entries are
    // matched anywhere in the text.
    private const NO_SPACE_SCRIPTS = '/[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}\p{Thai}]/u';

    private const INTENSITY_RANK = ['low' => 1, 'medium' => 2, 'high' => 3];

    private static ?array $index = null;

    public static function enabled(): bool
    {
        return (bool) config('guidance.profanity.enabled', true);
    }

    /**
     * Checks $text. With $useApi, Sightengine is asked too (when configured).
     *
     * @return array{clean: bool, matches: list<array{text: string, masked: string, mild: bool, source: string}>, checked: list<string>}
     */
    public static function check(string $text, bool $useApi = true): array
    {
        $result = ['clean' => true, 'matches' => [], 'checked' => []];
        if (!self::enabled() || trim($text) === '') {
            return $result;
        }

        $index = self::index();
        $blockMild = (bool) config('guidance.profanity.block_mild', true);
        $tokens = self::tokenize($text);
        $allowed = self::allowedTokenFlags($tokens, $index);

        $found = [];
        foreach (self::listMatches($text, $tokens, $allowed, $index) as $match) {
            if ($match['mild'] && !$blockMild) {
                continue;
            }
            $found[mb_strtolower($match['text'])] = $match;
        }
        $result['checked'][] = 'list';

        if ($useApi && self::sightengineConfigured()) {
            $apiMatches = self::sightengineMatches($text, $blockMild, $tokens, $allowed, $index);
            if ($apiMatches !== null) {
                $result['checked'][] = 'sightengine';
                foreach ($apiMatches as $match) {
                    $found[mb_strtolower($match['text'])] ??= $match;
                }
            }
        }

        $result['matches'] = array_values($found);
        $result['clean'] = empty($found);
        return $result;
    }

    /**
     * Ends the request with a 422 when $text has words that aren't allowed.
     * $field names the text for the page (e.g. "comment").
     */
    public static function abortIfProfane(string $text, string $field = 'message'): void
    {
        $result = self::check($text);
        if ($result['clean']) {
            return;
        }
        http_response_code(422);
        json_out([
            'success' => false,
            'code' => 'profanity',
            'field' => $field,
            'message' => self::rejectionMessage($result),
            'matches' => self::publicMatches($result),
        ]);
    }

    public static function rejectionMessage(array $result): string
    {
        $words = implode(', ', array_map(fn ($m) => '"' . $m['masked'] . '"', array_slice($result['matches'], 0, 5)));
        return "Please rephrase without {$words}. Feedback has to stay respectful, but you can still say exactly what happened.";
    }

    // What's safe to send back to the page: the masked words only.
    public static function publicMatches(array $result): array
    {
        return array_map(fn ($m) => ['masked' => $m['masked'], 'mild' => $m['mild']], $result['matches']);
    }

    /* ------------------------------------------------------------------
     | Word-list matching
     * ------------------------------------------------------------------ */

    private static function listMatches(string $text, array $tokens, array $allowed, array $index): array
    {
        $matches = [];
        $normTokens = array_column($tokens, 'norm');
        $count = count($tokens);

        // Phrases first ("anak ng puta", "fils de pute").
        $covered = [];
        foreach ($index['phrases'] as $phrase) {
            $len = count($phrase['parts']);
            for ($i = 0; $i + $len <= $count; $i++) {
                $hit = true;
                for ($k = 0; $k < $len && $hit; $k++) {
                    $hit = empty($allowed[$i + $k]) && self::sameWord($normTokens[$i + $k], $phrase['parts'][$k]);
                }
                if ($hit) {
                    $raw = implode(' ', array_column(array_slice($tokens, $i, $len), 'raw'));
                    $matches[] = self::match($raw, $phrase['mild'], 'list');
                    for ($k = 0; $k < $len; $k++) {
                        $covered[$i + $k] = true;
                    }
                }
            }
        }

        // Single words.
        foreach ($tokens as $i => $token) {
            if (!empty($allowed[$i]) || !empty($covered[$i])) {
                continue;
            }
            $entry = self::matchWord($token['norm'], $index);
            if ($entry !== null) {
                $matches[] = self::match($token['raw'], $entry['mild'], 'list');
            }
        }

        // Letters spelled out one at a time ("f u c k", "g a g o").
        $run = [];
        $flush = function () use (&$run, &$matches, $tokens, $index) {
            if (count($run) >= 3) {
                $joined = implode('', array_map(fn ($i) => $tokens[$i]['norm'], $run));
                $entry = self::lookup($joined, $index, true);
                if ($entry !== null) {
                    $matches[] = self::match(implode(' ', array_map(fn ($i) => $tokens[$i]['raw'], $run)), $entry['mild'], 'list');
                }
            }
            $run = [];
        };
        foreach ($tokens as $i => $token) {
            if (empty($allowed[$i]) && mb_strlen($token['norm']) === 1 && preg_match('/\p{L}/u', $token['norm'])) {
                $run[] = $i;
            } else {
                $flush();
            }
        }
        $flush();

        // Chinese, Japanese, Korean and Thai: anywhere in the text.
        if (preg_match(self::NO_SPACE_SCRIPTS, $text)) {
            $haystack = self::foldBasic($text);
            foreach ($index['anywhere'] as $entry) {
                if (str_contains($haystack, $entry['norm'])) {
                    $matches[] = self::match($entry['word'], $entry['mild'], 'list');
                }
            }
        }

        return $matches;
    }

    // The listed word $norm (one normalized token) stands for, or null.
    private static function matchWord(string $norm, array $index): ?array
    {
        if ($norm === '' || !preg_match('/\p{L}/u', $norm)) {
            return null;
        }
        if (str_contains($norm, '*')) {
            return self::matchMasked($norm, $index);
        }

        $variants = [$norm];
        if (str_contains($norm, 'ph')) {
            $variants[] = str_replace('ph', 'f', $norm); // "phuck"
        }

        foreach ($variants as $word) {
            if (($entry = self::lookup($word, $index, true)) !== null) {
                return $entry;
            }
            // A listed word plus an ending: "fucking", "gagong", "putanginamo".
            foreach (self::SUFFIXES as $suffix) {
                $base = self::cut($word, '', $suffix, 3);
                if ($base !== null && ($entry = self::lookup($base, $index, false)) !== null
                    && (mb_strlen($entry['norm']) >= 5 || in_array($suffix, self::SHORT_WORD_SUFFIXES, true))) {
                    return $entry;
                }
            }
            // A Filipino prefix, with or without an ending: "kabobohan".
            foreach (self::PH_PREFIXES as $prefix) {
                $rest = self::cut($word, $prefix, '', 4);
                if ($rest === null) {
                    continue;
                }
                if (($entry = self::lookup($rest, $index, false)) !== null && mb_strlen($entry['norm']) >= 4) {
                    return $entry;
                }
                foreach (self::PH_SUFFIXES as $suffix) {
                    $base = self::cut($rest, '', $suffix, 4);
                    if ($base !== null && ($entry = self::lookup($base, $index, false)) !== null) {
                        return $entry;
                    }
                }
            }
        }

        // Other alphabets (Cyrillic, Arabic, Devanagari...): word endings
        // vary a lot, so a token that starts with a listed word counts.
        if (!preg_match('/\p{Latin}/u', $norm)) {
            foreach ($index['stems'] as $stem => $entry) {
                if (str_starts_with($norm, $stem)) {
                    return $entry;
                }
            }
        }
        return null;
    }

    /**
     * A listed single word equal to $word. $loose also accepts stretched
     * letters ("fuuuck", "gaaago"): same letters once repeats are squeezed,
     * and at least as long as the listed word, so "as" never matches "ass".
     */
    private static function lookup(string $word, array $index, bool $loose): ?array
    {
        if (isset($index['words'][$word])) {
            return $index['words'][$word];
        }
        if (!$loose) {
            $squeezed = self::squeeze($word, 3);
            return $index['words'][$squeezed] ?? null;
        }
        foreach ($index['skeletons'][self::squeeze($word, 2)] ?? [] as $entry) {
            if (mb_strlen($word) >= mb_strlen($entry['norm'])) {
                return $entry;
            }
        }
        return null;
    }

    // "f*ck", "p**a": a listed word of the same length that fits the mask.
    private static function matchMasked(string $norm, array $index): ?array
    {
        $len = mb_strlen($norm);
        $stars = mb_substr_count($norm, '*');
        if ($len < 3 || $stars * 2 > $len) {
            return null;
        }
        $pattern = '/^' . str_replace('\*', '.', preg_quote($norm, '/')) . '$/u';
        foreach ($index['byLength'][$len] ?? [] as $entry) {
            if (preg_match($pattern, $entry['norm'])) {
                return $entry;
            }
        }
        return null;
    }

    private static function sameWord(string $token, string $listed): bool
    {
        return $token === $listed
            || (self::squeeze($token, 2) === self::squeeze($listed, 2) && mb_strlen($token) >= mb_strlen($listed));
    }

    // $word minus $prefix and $suffix, if it has them and what's left is at
    // least $min letters long; otherwise null.
    private static function cut(string $word, string $prefix, string $suffix, int $min): ?string
    {
        if (($prefix !== '' && !str_starts_with($word, $prefix)) || ($suffix !== '' && !str_ends_with($word, $suffix))) {
            return null;
        }
        $rest = mb_substr($word, mb_strlen($prefix), mb_strlen($word) - mb_strlen($prefix) - mb_strlen($suffix));
        return mb_strlen($rest) >= $min ? $rest : null;
    }

    /* ------------------------------------------------------------------
     | Never-blocked words
     * ------------------------------------------------------------------ */

    // For each token, whether it's an allowed word or part of an allowed
    // phrase ("leche flan", "kill myself").
    private static function allowedTokenFlags(array $tokens, array $index): array
    {
        $flags = [];
        $norms = array_column($tokens, 'norm');
        foreach ($norms as $i => $norm) {
            if (isset($index['allowWords'][$norm])) {
                $flags[$i] = true;
            }
        }
        foreach ($index['allowPhrases'] as $parts) {
            $len = count($parts);
            for ($i = 0; $i + $len <= count($norms); $i++) {
                if (array_slice($norms, $i, $len) === $parts) {
                    for ($k = 0; $k < $len; $k++) {
                        $flags[$i + $k] = true;
                    }
                }
            }
        }
        return $flags;
    }

    /* ------------------------------------------------------------------
     | Sightengine
     * ------------------------------------------------------------------ */

    private static function sightengineConfigured(): bool
    {
        return (string) config('guidance.profanity.sightengine.api_user', '') !== ''
            && (string) config('guidance.profanity.sightengine.api_secret', '') !== '';
    }

    // Matches from Sightengine, or null when it couldn't be asked (not set
    // up, unreachable, over quota): then the word lists decide alone.
    private static function sightengineMatches(string $text, bool $blockMild, array $tokens, array $allowed, array $index): ?array
    {
        $config = config('guidance.profanity.sightengine');
        $text = mb_substr($text, 0, 10000); // the API's limit per request
        $languages = (string) ($config['languages'] ?? 'en');
        $cacheKey = 'profanity:sightengine:' . sha1($languages . "\n" . $text);

        $profanity = Cache::get($cacheKey);
        if (!is_array($profanity)) {
            try {
                $response = Http::asForm()
                    ->timeout(max(1, (int) ($config['timeout'] ?? 4)))
                    ->post(self::SIGHTENGINE_URL, [
                        'text' => $text,
                        'lang' => $languages,
                        'mode' => 'rules',
                        'categories' => 'profanity',
                        'api_user' => $config['api_user'],
                        'api_secret' => $config['api_secret'],
                    ]);
                $body = $response->json();
                if (!$response->successful() || ($body['status'] ?? '') !== 'success') {
                    Log::warning('Sightengine profanity check failed', ['status' => $response->status(), 'error' => $body['error']['message'] ?? null]);
                    return null;
                }
                $profanity = $body['profanity']['matches'] ?? [];
                // Same text, same answer: don't spend another operation on it.
                Cache::put($cacheKey, $profanity, now()->addDay());
            } catch (Throwable $e) {
                Log::warning('Sightengine profanity check unreachable: ' . $e->getMessage());
                return null;
            }
        }

        // Words the student is allowed to use, as they appear in this text.
        $allowedHere = [];
        foreach ($tokens as $i => $token) {
            if (!empty($allowed[$i])) {
                $allowedHere[$token['norm']] = true;
            }
        }

        $minRank = $blockMild ? 1 : 2;
        $matches = [];
        foreach ($profanity as $hit) {
            $word = trim((string) ($hit['match'] ?? ''));
            $rank = self::INTENSITY_RANK[$hit['intensity'] ?? 'high'] ?? 3;
            if ($word === '' || $rank < $minRank) {
                continue;
            }
            $parts = array_column(self::tokenize($word), 'norm');
            $isAllowed = !empty($parts) && count(array_filter($parts, fn ($p) => isset($index['allowWords'][$p]) || isset($allowedHere[$p]))) === count($parts);
            if (!$isAllowed) {
                $matches[] = self::match($word, $rank === 1, 'sightengine');
            }
        }
        return $matches;
    }

    /* ------------------------------------------------------------------
     | Text handling
     * ------------------------------------------------------------------ */

    // Words of the text, each as written (raw) and normalized (norm).
    private static function tokenize(string $text): array
    {
        $tokens = [];
        if (!preg_match_all('/[^\s,;:?"“”()\[\]{}<>\/\\\\]+/u', $text, $found)) {
            return $tokens;
        }
        foreach ($found[0] as $raw) {
            // Punctuation around a word isn't part of it ("gago!!!", "*very*"),
            // but a leading @ or $ can be a letter in disguise ("@ss", "$hit").
            $raw = preg_replace('/^[.!?\'"’`~*_\-]+|[.!?\'"’`~*_\-]+$/u', '', $raw);
            if ($raw === '') {
                continue;
            }
            $tokens[] = ['raw' => $raw, 'norm' => self::normalize($raw)];
        }
        return $tokens;
    }

    // Lower case, compatibility forms folded (fullwidth letters, ligatures).
    private static function foldBasic(string $text): string
    {
        $text = mb_strtolower($text, 'UTF-8');
        if (class_exists(Normalizer::class)) {
            $text = Normalizer::normalize($text, Normalizer::FORM_KC) ?: $text;
        }
        return $text;
    }

    // One word as the lists compare it: no case, accents, look-alike
    // letters, leet digits/symbols or separators inside the word.
    private static function normalize(string $word): string
    {
        $word = self::foldBasic($word);
        if (preg_match('/\p{Latin}/u', $word)) {
            if (preg_match('/[\p{Cyrillic}\p{Greek}]/u', $word)) {
                $word = strtr($word, self::HOMOGLYPHS);
            }
            $word = strtr(self::stripAccents($word), self::LATIN_FOLD);
        }
        if (preg_match('/[\p{L}]/u', $word) && preg_match('/[0-9@$!|+€]/u', $word)) {
            $word = strtr($word, self::LEET);
        }
        return preg_replace("/[.\\-_'’`~^]+/u", '', $word);
    }

    private static function stripAccents(string $word): string
    {
        static $transliterator = false;
        if ($transliterator === false) {
            $transliterator = class_exists(Transliterator::class)
                ? Transliterator::create('NFD; [:Nonspacing Mark:] Remove; NFC')
                : null;
        }
        if ($transliterator) {
            return $transliterator->transliterate($word) ?: $word;
        }
        if (class_exists(Normalizer::class)) {
            $decomposed = Normalizer::normalize($word, Normalizer::FORM_D);
            return Normalizer::normalize(preg_replace('/\p{Mn}+/u', '', (string) $decomposed), Normalizer::FORM_C) ?: $word;
        }
        return $word;
    }

    // Runs of $atLeast or more of the same letter become one ("fuuuck").
    private static function squeeze(string $word, int $atLeast): string
    {
        $repeat = $atLeast - 1;
        return preg_replace('/(.)\1{' . $repeat . ',}/u', '$1', $word);
    }

    private static function match(string $text, bool $mild, string $source): array
    {
        return ['text' => $text, 'masked' => self::mask($text), 'mild' => $mild, 'source' => $source];
    }

    // "gago" -> "g**o", "putang ina" -> "p********a".
    private static function mask(string $text): string
    {
        $len = mb_strlen($text);
        if ($len <= 2) {
            return mb_substr($text, 0, 1) . '*';
        }
        if ($len === 3) {
            return mb_substr($text, 0, 1) . '**';
        }
        $inner = preg_replace('/\S/u', '*', mb_substr($text, 1, $len - 2));
        return mb_substr($text, 0, 1) . $inner . mb_substr($text, -1);
    }

    /* ------------------------------------------------------------------
     | Lists
     * ------------------------------------------------------------------ */

    private static function index(): array
    {
        if (self::$index !== null) {
            return self::$index;
        }
        $dir = resource_path('profanity');
        $index = ['words' => [], 'skeletons' => [], 'byLength' => [], 'phrases' => [], 'anywhere' => [], 'stems' => [], 'allowWords' => [], 'allowPhrases' => []];

        foreach (self::LIST_FILES as $file) {
            foreach (self::readList("{$dir}/{$file}") as [$word, $mild]) {
                if (preg_match(self::NO_SPACE_SCRIPTS, $word)) {
                    $index['anywhere'][] = ['word' => $word, 'norm' => self::foldBasic($word), 'mild' => $mild];
                    continue;
                }
                $parts = array_column(self::tokenize($word), 'norm');
                if (count($parts) > 1) {
                    $index['phrases'][] = ['parts' => $parts, 'mild' => $mild];
                    $word = implode('', $parts); // also caught written as one word
                    if (mb_strlen($word) < self::MIN_JOINED_PHRASE) {
                        continue;
                    }
                } elseif (count($parts) === 1) {
                    $word = $parts[0];
                } else {
                    continue;
                }
                $entry = ['norm' => $word, 'mild' => $mild];
                // A word on more than one list counts as strong if any says so.
                if (isset($index['words'][$word]) && !$index['words'][$word]['mild']) {
                    continue;
                }
                $index['words'][$word] = $entry;
                $index['skeletons'][self::squeeze($word, 2)][] = $entry;
                $index['byLength'][mb_strlen($word)][] = $entry;
                if (!preg_match('/\p{Latin}/u', $word) && mb_strlen($word) >= 3) {
                    $index['stems'][$word] = $entry;
                }
            }
        }

        foreach (self::readList("{$dir}/" . self::ALLOW_FILE) as [$word]) {
            $parts = array_column(self::tokenize($word), 'norm');
            if (count($parts) > 1) {
                $index['allowPhrases'][] = $parts;
            } elseif (count($parts) === 1) {
                $index['allowWords'][$parts[0]] = true;
            }
        }
        // An allowed word is never on the block lists, whatever they say.
        foreach (array_keys($index['allowWords']) as $word) {
            unset($index['words'][$word], $index['stems'][$word]);
        }

        return self::$index = $index;
    }

    // [word, mild] pairs from a list file: one per line, "#" starts a
    // comment, "|mild" marks a milder word.
    private static function readList(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        $entries = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES) as $line) {
            $line = trim(preg_replace('/^\xEF\xBB\xBF/', '', $line));
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $mild = false;
            if (preg_match('/^(.*)\|mild$/u', $line, $m)) {
                $line = trim($m[1]);
                $mild = true;
            }
            $entries[] = [$line, $mild];
        }
        return $entries;
    }
}
