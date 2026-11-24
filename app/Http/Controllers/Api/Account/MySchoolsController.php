<?php

namespace App\Http\Controllers\Api\Account;

use App\Http\Controllers\Controller;
use App\Support\StaffSchools;

/**
 * The logged-in staff member's schools (the ones the SDO assigned them to)
 * and switching between them — see the school switcher on the counselor,
 * coordinator and combined-role dashboards (initSchoolSwitcher() in
 * js/utils.js).
 *
 *   GET  -> { current, schools: [{schoolCode, schoolName, role, roleLabel, grade, isCurrent}] }
 *   POST { school } -> makes that school current; returns the new role/school/
 *                      grade and the dashboard folder for that role.
 */
class MySchoolsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();
        api_require_role(api_roles_guidance());
        StaffSchools::ensureTable($conn);
        $accountId = api_user_id();

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            json_out([
                'success' => true,
                'current' => api_school(),
                'schools' => StaffSchools::forAccount($conn, $accountId),
            ]);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            api_fail(405, 'Method not allowed');
        }

        $data = json_decode((string) file_get_contents('php://input'), true);
        $school = trim((string) (is_array($data) ? ($data['school'] ?? '') : ''));
        if ($school === '') {
            api_fail(400, 'Choose a school.');
        }

        // Only a school the SDO assigned to this account can become current.
        $assignment = StaffSchools::activate($conn, $accountId, $school);
        if ($assignment === null) {
            api_fail(403, "You aren't assigned to that school.");
        }

        // The session guard re-reads these from the database on the next
        // request anyway; updating the session now keeps this one consistent.
        $user = session('user') ?: [];
        $user['school'] = $assignment['schoolName'];
        $user['role'] = $assignment['role'];
        $user['grade'] = $assignment['grade'] !== '' ? $assignment['grade'] : null;
        session()->put('user', $user);

        json_out([
            'success' => true,
            'message' => "You're now working in {$assignment['schoolName']}.",
            'user' => [
                'school' => $assignment['schoolName'],
                'role' => $assignment['role'],
                'roleLabel' => $assignment['roleLabel'],
                'grade' => $assignment['grade'],
            ],
            'dashboard' => StaffSchools::dashboardFolder($assignment['role']),
        ]);
    }
}
