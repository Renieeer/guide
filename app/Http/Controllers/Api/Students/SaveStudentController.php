<?php

namespace App\Http\Controllers\Api\Students;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use Exception;
use mysqli;
use mysqli_stmt;
use Throwable;

class SaveStudentController extends Controller
{
    public function __invoke()
    {
        $conn = legacy_db();

        try {
            if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                $studentId = isset($_GET['StudentId']) ? trim($_GET['StudentId']) : null;

                if (!$studentId) {
                    http_response_code(400);
                    json_out(['success' => false, 'message' => 'StudentId is required']);
                }

                $studentColumns = $this->getTableColumns($conn, 'student_table');
                $studentIdColumn = $this->pickColumn($studentColumns, ['StudentId', 'id']);

                if (!$studentIdColumn) {
                    throw new Exception('student_table schema is missing a StudentId column');
                }

                $query = "SELECT * FROM student_table WHERE `{$studentIdColumn}` = ?";
                $stmt = $conn->prepare($query);
                if (!$stmt) {
                    throw new Exception("Prepare failed: " . $conn->error);
                }

                $stmt->bind_param("s", $studentId);
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

                $familyStatus = [];
                if ($this->tableExists($conn, 'family_status')) {
                    $familyColumns = $this->getTableColumns($conn, 'family_status');
                    $familyStudentColumn = $this->pickColumn($familyColumns, ['StudentId', 'StudentID']);

                    if ($familyStudentColumn) {
                        $familyQuery = "SELECT * FROM family_status WHERE `{$familyStudentColumn}` = ? LIMIT 1";
                        $familyStmt = $conn->prepare($familyQuery);
                        if ($familyStmt) {
                            $familyStmt->bind_param("s", $studentId);
                            if ($familyStmt->execute()) {
                                $familyResult = $familyStmt->get_result();
                                if ($familyRow = $familyResult->fetch_assoc()) {
                                    $familyStatus = $familyRow;
                                }
                            }
                            $familyStmt->close();
                        }
                    }
                }

                json_out([
                    'success' => true,
                    'data' => $student,
                    'student' => $student,
                    'family_status' => $familyStatus
                ]);
            }
            $studentColumns = $this->getTableColumns($conn, 'student_table');
            $studentIdColumn = $this->pickColumn($studentColumns, ['StudentId', 'id']);
            $nicknameColumn = $this->pickColumn($studentColumns, ['NickName', 'Nickname']);
            $gradeColumn = $this->pickColumn($studentColumns, ['grade_id', 'Grade']);

            if (!$studentIdColumn || !$nicknameColumn || !$gradeColumn) {
                throw new Exception('student_table schema is missing required columns');
            }

            $educationColumns = $this->tableExists($conn, 'educational_background') ? $this->getTableColumns($conn, 'educational_background') : [];
            $educationHasStudentId = isset($educationColumns['StudentId']);
            $educationHasLinkColumn = isset($studentColumns['EducationalBackground_EducationalBgId']);

            $parentTableExists = $this->tableExists($conn, 'parent_table');
            $guardianTableExists = $this->tableExists($conn, 'guardian');

            $organizationColumns = $this->tableExists($conn, 'organization') ? $this->getTableColumns($conn, 'organization') : [];
            $organizationCampusColumn = $this->pickColumn($organizationColumns, ['IsCampus', 'inCampus']);

            $siblingColumns = $this->tableExists($conn, 'sibling') ? $this->getTableColumns($conn, 'sibling') : [];
            $siblingNickNameColumn = $this->pickColumn($siblingColumns, ['NickName', 'Nickname']);
            $siblingSchoolColumn = $this->pickColumn($siblingColumns, ['IsSchool', 'SchoolId']);

            $familyColumns = $this->tableExists($conn, 'family_status') ? $this->getTableColumns($conn, 'family_status') : [];
            $familyStudentColumn = $this->pickColumn($familyColumns, ['StudentId', 'StudentID']);
            $familyFieldColumns = [
                'LivingTogether' => $this->pickColumn($familyColumns, ['LivingTogether']),
                'MarriedYet' => $this->pickColumn($familyColumns, ['MarriedYet']),
                'MarriedChurch' => $this->pickColumn($familyColumns, ['MarriedChurch']),
                'TemporarilySepered' => $this->pickColumn($familyColumns, ['TemporarilySepered']),
                'PermanentlySepered' => $this->pickColumn($familyColumns, ['PermanentlySepered']),
                'FatherWithPartner' => $this->pickColumn($familyColumns, ['FatherWithPartner']),
                'MotherWithPartner' => $this->pickColumn($familyColumns, ['MotherWithPartner'])
            ];

            $friendTable = $this->tableExists($conn, 'friend') ? 'friend' : ($this->tableExists($conn, 'friends_table') ? 'friends_table' : null);
            $currentAddressColumn = $this->pickColumn($studentColumns, ['CurrentAddress']);
            $currentAddressDataColumn = $this->pickColumn($studentColumns, ['CurrentAddressData']);
            $currentAddressRegionCodeColumn = $this->pickColumn($studentColumns, ['CurrentAddressRegionCode']);
            $currentAddressRegionNameColumn = $this->pickColumn($studentColumns, ['CurrentAddressRegionName']);
            $currentAddressProvinceCodeColumn = $this->pickColumn($studentColumns, ['CurrentAddressProvinceCode']);
            $currentAddressProvinceNameColumn = $this->pickColumn($studentColumns, ['CurrentAddressProvinceName']);
            $currentAddressCityCodeColumn = $this->pickColumn($studentColumns, ['CurrentAddressCityCode']);
            $currentAddressCityNameColumn = $this->pickColumn($studentColumns, ['CurrentAddressCityName']);
            $currentAddressBarangayCodeColumn = $this->pickColumn($studentColumns, ['CurrentAddressBarangayCode']);
            $currentAddressBarangayNameColumn = $this->pickColumn($studentColumns, ['CurrentAddressBarangayName']);
            $permanentAddressColumn = $this->pickColumn($studentColumns, ['PermanentAddress']);
            $permanentAddressDataColumn = $this->pickColumn($studentColumns, ['PermanentAddressData']);
            $permanentAddressRegionCodeColumn = $this->pickColumn($studentColumns, ['PermanentAddressRegionCode']);
            $permanentAddressRegionNameColumn = $this->pickColumn($studentColumns, ['PermanentAddressRegionName']);
            $permanentAddressProvinceCodeColumn = $this->pickColumn($studentColumns, ['PermanentAddressProvinceCode']);
            $permanentAddressProvinceNameColumn = $this->pickColumn($studentColumns, ['PermanentAddressProvinceName']);
            $permanentAddressCityCodeColumn = $this->pickColumn($studentColumns, ['PermanentAddressCityCode']);
            $permanentAddressCityNameColumn = $this->pickColumn($studentColumns, ['PermanentAddressCityName']);
            $permanentAddressBarangayCodeColumn = $this->pickColumn($studentColumns, ['PermanentAddressBarangayCode']);
            $permanentAddressBarangayNameColumn = $this->pickColumn($studentColumns, ['PermanentAddressBarangayName']);
            $currentAddressMaxLength = $this->getColumnMaxLength($studentColumns, $currentAddressColumn);
            $permanentAddressMaxLength = $this->getColumnMaxLength($studentColumns, $permanentAddressColumn);

            // Get JSON input
            $input = file_get_contents('php://input');
            if (!$input) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'No data received']);
            }

            $data = json_decode($input, true);
            if (!$data) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'Invalid JSON format']);
            }

            // Log incoming data for debugging
            error_log('save-student.php POST received: StudentId=' . ($data['StudentId'] ?? 'NULL') . ', FirstName=' . ($data['FirstName'] ?? 'NULL'));

            // POST request - save/update student data
            $studentId = isset($data['StudentId']) ? trim($data['StudentId']) : null;

            if (!$studentId) {
                http_response_code(400);
                json_out(['success' => false, 'message' => 'StudentId is required']);
            }

            // Check if student exists
            $checkQuery = "SELECT `{$studentIdColumn}` FROM student_table WHERE `{$studentIdColumn}` = ?";
            $checkStmt = $conn->prepare($checkQuery);
            $checkStmt->bind_param("s", $studentId);
            $checkStmt->execute();
            $checkResult = $checkStmt->get_result();
            $studentExists = $checkResult->num_rows > 0;
            $checkStmt->close();

            $currentEducationId = null;
            if ($educationHasLinkColumn && $studentExists) {
                $lookupQuery = "SELECT EducationalBackground_EducationalBgId FROM student_table WHERE `{$studentIdColumn}` = ?";
                $lookupStmt = $conn->prepare($lookupQuery);
                if ($lookupStmt) {
                    $lookupStmt->bind_param("s", $studentId);
                    if ($lookupStmt->execute()) {
                        $lookupResult = $lookupStmt->get_result();
                        if ($lookupRow = $lookupResult->fetch_assoc()) {
                            $currentEducationId = $lookupRow['EducationalBackground_EducationalBgId'] ?? null;
                        }
                    }
                    $lookupStmt->close();
                }
            }

            // Prepare student data
            $studentData = [
                'LRN' => $data['LRN'] ?? '',
                'FirstName' => $data['FirstName'] ?? '',
                'LastName' => $data['LastName'] ?? '',
                'MiddleName' => $data['MiddleName'] ?? '',
                'NickName' => $data['NickName'] ?? '',
                'Sex' => $data['Sex'] ?? '',
                'Age' => isset($data['Age']) && $data['Age'] !== '' ? intval($data['Age']) : null,
                'DateOfBirth' => $data['DateOfBirth'] ?? '',
                'PlaceOfBirth' => $data['PlaceOfBirth'] ?? '',
                'ReligionFromBirth' => $data['ReligionFromBirth'] ?? '',
                'CurrentReligion' => $data['CurrentReligion'] ?? '',
                'CellphoneNumber' => $data['CellphoneNumber'] ?? '',
                'grade_id' => isset($data['grade_id']) && $data['grade_id'] !== null ? intval($data['grade_id']) : null,
            ];

            $currentAddressData = $this->prepareAddressData($data, 'CurrentAddress');
            $permanentAddressData = $this->prepareAddressData($data, 'PermanentAddress');

            $structuredAddressColumns = [
                'CurrentAddressRegionCode' => $currentAddressRegionCodeColumn,
                'CurrentAddressRegionName' => $currentAddressRegionNameColumn,
                'CurrentAddressProvinceCode' => $currentAddressProvinceCodeColumn,
                'CurrentAddressProvinceName' => $currentAddressProvinceNameColumn,
                'CurrentAddressCityCode' => $currentAddressCityCodeColumn,
                'CurrentAddressCityName' => $currentAddressCityNameColumn,
                'CurrentAddressBarangayCode' => $currentAddressBarangayCodeColumn,
                'CurrentAddressBarangayName' => $currentAddressBarangayNameColumn,
                'PermanentAddressRegionCode' => $permanentAddressRegionCodeColumn,
                'PermanentAddressRegionName' => $permanentAddressRegionNameColumn,
                'PermanentAddressProvinceCode' => $permanentAddressProvinceCodeColumn,
                'PermanentAddressProvinceName' => $permanentAddressProvinceNameColumn,
                'PermanentAddressCityCode' => $permanentAddressCityCodeColumn,
                'PermanentAddressCityName' => $permanentAddressCityNameColumn,
                'PermanentAddressBarangayCode' => $permanentAddressBarangayCodeColumn,
                'PermanentAddressBarangayName' => $permanentAddressBarangayNameColumn,
            ];

            $studentData['CurrentAddress'] = $this->truncateToColumnLength($currentAddressData['summary'] ?? '', $currentAddressMaxLength);
            $studentData['CurrentAddressData'] = json_encode($currentAddressData, JSON_UNESCAPED_UNICODE);
            $studentData['PermanentAddress'] = $this->truncateToColumnLength($permanentAddressData['summary'] ?? '', $permanentAddressMaxLength);
            $studentData['PermanentAddressData'] = json_encode($permanentAddressData, JSON_UNESCAPED_UNICODE);

            foreach ($structuredAddressColumns as $fieldName => $columnName) {
                if (!$columnName) {
                    continue;
                }

                if (str_starts_with($fieldName, 'CurrentAddress')) {
                    $studentData[$fieldName] = $currentAddressData[
                        match ($fieldName) {
                            'CurrentAddressRegionCode' => 'regionCode',
                            'CurrentAddressRegionName' => 'regionName',
                            'CurrentAddressProvinceCode' => 'provinceCode',
                            'CurrentAddressProvinceName' => 'provinceName',
                            'CurrentAddressCityCode' => 'cityCode',
                            'CurrentAddressCityName' => 'cityName',
                            'CurrentAddressBarangayCode' => 'barangayCode',
                            'CurrentAddressBarangayName' => 'barangayName',
                        }
                    ] ?? '';
                    continue;
                }

                $studentData[$fieldName] = $permanentAddressData[
                    match ($fieldName) {
                        'PermanentAddressRegionCode' => 'regionCode',
                        'PermanentAddressRegionName' => 'regionName',
                        'PermanentAddressProvinceCode' => 'provinceCode',
                        'PermanentAddressProvinceName' => 'provinceName',
                        'PermanentAddressCityCode' => 'cityCode',
                        'PermanentAddressCityName' => 'cityName',
                        'PermanentAddressBarangayCode' => 'barangayCode',
                        'PermanentAddressBarangayName' => 'barangayName',
                    }
                ] ?? '';
            }

            $addressFieldBindings = [
                ['column' => $currentAddressRegionCodeColumn, 'field' => 'CurrentAddressRegionCode'],
                ['column' => $currentAddressRegionNameColumn, 'field' => 'CurrentAddressRegionName'],
                ['column' => $currentAddressProvinceCodeColumn, 'field' => 'CurrentAddressProvinceCode'],
                ['column' => $currentAddressProvinceNameColumn, 'field' => 'CurrentAddressProvinceName'],
                ['column' => $currentAddressCityCodeColumn, 'field' => 'CurrentAddressCityCode'],
                ['column' => $currentAddressCityNameColumn, 'field' => 'CurrentAddressCityName'],
                ['column' => $currentAddressBarangayCodeColumn, 'field' => 'CurrentAddressBarangayCode'],
                ['column' => $currentAddressBarangayNameColumn, 'field' => 'CurrentAddressBarangayName'],
                ['column' => $permanentAddressRegionCodeColumn, 'field' => 'PermanentAddressRegionCode'],
                ['column' => $permanentAddressRegionNameColumn, 'field' => 'PermanentAddressRegionName'],
                ['column' => $permanentAddressProvinceCodeColumn, 'field' => 'PermanentAddressProvinceCode'],
                ['column' => $permanentAddressProvinceNameColumn, 'field' => 'PermanentAddressProvinceName'],
                ['column' => $permanentAddressCityCodeColumn, 'field' => 'PermanentAddressCityCode'],
                ['column' => $permanentAddressCityNameColumn, 'field' => 'PermanentAddressCityName'],
                ['column' => $permanentAddressBarangayCodeColumn, 'field' => 'PermanentAddressBarangayCode'],
                ['column' => $permanentAddressBarangayNameColumn, 'field' => 'PermanentAddressBarangayName'],
            ];

            if ($studentExists) {
                // Update existing student
                $updateAssignments = [
                    'LRN = ?',
                    'FirstName = ?',
                    'LastName = ?',
                    'MiddleName = ?',
                    "`{$nicknameColumn}` = ?",
                    'Sex = ?',
                    'Age = ?',
                    'DateOfBirth = ?',
                    'PlaceOfBirth = ?',
                    'ReligionFromBirth = ?',
                    'CurrentReligion = ?',
                ];

                $updateValues = [
                    $studentData['LRN'],
                    $studentData['FirstName'],
                    $studentData['LastName'],
                    $studentData['MiddleName'],
                    $studentData['NickName'],
                    $studentData['Sex'],
                    $studentData['Age'],
                    $studentData['DateOfBirth'],
                    $studentData['PlaceOfBirth'],
                    $studentData['ReligionFromBirth'],
                    $studentData['CurrentReligion'],
                ];

                if ($currentAddressColumn) {
                    $updateAssignments[] = "`{$currentAddressColumn}` = ?";
                    $updateValues[] = $studentData['CurrentAddress'];
                }

                if ($currentAddressDataColumn) {
                    $updateAssignments[] = "`{$currentAddressDataColumn}` = ?";
                    $updateValues[] = $studentData['CurrentAddressData'];
                }

                foreach ($addressFieldBindings as $binding) {
                    if ($binding['column']) {
                        $updateAssignments[] = "`{$binding['column']}` = ?";
                        $updateValues[] = $studentData[$binding['field']] ?? '';
                    }
                }

                if ($permanentAddressColumn) {
                    $updateAssignments[] = "`{$permanentAddressColumn}` = ?";
                    $updateValues[] = $studentData['PermanentAddress'];
                }

                if ($permanentAddressDataColumn) {
                    $updateAssignments[] = "`{$permanentAddressDataColumn}` = ?";
                    $updateValues[] = $studentData['PermanentAddressData'];
                }

                $updateAssignments[] = 'CellphoneNumber = ?';
                $updateAssignments[] = "`{$gradeColumn}` = ?";
                $updateValues[] = $studentData['CellphoneNumber'];
                $updateValues[] = $studentData['grade_id'];
                $updateValues[] = $studentId;

                $updateQuery = 'UPDATE student_table SET ' . implode(', ', $updateAssignments) . ' WHERE `' . $studentIdColumn . '` = ?';

                $stmt = $conn->prepare($updateQuery);
                if (!$stmt) {
                    throw new Exception("Prepare failed: " . $conn->error);
                }

                $this->bindDynamicParams($stmt, str_repeat('s', count($updateValues)), $updateValues);

                if (!$stmt->execute()) {
                    throw new Exception("Execute failed: " . $stmt->error);
                }
                $stmt->close();
            } else {
                // Insert new student
                $insertColumns = [
                    "`{$studentIdColumn}`",
                    'LRN',
                    'FirstName',
                    'LastName',
                    'MiddleName',
                    "`{$nicknameColumn}`",
                    'Sex',
                    'Age',
                    'DateOfBirth',
                    'PlaceOfBirth',
                    'ReligionFromBirth',
                    'CurrentReligion'
                ];

                $insertValues = [
                    $studentId,
                    $studentData['LRN'],
                    $studentData['FirstName'],
                    $studentData['LastName'],
                    $studentData['MiddleName'],
                    $studentData['NickName'],
                    $studentData['Sex'],
                    $studentData['Age'],
                    $studentData['DateOfBirth'],
                    $studentData['PlaceOfBirth'],
                    $studentData['ReligionFromBirth'],
                    $studentData['CurrentReligion']
                ];

                // The only caller (student-information.js) always resolves
                // StudentId from the logged-in student's own account id, so the
                // two are the same value — link AccountID here or this student
                // becomes invisible to their own school's staff (see get-students.php,
                // which excludes unlinked students rather than leaking them to
                // every school).
                $accountIdColumn = $this->pickColumn($studentColumns, ['AccountID']);
                if ($accountIdColumn) {
                    $insertColumns[] = "`{$accountIdColumn}`";
                    $insertValues[] = $studentId;
                }

                if ($currentAddressColumn) {
                    $insertColumns[] = "`{$currentAddressColumn}`";
                    $insertValues[] = $studentData['CurrentAddress'];
                }

                if ($currentAddressDataColumn) {
                    $insertColumns[] = "`{$currentAddressDataColumn}`";
                    $insertValues[] = $studentData['CurrentAddressData'];
                }

                foreach ($addressFieldBindings as $binding) {
                    if ($binding['column']) {
                        $insertColumns[] = "`{$binding['column']}`";
                        $insertValues[] = $studentData[$binding['field']] ?? '';
                    }
                }

                if ($permanentAddressColumn) {
                    $insertColumns[] = "`{$permanentAddressColumn}`";
                    $insertValues[] = $studentData['PermanentAddress'];
                }

                if ($permanentAddressDataColumn) {
                    $insertColumns[] = "`{$permanentAddressDataColumn}`";
                    $insertValues[] = $studentData['PermanentAddressData'];
                }

                $insertColumns[] = 'CellphoneNumber';
                $insertColumns[] = "`{$gradeColumn}`";
                $insertValues[] = $studentData['CellphoneNumber'];
                $insertValues[] = $studentData['grade_id'];

                $insertQuery = 'INSERT INTO student_table (' . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', array_fill(0, count($insertColumns), '?')) . ')';

                $stmt = $conn->prepare($insertQuery);
                if (!$stmt) {
                    throw new Exception("Prepare failed: " . $conn->error);
                }

                $this->bindDynamicParams($stmt, str_repeat('s', count($insertValues)), $insertValues);

                if (!$stmt->execute()) {
                    throw new Exception("Execute failed: " . $stmt->error);
                }
                $stmt->close();
            }

            // Save family status records
            if ($familyStudentColumn) {
                $familyValues = [];
                $familyColumnsToSave = [];

                foreach ($familyFieldColumns as $fieldName => $columnName) {
                    if ($columnName) {
                        $familyColumnsToSave[] = "`{$columnName}`";
                        $familyValues[] = $data[$fieldName] ?? '';
                    }
                }

                if (!empty($familyColumnsToSave)) {
                    $deleteQuery = "DELETE FROM family_status WHERE `{$familyStudentColumn}` = ?";
                    $deleteStmt = $conn->prepare($deleteQuery);
                    if ($deleteStmt) {
                        $deleteStmt->bind_param("s", $studentId);
                        $deleteStmt->execute();
                        $deleteStmt->close();
                    }

                    $nextFamilyStatusId = 1;
                    $idResult = $conn->query("SELECT COALESCE(MAX(`FamilyStatusId`), 0) + 1 AS next_id FROM family_status");
                    if ($idResult) {
                        $idRow = $idResult->fetch_assoc();
                        if ($idRow && isset($idRow['next_id'])) {
                            $nextFamilyStatusId = (int) $idRow['next_id'];
                        }
                    }

                    $insertColumns = array_merge(["`FamilyStatusId`", "`{$familyStudentColumn}`"], $familyColumnsToSave);
                    $placeholders = implode(', ', array_fill(0, count($insertColumns), '?'));
                    $insertQuery = "INSERT INTO family_status (" . implode(', ', $insertColumns) . ") VALUES ({$placeholders})";
                    $insertStmt = $conn->prepare($insertQuery);
                    if (!$insertStmt) {
                        throw new Exception("Prepare failed: " . $conn->error);
                    }

                    $familyParams = array_merge([$nextFamilyStatusId, $studentId], $familyValues);
                    $familyTypes = str_repeat('s', count($familyParams));
                    $familyTypes[0] = 'i';
                    $this->bindDynamicParams($insertStmt, $familyTypes, $familyParams);

                    if (!$insertStmt->execute()) {
                        throw new Exception("Execute failed: " . $insertStmt->error);
                    }
                    $insertStmt->close();
                }
            }

            // Save education records
            if (isset($data['education']) && is_array($data['education'])) {
                $educationEntry = null;
                foreach ($data['education'] as $edu) {
                    $gradeLevel = $edu['GradeLevel'] ?? '';
                    $schoolAttended = $edu['SchoolAttended'] ?? '';
                    $inclusiveYes = $edu['InclusiveYes'] ?? '';
                    $placeAndSchool = $edu['PlaceAndSchool'] ?? '';

                    if ($gradeLevel !== '' || $schoolAttended !== '' || $inclusiveYes !== '' || $placeAndSchool !== '') {
                        $educationEntry = $edu;
                        break;
                    }
                }

                if ($educationEntry) {
                    if ($currentEducationId) {
                        $deleteQuery = "DELETE FROM educational_background WHERE EducationalBgId = ?";
                        $stmt = $conn->prepare($deleteQuery);
                        if ($stmt) {
                            $stmt->bind_param("i", $currentEducationId);
                            $stmt->execute();
                            $stmt->close();
                        }
                    }

                    $gradeLevel = $educationEntry['GradeLevel'] ?? '';
                    $schoolAttended = $educationEntry['SchoolAttended'] ?? '';
                    $inclusiveYear = $educationEntry['InclusiveYes'] ?? '';
                    $planAfterSchool = $educationEntry['PlaceAndSchool'] ?? '';

                    $insertEduQuery = "INSERT INTO educational_background (GradeLevel, SchoolAttended, InclusiveYear, PlanAfterSchool)
                VALUES (?, ?, ?, ?)";
                    $stmt = $conn->prepare($insertEduQuery);
                    if (!$stmt) {
                        throw new Exception("Prepare failed: " . $conn->error);
                    }

                    $stmt->bind_param("ssss", $gradeLevel, $schoolAttended, $inclusiveYear, $planAfterSchool);
                    if (!$stmt->execute()) {
                        throw new Exception("Execute failed: " . $stmt->error);
                    }

                    $newEducationId = $stmt->insert_id;
                    $stmt->close();

                    if ($educationHasLinkColumn && $newEducationId) {
                        $linkQuery = "UPDATE student_table SET EducationalBackground_EducationalBgId = ? WHERE `{$studentIdColumn}` = ?";
                        $linkStmt = $conn->prepare($linkQuery);
                        if (!$linkStmt) {
                            throw new Exception("Prepare failed: " . $conn->error);
                        }

                        $linkStmt->bind_param("is", $newEducationId, $studentId);
                        if (!$linkStmt->execute()) {
                            throw new Exception("Execute failed: " . $linkStmt->error);
                        }
                        $linkStmt->close();
                    }
                }
            }

            // Save organization records
            if ($organizationCampusColumn && isset($data['organization']) && is_array($data['organization'])) {
                // Delete existing organization records
                $deleteQuery = "DELETE FROM organization WHERE StudentId = ?";
                $stmt = $conn->prepare($deleteQuery);
                $stmt->bind_param("s", $studentId);
                $stmt->execute();
                $stmt->close();

                // Insert new organization records
                $insertOrgQuery = "INSERT INTO organization (OrganizationId, StudentId, OrganizationName, PositionTitle, `{$organizationCampusColumn}`)
            VALUES (?, ?, ?, ?, ?)";
                $stmt = $conn->prepare($insertOrgQuery);

                foreach ($data['organization'] as $org) {
                    $organizationId = uniqid('org_', true);
                    $orgName = $org['OrganizationName'] ?? '';
                    $positionTitle = $org['PositionTitle'] ?? '';
                    $inCampus = $org['inCampus'] ?? '';

                    $stmt->bind_param("sssss", $organizationId, $studentId, $orgName, $positionTitle, $inCampus);
                    $stmt->execute();
                }
                $stmt->close();
            }

            // Save sibling records
            if ($siblingNickNameColumn && $siblingSchoolColumn && isset($data['sibling']) && is_array($data['sibling'])) {
                // Delete existing sibling records
                $deleteQuery = "DELETE FROM sibling WHERE StudentId = ?";
                $stmt = $conn->prepare($deleteQuery);
                $stmt->bind_param("s", $studentId);
                $stmt->execute();
                $stmt->close();

                // Insert new sibling records
                $insertSibQuery = "INSERT INTO sibling (StudentId, FirstName, LastName, MiddleName, `{$siblingNickNameColumn}`, Age, `{$siblingSchoolColumn}`, BirthOrder, Work)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $conn->prepare($insertSibQuery);

                foreach ($data['sibling'] as $sib) {
                    $firstName = $sib['FirstName'] ?? '';
                    $lastName = $sib['LastName'] ?? '';
                    $middleName = $sib['MiddleName'] ?? '';
                    $nickName = $sib['NickName'] ?? '';
                    $age = isset($sib['Age']) && $sib['Age'] !== '' ? intval($sib['Age']) : null;
                    $birthOrder = $sib['BirthOrder'] ?? '';
                    $schoolId = $sib['SchoolId'] ?? '';
                    $work = $sib['Work'] ?? '';

                    $stmt->bind_param("sssssisss", $studentId, $firstName, $lastName, $middleName, $nickName, $age, $schoolId, $birthOrder, $work);
                    $stmt->execute();
                }
                $stmt->close();
            }

            // Save friend records
            if ($friendTable && isset($data['friend']) && is_array($data['friend'])) {
                // Delete existing friend records
                $deleteQuery = "DELETE FROM `{$friendTable}` WHERE StudentId = ?";
                $stmt = $conn->prepare($deleteQuery);
                $stmt->bind_param("s", $studentId);
                $stmt->execute();
                $stmt->close();

                // Insert new friend records
                $insertFriendQuery = "INSERT INTO `{$friendTable}` (StudentId, In_school, FirstName, MiddleName, LastName)
            VALUES (?, ?, ?, ?, ?)";
                $stmt = $conn->prepare($insertFriendQuery);

                foreach ($data['friend'] as $friend) {
                    $inSchool = $friend['In_school'] ?? '';
                    $firstName = $friend['FirstName'] ?? '';
                    $middleName = $friend['MiddleName'] ?? '';
                    $lastName = $friend['LastName'] ?? '';

                    $stmt->bind_param("sssss", $studentId, $inSchool, $firstName, $middleName, $lastName);
                    $stmt->execute();
                }
                $stmt->close();
            }

            // Save parent records
            if ($parentTableExists) {
                $parentFields = [
                    'father' => [
                        'ParentId' => 'father_' . $studentId,
                        'FirstName' => $data['father_FirstName'] ?? '',
                        'MiddleName' => $data['father_MiddleName'] ?? '',
                        'LastName' => $data['father_LastName'] ?? '',
                        'NickName' => $data['father_NickName'] ?? '',
                        'BirthDate' => $data['father_BirthDate'] ?? '',
                        'PlaceOfBirth' => $data['father_PlaceOfBirth'] ?? '',
                        'Address' => $data['father_Address'] ?? '',
                        'ContactNumber' => $data['father_ContactNumber'] ?? '',
                        'HighestEducationAttained' => $data['father_HighestEducationalAttainment'] ?? '',
                        'Occupation' => $data['father_Occupation'] ?? '',
                        'IsDeceased' => $data['father_isDeceased'] ?? '',
                        'MonthlyIncome' => ''
                    ],
                    'mother' => [
                        'ParentId' => 'mother_' . $studentId,
                        'FirstName' => $data['mother_FirstName'] ?? '',
                        'MiddleName' => $data['mother_MiddleName'] ?? '',
                        'LastName' => $data['mother_LastName'] ?? '',
                        'NickName' => $data['mother_NickName'] ?? '',
                        'BirthDate' => $data['mother_BirthDate'] ?? '',
                        'PlaceOfBirth' => $data['mother_PlaceOfBirth'] ?? '',
                        'Address' => $data['mother_Address'] ?? '',
                        'ContactNumber' => $data['mother_ContactNumber'] ?? '',
                        'HighestEducationAttained' => $data['mother_HighestEducationalAttainment'] ?? '',
                        'Occupation' => $data['mother_Occupation'] ?? '',
                        'IsDeceased' => $data['mother_isDeceased'] ?? '',
                        'MonthlyIncome' => ''
                    ]
                ];
                foreach ($parentFields as $role => $parentData) {
                    $deleteParentStmt = $conn->prepare("DELETE FROM parent_table WHERE ParentId = ?");
                    if ($deleteParentStmt) {
                        $deleteParentStmt->bind_param("s", $parentData['ParentId']);
                        $deleteParentStmt->execute();
                        $deleteParentStmt->close();
                    }

                    $parentValues = [
                        $parentData['FirstName'],
                        $parentData['LastName'],
                        $parentData['MiddleName'],
                        $parentData['NickName'],
                        $parentData['BirthDate'],
                        $parentData['PlaceOfBirth'],
                        $parentData['Address'],
                        $parentData['ContactNumber'],
                        $parentData['HighestEducationAttained'],
                        $parentData['Occupation'],
                        $parentData['IsDeceased'],
                        $parentData['MonthlyIncome']
                    ];

                    if ($this->hasAnyValue($parentValues)) {
                        $insertParentQuery = "INSERT INTO parent_table (ParentId, StudentId, FirstName, LastName, MiddleName, NickName, BirthDate, PlaceOfBirth, Address, ContactNumber, HighestEducationAttained, Occupation, IsDeceased, MonthlyIncome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                        $parentStmt = $conn->prepare($insertParentQuery);
                        if (!$parentStmt) {
                            throw new Exception("Prepare failed: " . $conn->error);
                        }

                        $parentStmt->bind_param(
                            "ssssssssssssss",
                            $parentData['ParentId'],
                            $studentId,
                            $parentData['FirstName'],
                            $parentData['LastName'],
                            $parentData['MiddleName'],
                            $parentData['NickName'],
                            $parentData['BirthDate'],
                            $parentData['PlaceOfBirth'],
                            $parentData['Address'],
                            $parentData['ContactNumber'],
                            $parentData['HighestEducationAttained'],
                            $parentData['Occupation'],
                            $parentData['IsDeceased'],
                            $parentData['MonthlyIncome']
                        );

                        if (!$parentStmt->execute()) {
                            throw new Exception("Execute failed: " . $parentStmt->error);
                        }
                        $parentStmt->close();
                    }
                }
            }

            // Save guardian record
            if ($guardianTableExists) {
                $guardianFields = [
                    'FirstName' => $data['guardian_FirstName'] ?? '',
                    'MiddleName' => $data['guardian_MiddleName'] ?? '',
                    'LastName' => $data['guardian_LastName'] ?? '',
                    'Address' => $data['guardian_Address'] ?? '',
                    'Landline' => $data['guardian_Landline'] ?? '',
                    'MobileNumber' => $data['guardian_MobileNumber'] ?? '',
                    'Relationship' => $data['guardian_Relationship'] ?? ''
                ];

                $deleteGuardianStmt = $conn->prepare("DELETE FROM guardian WHERE StudentId = ?");
                if ($deleteGuardianStmt) {
                    $deleteGuardianStmt->bind_param("s", $studentId);
                    $deleteGuardianStmt->execute();
                    $deleteGuardianStmt->close();
                }

                if ($this->hasAnyValue($guardianFields)) {
                    $nextGuardianId = 1;
                    $idResult = $conn->query("SELECT COALESCE(MAX(`GuardianID`), 0) + 1 AS next_id FROM guardian");
                    if ($idResult) {
                        $idRow = $idResult->fetch_assoc();
                        if ($idRow && isset($idRow['next_id'])) {
                            $nextGuardianId = (int) $idRow['next_id'];
                        }
                    }

                    $insertGuardianQuery = "INSERT INTO guardian (GuardianID, StudentId, FirstName, MiddleName, LastName, Address, Landline, MobileNumber, Relationship) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
                    $guardianStmt = $conn->prepare($insertGuardianQuery);
                    if (!$guardianStmt) {
                        throw new Exception("Prepare failed: " . $conn->error);
                    }

                    $guardianStmt->bind_param(
                        "issssssss",
                        $nextGuardianId,
                        $studentId,
                        $guardianFields['FirstName'],
                        $guardianFields['MiddleName'],
                        $guardianFields['LastName'],
                        $guardianFields['Address'],
                        $guardianFields['Landline'],
                        $guardianFields['MobileNumber'],
                        $guardianFields['Relationship']
                    );

                    if (!$guardianStmt->execute()) {
                        throw new Exception("Execute failed: " . $guardianStmt->error);
                    }
                    $guardianStmt->close();
                }
            }

            json_out([
                'success' => true,
                'message' => 'Student information saved successfully',
                'StudentId' => $studentId
            ]);

        } catch (HttpResponseException $halt) {
            throw $halt;
        } catch (Throwable $e) {
            http_response_code(500);
            json_out([
                'success' => false,
                'message' => 'An error occurred: ' . $e->getMessage()
            ]);
        }
    }

    private function getTableColumns(mysqli $conn, string $tableName): array {
        $columns = [];
        $result = $conn->query("SHOW COLUMNS FROM `{$tableName}`");

        if (!$result) {
            throw new Exception("Unable to inspect {$tableName}: " . $conn->error);
        }

        while ($row = $result->fetch_assoc()) {
            $columns[$row['Field']] = $row;
        }

        return $columns;
    }

    private function pickColumn(array $columns, array $candidates): ?string {
        foreach ($candidates as $candidate) {
            if (isset($columns[$candidate])) {
                return $candidate;
            }
        }

        return null;
    }

    private function getColumnMaxLength(array $columns, ?string $columnName): ?int {
        if (!$columnName || !isset($columns[$columnName]['Type'])) {
            return null;
        }

        $type = strtolower((string) $columns[$columnName]['Type']);
        if (preg_match('/^(?:varchar|char)\((\d+)\)$/', $type, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }

    private function truncateToColumnLength(?string $value, ?int $maxLength): string {
        $text = (string) $value;

        if (!$maxLength || $maxLength < 1) {
            return $text;
        }

        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $maxLength);
        }

        return substr($text, 0, $maxLength);
    }

    private function bindDynamicParams(mysqli_stmt $stmt, string $types, array $params): void {
        $bindings = [$types];
        foreach ($params as $index => $value) {
            $bindings[] = &$params[$index];
        }

        call_user_func_array([$stmt, 'bind_param'], $bindings);
    }

    private function tableExists(mysqli $conn, string $tableName): bool {
        $result = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($tableName) . "'");
        return $result && $result->num_rows > 0;
    }

    private function hasAnyValue(array $values): bool {
        foreach ($values as $value) {
            if (trim((string) $value) !== '') {
                return true;
            }
        }

        return false;
    }

    private function buildFullName(array $row): string {
        $parts = [
            trim((string)($row['FirstName'] ?? '')),
            trim((string)($row['MiddleName'] ?? '')),
            trim((string)($row['LastName'] ?? '')),
        ];

        return trim(implode(' ', array_filter($parts, fn($part) => $part !== '')));
    }

    private function decodeAddressPayload($value): array {
        if (is_array($value)) {
            return $value;
        }

        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function buildAddressSummary(array $payload): string {
        $parts = [
            $payload['houseUnitNo'] ?? '',
            $payload['street'] ?? '',
            $payload['barangayName'] ?? '',
            $payload['cityName'] ?? '',
            $payload['provinceName'] ?? '',
            $payload['regionName'] ?? '',
            $payload['zipCode'] ?? '',
            $payload['country'] ?? ''
        ];

        $parts = array_values(array_filter(array_map(function ($part) {
            return trim((string) $part);
        }, $parts), function ($part) {
            return $part !== '';
        }));

        return implode(', ', $parts);
    }

    private function prepareAddressData(array $data, string $prefix): array {
        $payload = $this->decodeAddressPayload($data[$prefix . 'Data'] ?? null);

        if (empty($payload)) {
            $fallback = trim((string) ($data[$prefix] ?? ''));
            if ($fallback !== '') {
                $payload = [
                    'summary' => $fallback,
                    'country' => 'Philippines'
                ];
            }
        }

        $payload['country'] = $payload['country'] ?? 'Philippines';
        $payload['summary'] = $payload['summary'] ?? $this->buildAddressSummary($payload);

        return $payload;
    }
}
