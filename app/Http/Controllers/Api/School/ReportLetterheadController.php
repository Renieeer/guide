<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use mysqli;
use Throwable;

// CRUD for a per-school PDF report header/footer (Coordinator "Report
// Settings"). The coordinator uploads one PDF letterhead; the browser
// rasterizes it and crops a header region + a footer region client-side
// (see pages/coordinator/report-letterhead.js) — the original PDF bytes are
// never stored, but the full rasterized page IS kept (source_image) so the
// header/footer split can be re-adjusted later without re-uploading the PDF.
class ReportLetterheadController extends Controller
{
    private const MAX_FILE_BYTES = 5 * 1024 * 1024;

    private const ALLOWED_MIME_EXTENSIONS = [
        'image/png' => 'png',
    ];

    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $this->ensure_report_letterhead_table($conn);

            if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                $action = $_GET['action'] ?? 'get';

                if ($action !== 'get') {
                    $this->send_json(400, ['success' => false, 'message' => 'Unknown action']);
                }

                $schoolCode = trim((string)($_GET['school_code'] ?? ''));
                if ($schoolCode === '') {
                    $this->send_json(400, ['success' => false, 'message' => 'school_code is required']);
                }

                $stmt = $conn->prepare('SELECT header_image, header_mime, header_ratio, footer_image, footer_mime, footer_ratio, source_image, source_mime, header_pct, footer_pct, original_filename, updated_at FROM report_letterhead WHERE school_code = ?');
                $stmt->bind_param('s', $schoolCode);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();

                if (!$row) {
                    $this->send_json(200, ['success' => true, 'exists' => false]);
                }

                $this->send_json(200, [
                    'success' => true,
                    'exists' => true,
                    'header_image' => 'data:' . $row['header_mime'] . ';base64,' . base64_encode($row['header_image']),
                    'header_ratio' => (float)$row['header_ratio'],
                    'footer_image' => 'data:' . $row['footer_mime'] . ';base64,' . base64_encode($row['footer_image']),
                    'footer_ratio' => (float)$row['footer_ratio'],
                    // Null for a row saved before "Edit Crop" existed — the client
                    // falls back to requiring a fresh PDF upload in that case.
                    'source_image' => $row['source_image'] ? 'data:' . $row['source_mime'] . ';base64,' . base64_encode($row['source_image']) : null,
                    'header_pct' => $row['header_pct'] !== null ? (float)$row['header_pct'] : null,
                    'footer_pct' => $row['footer_pct'] !== null ? (float)$row['footer_pct'] : null,
                    'original_filename' => $row['original_filename'],
                    'updated_at' => $row['updated_at'],
                ]);
            }

            if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                // action=delete sends JSON; action=save sends multipart (it carries
                // two files), so the action has to be read from whichever the
                // request actually is rather than one shared $_POST/$input source.
                $isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;
                $action = $isMultipart ? ($_POST['action'] ?? 'save') : (json_decode(file_get_contents('php://input'), true)['action'] ?? '');

                if ($action === 'save') {
                    $schoolCode = trim((string)($_POST['school_code'] ?? ''));
                    $headerRatio = (float)($_POST['header_ratio'] ?? 0);
                    $footerRatio = (float)($_POST['footer_ratio'] ?? 0);
                    $headerPct = (float)($_POST['header_pct'] ?? 0);
                    $footerPct = (float)($_POST['footer_pct'] ?? 0);
                    $originalFilename = trim((string)($_POST['original_filename'] ?? ''));
                    $updatedById = ctype_digit((string)($_POST['updated_by_id'] ?? '')) ? (int)$_POST['updated_by_id'] : null;

                    if ($schoolCode === '') {
                        $this->send_json(400, ['success' => false, 'message' => 'school_code is required']);
                    }
                    if ($headerRatio <= 0 || $footerRatio <= 0) {
                        $this->send_json(400, ['success' => false, 'message' => 'header_ratio and footer_ratio must be positive']);
                    }
                    // source_image is optional — omitted only by installations that
                    // saved before "Edit Crop" existed and have never re-saved since.
                    if (!isset($_FILES['header_image'], $_FILES['footer_image'])) {
                        $this->send_json(400, ['success' => false, 'message' => 'header_image and footer_image are both required']);
                    }

                    $headerMime = $this->read_validated_png($_FILES['header_image']);
                    $footerMime = $this->read_validated_png($_FILES['footer_image']);
                    $headerData = file_get_contents($_FILES['header_image']['tmp_name']);
                    $footerData = file_get_contents($_FILES['footer_image']['tmp_name']);

                    $sourceMime = null;
                    $sourceData = null;
                    if (isset($_FILES['source_image']) && $_FILES['source_image']['error'] === UPLOAD_ERR_OK) {
                        $sourceMime = $this->read_validated_png($_FILES['source_image']);
                        $sourceData = file_get_contents($_FILES['source_image']['tmp_name']);
                    }

                    $stmt = $conn->prepare('
                INSERT INTO report_letterhead (school_code, header_image, header_mime, header_ratio, footer_image, footer_mime, footer_ratio, source_image, source_mime, header_pct, footer_pct, original_filename, updated_by_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    header_image = VALUES(header_image), header_mime = VALUES(header_mime), header_ratio = VALUES(header_ratio),
                    footer_image = VALUES(footer_image), footer_mime = VALUES(footer_mime), footer_ratio = VALUES(footer_ratio),
                    source_image = VALUES(source_image), source_mime = VALUES(source_mime),
                    header_pct = VALUES(header_pct), footer_pct = VALUES(footer_pct),
                    original_filename = VALUES(original_filename), updated_by_id = VALUES(updated_by_id)
            ');
                    if (!$stmt) {
                        $this->send_json(500, ['success' => false, 'message' => 'Prepare failed: ' . $conn->error]);
                    }
                    $stmt->bind_param(
                        'sssdssdssddsi',
                        $schoolCode,
                        $headerData,
                        $headerMime,
                        $headerRatio,
                        $footerData,
                        $footerMime,
                        $footerRatio,
                        $sourceData,
                        $sourceMime,
                        $headerPct,
                        $footerPct,
                        $originalFilename,
                        $updatedById
                    );
                    if (!$stmt->execute()) {
                        $this->send_json(500, ['success' => false, 'message' => 'Failed to save letterhead: ' . $stmt->error]);
                    }
                    $stmt->close();

                    $this->send_json(200, ['success' => true, 'message' => 'Report header/footer saved successfully']);
                }

                if ($action === 'delete') {
                    $input = json_decode(file_get_contents('php://input'), true);
                    $schoolCode = trim((string)(is_array($input) ? ($input['school_code'] ?? '') : ''));

                    if ($schoolCode === '') {
                        $this->send_json(400, ['success' => false, 'message' => 'school_code is required']);
                    }

                    $stmt = $conn->prepare('DELETE FROM report_letterhead WHERE school_code = ?');
                    $stmt->bind_param('s', $schoolCode);
                    if (!$stmt->execute()) {
                        $this->send_json(500, ['success' => false, 'message' => 'Failed to delete letterhead: ' . $stmt->error]);
                    }
                    $stmt->close();

                    $this->send_json(200, ['success' => true, 'message' => 'Report header/footer removed']);
                }

                $this->send_json(400, ['success' => false, 'message' => 'Unknown action']);
            }

            $this->send_json(405, ['success' => false, 'message' => 'Method not allowed']);
        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            $this->send_json(500, ['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
        }
    }

    private function send_json(int $statusCode, array $payload): void {
        http_response_code($statusCode);
        json_out($payload);
    }

    private function ensure_report_letterhead_table(mysqli $conn): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS report_letterhead (
            school_code VARCHAR(120) NOT NULL,
            header_image LONGBLOB NOT NULL,
            header_mime VARCHAR(100) NOT NULL,
            header_ratio DECIMAL(10,6) NOT NULL,
            footer_image LONGBLOB NOT NULL,
            footer_mime VARCHAR(100) NOT NULL,
            footer_ratio DECIMAL(10,6) NOT NULL,
            source_image LONGBLOB DEFAULT NULL,
            source_mime VARCHAR(100) DEFAULT NULL,
            header_pct DECIMAL(5,2) DEFAULT NULL,
            footer_pct DECIMAL(5,2) DEFAULT NULL,
            original_filename VARCHAR(255) DEFAULT NULL,
            updated_by_id INT DEFAULT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (school_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ";
        if (!$conn->query($sql)) {
            $this->send_json(500, ['success' => false, 'message' => 'Failed to initialize report_letterhead table: ' . $conn->error]);
        }

        // Defensive migration for the table as it existed before "Edit Crop"
        // (re-adjusting the split without re-uploading the PDF) was added.
        foreach ([
            'source_image' => 'LONGBLOB DEFAULT NULL',
            'source_mime' => 'VARCHAR(100) DEFAULT NULL',
            'header_pct' => 'DECIMAL(5,2) DEFAULT NULL',
            'footer_pct' => 'DECIMAL(5,2) DEFAULT NULL',
        ] as $column => $definition) {
            $result = $conn->query("SHOW COLUMNS FROM report_letterhead LIKE '$column'");
            if ($result && $result->num_rows === 0) {
                $conn->query("ALTER TABLE report_letterhead ADD COLUMN $column $definition");
            }
        }
    }

    // The client always exports canvas crops via toBlob('image/png'), so PNG is
    // the only real-world case — sniffed server-side the same way
    // upload-document.php does, not trusted from the client-supplied MIME type.
    private function read_validated_png(array $file): string {
        if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
            $this->send_json(400, ['success' => false, 'message' => 'A header/footer image is required']);
        }
        if ((int)$file['size'] > self::MAX_FILE_BYTES) {
            $this->send_json(400, ['success' => false, 'message' => 'Header/footer image exceeds the 5MB limit']);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!isset(self::ALLOWED_MIME_EXTENSIONS[$detectedMime])) {
            $this->send_json(400, ['success' => false, 'message' => 'Header/footer image must be a PNG']);
        }

        return $detectedMime;
    }
}
