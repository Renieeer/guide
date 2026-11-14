<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;

class IssueTeacherAccessCodeController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        }

        $input = file_get_contents('php://input');
        $data = json_decode($input, true);

        // Only a school's own coordinator (or the combined counselor-and-coordinator
        // role) may issue teacher access codes, and only for their own school.
        // Role, school and issuer come from the logged-in account; the request
        // body used to supply them, so anyone could send role "coordinator"
        // and get themselves a teacher account at any school.
        if (!api_is(api_roles_coordinator())) {
            $this->send_json(403, ['success' => false, 'message' => 'Only a coordinator can issue teacher access codes.']);
        }

        $school = api_school();
        if ($school === '') {
            $this->send_json(400, ['success' => false, 'message' => 'Your account has no school on file.']);
        }

        $email = isset($data['email']) ? trim((string)$data['email']) : '';

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->send_json(400, ['success' => false, 'message' => 'Enter a valid email address.']);
        }

        $issuedBy = api_user_id();
        $result = issue_teacher_access_code($conn, $email, $school, $issuedBy);

        $this->send_json($result['success'] ? 200 : 429, $result);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }
}
