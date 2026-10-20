<?php

namespace App\Http\Controllers\Api\Account;

use App\Http\Controllers\Controller;

// Streams a user's profile photo out of users_tables.profile_image_data —
// the photo lives in the database now, not on disk (see
// ensure_users_table_profile_image_blob_columns() in profile-schema.php),
// so this is the only place a profile picture is actually read back out.
// Referenced as api/avatar.php?id=<AccountID>&v=<token> everywhere a page
// would otherwise have linked straight to uploads/profile-images/*.jpg —
// see userAvatarUrl() in js/utils.js.
class AvatarController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        ensure_users_table_profile_image_blob_columns($conn);

        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            return response('', 400);
        }

        $stmt = $conn->prepare('SELECT profile_image_data, profile_image_mime FROM users_tables WHERE AccountID = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row || $row['profile_image_data'] === null) {
            return response('', 404);
        }

        // Long-lived — the URL's ?v= token changes on every new upload (see
        // fetch_profile() in api/profile.php), so a stale cache is never stale.
        return response($row['profile_image_data'], 200, [
            'Content-Type' => ($row['profile_image_mime'] ?: 'application/octet-stream'),
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
