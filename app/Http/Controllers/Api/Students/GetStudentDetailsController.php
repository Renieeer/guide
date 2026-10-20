<?php

namespace App\Http\Controllers\Api\Students;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Exception;
use mysqli;

class GetStudentDetailsController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            $studentColumns = $this->getColumns($conn, 'student_table');
            $studentIdColumn = isset($studentColumns['StudentId']) ? 'StudentId' : (isset($studentColumns['id']) ? 'id' : null);

            if (!$studentIdColumn) {
                throw new Exception('student_table is missing both StudentId and id columns');
            }

            // Get student_id from query parameters
            $student_id = isset($_GET['student_id']) ? trim($_GET['student_id']) : null;

            if (!$student_id) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'student_id is required']);
            }

            // Fetch student main information from student_table
            $query = "SELECT * FROM student_table WHERE `{$studentIdColumn}` = ?";
            $stmt = $conn->prepare($query);
            if (!$stmt) {
                throw new Exception("Prepare failed: " . $conn->error);
            }

            $stmt->bind_param("s", $student_id);
            if (!$stmt->execute()) {
                throw new Exception("Execute failed: " . $stmt->error);
            }

            $result = $stmt->get_result();
            $student = $result->fetch_assoc();
            $stmt->close();

            if (!$student) {
                http_response_code(404);
                json_out(['success' => false, 'message' => 'Student not found']);
            }

            // Defense-in-depth: a grade-scoped counselor/coordinator shouldn't be
            // able to pull a student outside their scope by guessing/iterating IDs,
            // even though the primary filtering happens at the list level.
            $gradeScope = grade_scope_to_list($_GET['grade_scope'] ?? '');
            if (!empty($gradeScope)) {
                ensureSchoolsTable($conn);
                $isElementary = student_account_school_is_elementary($conn, $student['AccountID'] ?? null);
                if (!grade_matches_scope($student['Grade'] ?? null, $gradeScope, $isElementary)) {
                    http_response_code(403);
                    json_out(['success' => false, 'message' => 'This student is outside your assigned grade scope']);
                }
            }

            if (isset($student['Grade']) && !isset($student['grade_id'])) {
                $student['grade_id'] = $student['Grade'];
            }

            if (isset($student['Sex']) && !isset($student['sex'])) {
                $student['sex'] = $student['Sex'];
            }

            // Fetch education records
            $education = [];
            $educationColumns = $this->getColumns($conn, 'educational_background');
            if (isset($educationColumns['StudentId'])) {
                $query = "SELECT * FROM educational_background WHERE StudentId = ?";
                $stmt = $conn->prepare($query);
                if ($stmt) {
                    $stmt->bind_param("s", $student_id);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        while ($row = $result->fetch_assoc()) {
                            $education[] = $row;
                        }
                    }
                    $stmt->close();
                }
            } elseif (isset($student['EducationalBackground_EducationalBgId']) && $student['EducationalBackground_EducationalBgId'] !== null && $student['EducationalBackground_EducationalBgId'] !== '') {
                $query = "SELECT * FROM educational_background WHERE EducationalBgId = ?";
                $stmt = $conn->prepare($query);
                if ($stmt) {
                    $eduId = $student['EducationalBackground_EducationalBgId'];
                    $stmt->bind_param("i", $eduId);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        while ($row = $result->fetch_assoc()) {
                            $education[] = $row;
                        }
                    }
                    $stmt->close();
                }
            }

            // Fetch organization records
            $organizations = [];
            if ($this->tableExists($conn, 'organization')) {
                $query = "SELECT * FROM organization WHERE StudentId = ?";
                $stmt = $conn->prepare($query);
                if ($stmt) {
                    $stmt->bind_param("s", $student_id);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        while ($row = $result->fetch_assoc()) {
                            $organizations[] = $row;
                        }
                    }
                    $stmt->close();
                }
            }

            // Fetch sibling records (if there's a siblings table, otherwise return empty)
            $siblings = [];
            if ($this->tableExists($conn, 'sibling')) {
                $query = "SELECT * FROM sibling WHERE StudentId = ?";
                $stmt = $conn->prepare($query);
                if ($stmt) {
                    $stmt->bind_param("s", $student_id);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        while ($row = $result->fetch_assoc()) {
                            $siblings[] = $row;
                        }
                    }
                    $stmt->close();
                }
            }

            // Fetch friend records (supports either friend or friends_table)
            $friends = [];
            $friendTable = $this->tableExists($conn, 'friend') ? 'friend' : ($this->tableExists($conn, 'friends_table') ? 'friends_table' : null);
            if ($friendTable) {
                $query = "SELECT * FROM `{$friendTable}` WHERE StudentId = ?";
                $stmt = $conn->prepare($query);
                if ($stmt) {
                    $stmt->bind_param("s", $student_id);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        while ($row = $result->fetch_assoc()) {
                            $friends[] = $row;
                        }
                    }
                    $stmt->close();
                }
            }

            // Fetch family status records
            $familyStatus = [];
            if ($this->tableExists($conn, 'family_status')) {
                $familyColumns = $this->getColumns($conn, 'family_status');
                $familyStudentColumn = isset($familyColumns['StudentId']) ? 'StudentId' : (isset($familyColumns['StudentID']) ? 'StudentID' : null);

                if ($familyStudentColumn) {
                    $query = "SELECT * FROM family_status WHERE `{$familyStudentColumn}` = ? LIMIT 1";
                    $stmt = $conn->prepare($query);
                    if ($stmt) {
                        $stmt->bind_param("s", $student_id);
                        if ($stmt->execute()) {
                            $result = $stmt->get_result();
                            $familyStatus = $result->fetch_assoc() ?: [];
                        }
                        $stmt->close();
                    }
                }
            }

            // Fetch parent records
            $father = [];
            $mother = [];
            if ($this->tableExists($conn, 'parent_table')) {
                $parentQuery = "SELECT * FROM parent_table WHERE ParentId IN (?, ?)";
                $stmt = $conn->prepare($parentQuery);
                if ($stmt) {
                    $fatherParentId = 'father_' . $student_id;
                    $motherParentId = 'mother_' . $student_id;
                    $stmt->bind_param("ss", $fatherParentId, $motherParentId);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        // Match each row by its own ParentId instead of assuming row
                        // order, so a missing father/mother record doesn't shift the
                        // other parent's data into the wrong slot.
                        while ($row = $result->fetch_assoc()) {
                            if ($row['ParentId'] === $fatherParentId) {
                                $father = $row;
                            } elseif ($row['ParentId'] === $motherParentId) {
                                $mother = $row;
                            }
                        }
                    }
                    $stmt->close();
                }
            }

            $parents = array_values(array_filter([$father, $mother]));

            // Fetch guardian records
            $guardians = [];
            if ($this->tableExists($conn, 'guardian')) {
                $query = "SELECT * FROM guardian WHERE StudentId = ? ORDER BY GuardianID ASC";
                $stmt = $conn->prepare($query);
                if ($stmt) {
                    $stmt->bind_param("s", $student_id);
                    if ($stmt->execute()) {
                        $result = $stmt->get_result();
                        while ($row = $result->fetch_assoc()) {
                            $guardians[] = $row;
                        }
                    }
                    $stmt->close();
                }
            }

            $guardian = $guardians[0] ?? [];

            // Return success response with all data
            json_out([
                'success' => true,
                'student' => $student,
                'education' => $education,
                'organizations' => $organizations,
                'siblings' => $siblings,
                'friends' => $friends,
                'family_status' => $familyStatus,
                'parents' => $parents,
                'guardians' => $guardians,
                'father_name' => trim(($father['FirstName'] ?? '') . ' ' . ($father['MiddleName'] ?? '') . ' ' . ($father['LastName'] ?? '')),
                'mother_name' => trim(($mother['FirstName'] ?? '') . ' ' . ($mother['MiddleName'] ?? '') . ' ' . ($mother['LastName'] ?? '')),
                'guardian_name' => trim(($guardian['FirstName'] ?? '') . ' ' . ($guardian['MiddleName'] ?? '') . ' ' . ($guardian['LastName'] ?? '')),
                'father_FirstName' => $father['FirstName'] ?? '',
                'father_MiddleName' => $father['MiddleName'] ?? '',
                'father_LastName' => $father['LastName'] ?? '',
                'father_NickName' => $father['NickName'] ?? '',
                'father_BirthDate' => $father['BirthDate'] ?? '',
                'father_PlaceOfBirth' => $father['PlaceOfBirth'] ?? '',
                'father_Occupation' => $father['Occupation'] ?? '',
                'father_ContactNumber' => $father['ContactNumber'] ?? '',
                'father_Address' => $father['Address'] ?? '',
                'father_HighestEducationalAttainment' => $father['HighestEducationAttained'] ?? '',
                'father_isDeceased' => $father['IsDeceased'] ?? '',
                'mother_FirstName' => $mother['FirstName'] ?? '',
                'mother_MiddleName' => $mother['MiddleName'] ?? '',
                'mother_LastName' => $mother['LastName'] ?? '',
                'mother_NickName' => $mother['NickName'] ?? '',
                'mother_BirthDate' => $mother['BirthDate'] ?? '',
                'mother_PlaceOfBirth' => $mother['PlaceOfBirth'] ?? '',
                'mother_Occupation' => $mother['Occupation'] ?? '',
                'mother_ContactNumber' => $mother['ContactNumber'] ?? '',
                'mother_Address' => $mother['Address'] ?? '',
                'mother_HighestEducationalAttainment' => $mother['HighestEducationAttained'] ?? '',
                'mother_isDeceased' => $mother['IsDeceased'] ?? '',
                'guardian_FirstName' => $guardian['FirstName'] ?? '',
                'guardian_MiddleName' => $guardian['MiddleName'] ?? '',
                'guardian_LastName' => $guardian['LastName'] ?? '',
                'guardian_Relationship' => $guardian['Relationship'] ?? '',
                'guardian_Address' => $guardian['Address'] ?? '',
                'guardian_Landline' => $guardian['Landline'] ?? '',
                'guardian_MobileNumber' => $guardian['MobileNumber'] ?? ''
            ]);

        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Exception $e) {
            http_response_code(500);
            json_out([
                'success' => false,
                'message' => 'An error occurred: ' . $e->getMessage()
            ]);
        }
    }

    private function tableExists(mysqli $conn, string $tableName): bool {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($tableName) . "'");
        return $result && $result->num_rows > 0;
    }

    private function getColumns(mysqli $conn, string $tableName): array {
        $columns = [];
        $result = $conn->query("SHOW COLUMNS FROM `{$tableName}`");

        if (!$result) {
            return $columns;
        }

        while ($row = $result->fetch_assoc()) {
            $columns[$row['Field']] = true;
        }

        return $columns;
    }
}
