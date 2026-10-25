<?php

namespace App\Http\Controllers\Api\Referrals;

use App\Http\Controllers\Controller;
use mysqli;

class ReferralExternalReferralController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        $this->ensure_referral_external_referral_table($conn);

        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET') {
            $referralId = (int)($_GET['referral_id'] ?? 0);
            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            $stmt = $conn->prepare('
        SELECT id, referral_id, counselor_id, counselor_name, agency_name, agency_address,
               student_address, referring_school, school_address, cellphone_no, landline_no, contact_person,
               reason_for_referral, specific_services, referred_by_name, referred_by_designation,
               date_accomplished, created_at, updated_at
        FROM referral_external_referral
        WHERE referral_id = ?
        LIMIT 1
    ');
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param('i', $referralId);
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Execute failed: ' . $stmt->error]);
            }

            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$row) {
                $this->send_json(200, ['success' => true, 'data' => null]);
            }

            $row['id'] = (int)$row['id'];
            $row['referral_id'] = (int)$row['referral_id'];

            $this->send_json(200, ['success' => true, 'data' => $row]);
        }

        if ($method === 'POST') {
            $raw = file_get_contents('php://input');
            $body = json_decode($raw, true);

            if (!is_array($body)) {
                $this->send_json(400, ['success' => false, 'message' => 'Invalid JSON payload']);
            }

            $referralId = (int)($body['referral_id'] ?? 0);
            $counselorId = trim((string)($body['counselor_id'] ?? ''));
            $counselorName = trim((string)($body['counselor_name'] ?? ''));
            $agencyName = trim((string)($body['agency_name'] ?? ''));
            $agencyAddress = trim((string)($body['agency_address'] ?? ''));
            $studentAddress = trim((string)($body['student_address'] ?? ''));
            $referringSchool = trim((string)($body['referring_school'] ?? ''));
            $schoolAddress = trim((string)($body['school_address'] ?? ''));
            $cellphoneNo = trim((string)($body['cellphone_no'] ?? ''));
            $landlineNo = trim((string)($body['landline_no'] ?? ''));
            $contactPerson = trim((string)($body['contact_person'] ?? ''));
            $reasonForReferral = trim((string)($body['reason_for_referral'] ?? ''));
            $specificServices = trim((string)($body['specific_services'] ?? ''));
            $referredByName = trim((string)($body['referred_by_name'] ?? ''));
            $referredByDesignation = trim((string)($body['referred_by_designation'] ?? ''));
            $dateAccomplished = trim((string)($body['date_accomplished'] ?? ''));

            if ($referralId <= 0) {
                $this->send_json(400, ['success' => false, 'message' => 'referral_id is required']);
            }

            if ($agencyName === '' || $reasonForReferral === '' || $specificServices === '') {
                $this->send_json(400, ['success' => false, 'message' => 'Agency, Reason for Referral, and Specific Service/s Requested are required.']);
            }

            $stmt = $conn->prepare("
        INSERT INTO referral_external_referral (
            referral_id, counselor_id, counselor_name, agency_name, agency_address, student_address,
            referring_school, school_address, cellphone_no, landline_no, contact_person,
            reason_for_referral, specific_services, referred_by_name, referred_by_designation,
            date_accomplished
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''))
        ON DUPLICATE KEY UPDATE
            counselor_id = VALUES(counselor_id),
            counselor_name = VALUES(counselor_name),
            agency_name = VALUES(agency_name),
            agency_address = VALUES(agency_address),
            student_address = VALUES(student_address),
            referring_school = VALUES(referring_school),
            school_address = VALUES(school_address),
            cellphone_no = VALUES(cellphone_no),
            landline_no = VALUES(landline_no),
            contact_person = VALUES(contact_person),
            reason_for_referral = VALUES(reason_for_referral),
            specific_services = VALUES(specific_services),
            referred_by_name = VALUES(referred_by_name),
            referred_by_designation = VALUES(referred_by_designation),
            date_accomplished = VALUES(date_accomplished)
    ");
            if (!$stmt) {
                $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
            }
            $stmt->bind_param(
                'isssssssssssssss',
                $referralId,
                $counselorId,
                $counselorName,
                $agencyName,
                $agencyAddress,
                $studentAddress,
                $referringSchool,
                $schoolAddress,
                $cellphoneNo,
                $landlineNo,
                $contactPerson,
                $reasonForReferral,
                $specificServices,
                $referredByName,
                $referredByDesignation,
                $dateAccomplished
            );
            if (!$stmt->execute()) {
                $this->send_json(500, ['success' => false, 'message' => 'Failed to save external referral: ' . $stmt->error]);
            }
            $stmt->close();

            $this->send_json(200, ['success' => true, 'message' => 'External referral saved.']);
        }

        $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    // Stage 4 (Intervention) — the DepEd Appendix C "Referral for Service" form,
    // filled out when a case is escalated to an outside agency instead of (or
    // alongside) being handled entirely in-house. Same one-row-per-referral
    // pattern as referral_intervention.php: saving again updates the same row.
    // Its existence is also the gate checked client-side (see
    // loadExternalReferral() in counselor/referral-status.js and other-school/
    // referrals.js) before a referral can advance from Stage 4 to Stage 5
    // (Counseling) once "External Referral" is checked on the intervention
    // checklist.
    private function ensure_referral_external_referral_table(mysqli $conn): void {
        $conn->query("
        CREATE TABLE IF NOT EXISTS referral_external_referral (
            id INT NOT NULL AUTO_INCREMENT,
            referral_id INT NOT NULL,
            counselor_id VARCHAR(45) DEFAULT NULL,
            counselor_name VARCHAR(150) DEFAULT NULL,
            agency_name VARCHAR(255) DEFAULT NULL,
            agency_address VARCHAR(255) DEFAULT NULL,
            student_address VARCHAR(255) DEFAULT NULL,
            referring_school VARCHAR(255) DEFAULT NULL,
            school_address VARCHAR(255) DEFAULT NULL,
            cellphone_no VARCHAR(45) DEFAULT NULL,
            landline_no VARCHAR(45) DEFAULT NULL,
            contact_person VARCHAR(150) DEFAULT NULL,
            reason_for_referral TEXT,
            specific_services TEXT,
            referred_by_name VARCHAR(150) DEFAULT NULL,
            referred_by_designation VARCHAR(150) DEFAULT NULL,
            date_accomplished DATE DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_referral_id (referral_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

        // Defensive migration for installations where this table already existed
        // before student_address was added (needed for the printable Appendix C
        // form's student "Address" line — the referral record itself has no
        // student address field to read it from).
        $result = $conn->query("SHOW COLUMNS FROM referral_external_referral LIKE 'student_address'");
        if ($result && $result->num_rows === 0) {
            $conn->query("ALTER TABLE referral_external_referral ADD COLUMN student_address VARCHAR(255) DEFAULT NULL AFTER agency_address");
        }
    }
}
