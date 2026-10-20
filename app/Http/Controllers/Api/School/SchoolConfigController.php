<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;

// Read-only school reference data (names, grade configs).
//
// Deliberately NOT behind the session middleware — js/register.js (the
// public, pre-login student registration page) fetches ?action=list
// directly to populate the School dropdown before any account/session
// exists. This isn't sensitive, so it stays public, as it always was.
//
// The shared school helpers themselves live in
// app/Support/Legacy/school-config.php.
class SchoolConfigController extends Controller
{
    public function __invoke()
    {
        $action = $_GET['action'] ?? 'list';

        if ($action === 'config') {
            $school = trim((string)($_GET['school'] ?? ''));
            $config = $school !== '' ? getSchoolConfig($school) : null;

            if (!$config) {
                return response()->json(['success' => false, 'message' => 'School not found'], 404);
            }

            return response()->json(['success' => true, 'school' => $config]);
        }

        if ($action === 'getGrades') {
            $school = trim((string)($_GET['school'] ?? ''));
            $config = $school !== '' ? getSchoolConfig($school) : null;

            return response()->json(array_merge(
                ['success' => true],
                gradesForSchoolLevel($config['schoolLevel'] ?? null)
            ));
        }

        return response()->json(['success' => true, 'schools' => getSchoolList()]);
    }
}
