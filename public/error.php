<?php

// Target of the ErrorDocument rules in .htaccess. For those requests Apache
// leaves REQUEST_URI set to the URL that failed (e.g. /css/), which Laravel
// would route on, so point it at the /error route (routes/web.php) instead.
// That route reads ?code= and renders resources/views/errors/page.blade.php
// with the matching status.
$_SERVER['REQUEST_URI'] = '/error?' . ($_SERVER['QUERY_STRING'] ?? '');

require __DIR__ . '/index.php';
