<?php

namespace App\Http\Controllers\Api\Feedback;

use App\Http\Controllers\Controller;
use App\Support\ProfanityFilter;

// POST {text} -> {clean, matches: [{masked, mild}]}. The as-you-type check
// behind js/profanity-guard.js: word lists only (never Sightengine, so
// typing doesn't use up its quota). Saving a message checks again on the
// server, with Sightengine too when it's set up.
class ProfanityCheckController extends Controller
{
    public function __invoke()
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            json_out(['success' => false, 'message' => 'Method not allowed']);
        }

        $payload = json_decode((string) file_get_contents('php://input'), true);
        $text = is_array($payload) ? (string) ($payload['text'] ?? '') : '';
        // Long enough for any feedback; stops oversized requests.
        $text = mb_substr($text, 0, 5000);

        $result = ProfanityFilter::check($text, false);
        json_out([
            'success' => true,
            'clean' => $result['clean'],
            'matches' => ProfanityFilter::publicMatches($result),
            'message' => $result['clean'] ? '' : ProfanityFilter::rejectionMessage($result),
        ]);
    }
}
