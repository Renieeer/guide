<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Information - Step by Step</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="{{ asset('css/student-information.css') }}?v={{ filemtime(public_path('css/student-information.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>

<div class="main-wrapper">
    <!-- Sidebar -->
    @include('partials.sidebar-student')
    
    <!-- Main Content -->
    <div class="main-content">
        <!-- Page Hero -->
        <div class="page-hero">
            <div>
                <div class="page-hero-eyebrow"><i class="bi bi-file-person"></i> Information</div>
                <h2 class="page-hero-title">My Information</h2>
                <p class="page-hero-text">View and update your student information on file with the school guidance office.</p>
            </div>
        </div>

        <!-- Page Content -->
        <div class="page-content">
                <div class="wizard">
                
            <!-- STEP TRACK -->
            <div class="step-track">
                <div class="step-item active" data-step="1">
                    <div class="step-bubble">1</div>
                    <div class="step-label">Student</div>
                </div>
                <div class="step-item" data-step="2">
                    <div class="step-bubble">2</div>
                    <div class="step-label">Education</div>
                </div>
                <div class="step-item" data-step="3">
                    <div class="step-bubble">3</div>
                    <div class="step-label">Organizations</div>
                </div>
                <div class="step-item" data-step="4">
                    <div class="step-bubble">4</div>
                    <div class="step-label">Parents</div>
                </div>
                <div class="step-item" data-step="5">
                    <div class="step-bubble">5</div>
                    <div class="step-label">Family</div>
                </div>
                <div class="step-item" data-step="6">
                    <div class="step-bubble">6</div>
                    <div class="step-label">Siblings</div>
                </div>
            </div>

            <!-- FORM -->
            <form id="studentForm">
                <div class="form-body">

                    <!-- STEP 1: STUDENT INFORMATION -->
                    <div class="step-panel active" data-step="1">
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-user"></i></div>
                                <div class="section-title">Student Information</div>
                            </div>
                            <div class="field-grid">
                                <!-- Student ID (hidden - auto-filled from login) -->
                                <input type="hidden" name="StudentId">
                                <div class="field-group span-2">
                                    <label>LRN <span class="req">*</span></label>
                                    <input type="text" name="LRN" placeholder="12-digit LRN" required>
                                </div>

                                <div class="identity-row span-2">
                                    <div class="field-group">
                                        <label>First Name <span class="req">*</span></label>
                                        <input type="text" name="FirstName" placeholder="Given name" required>
                                    </div>
                                    <div class="field-group">
                                        <label>Last Name <span class="req">*</span></label>
                                        <input type="text" name="LastName" placeholder="Family name" required>
                                    </div>
                                    <div class="field-group">
                                        <label>Middle Name</label>
                                        <input type="text" name="MiddleName" placeholder="Optional">
                                    </div>
                                </div>

                                <div class="info-row span-2">
                                    <div class="field-group">
                                        <label>Sex <span class="req">*</span></label>
                                        <select name="Sex" required>
                                            <option value="">Select sex</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                      <div class="field-group">
                                        <label>Date of Birth <span class="req">*</span></label>
                                        <input type="date" name="DateOfBirth" required>
                                    </div>
                                    <div class="field-group">
                                        <label>Grade <span class="req">*</span></label>
                                        <select name="grade_id" id="gradeSelect" required>
                                            <option value="">Select grade</option>
                                            <option value="7">Grade 7</option>
                                            <option value="8">Grade 8</option>
                                            <option value="9">Grade 9</option>
                                            <option value="10">Grade 10</option>
                                        </select>
                                    </div>
                                  
                                     <div class="field-group">
                                        <label>Age</label>
                                        <input type="number" name="Age" placeholder="Auto-calculated" readonly aria-readonly="true">
                                    </div>
                                </div>
                                <div class="field-group">
                                    <label>Place of Birth</label>
                                    <input type="text" name="PlaceOfBirth" placeholder="City / Municipality">
                                </div>
                                <div class="field-group">
                                    <label>Religion from Birth</label>
                                    <input type="text" name="ReligionFromBirth" placeholder="e.g., Roman Catholic">
                                </div>
                                <div class="field-group">
                                    <label>Current Religion</label>
                                    <input type="text" name="CurrentReligion" placeholder="If different">
                                </div>
                                 <div class="field-group ">
                                    <label>Cellphone Number</label>
                                    <input type="text" name="CellphoneNumber" placeholder="+63 9XX XXX XXXX">
                                </div>
                                <div class="address-panel">
                                    <div class="section-header">
                                        <div class="section-title">Current Address</div>
                                        <button type="button" class="btn-add btn-add-inline" onclick="copyAddressFields('CurrentAddress', 'PermanentAddress')">
                                            <i class="fas fa-copy"></i> Copy to Permanent
                                        </button>
                                    </div>
                                    <div class="field-grid">
                                        <div class="field-group">
                                            <label>House / Unit No.</label>
                                            <input type="text" name="CurrentAddress_HouseUnitNo" placeholder="Blk 12 Lot 4, Unit 3">
                                        </div>
                                        <div class="field-group">
                                            <label>Street</label>
                                            <input type="text" name="CurrentAddress_Street" placeholder="Street name, village, subdivision">
                                        </div>
                                        <div class="field-group">
                                            <label>Region</label>
                                            <select name="CurrentAddress_RegionCode" data-address-role="region" data-address-prefix="CurrentAddress">
                                                <option value="">Select region</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>Province</label>
                                            <select name="CurrentAddress_ProvinceCode" data-address-role="province" data-address-prefix="CurrentAddress" disabled>
                                                <option value="">Select province</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>City / Municipality</label>
                                            <select name="CurrentAddress_CityCode" data-address-role="city" data-address-prefix="CurrentAddress" disabled>
                                                <option value="">Select city or municipality</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>Barangay</label>
                                            <select name="CurrentAddress_BarangayCode" data-address-role="barangay" data-address-prefix="CurrentAddress" disabled>
                                                <option value="">Select barangay</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>ZIP Code</label>
                                            <input type="text" name="CurrentAddress_ZipCode" placeholder="1234">
                                        </div>
                                        <div class="field-group">
                                            <label>Country</label>
                                            <input type="text" name="CurrentAddress_Country" placeholder="Philippines" value="Philippines">
                                        </div>
                                    </div>
                                </div>
                                <div class="address-panel">
                                    <div class="section-header">
                                        <div class="section-title">Permanent Address</div>
                                        <button type="button" class="btn-add btn-add-inline" onclick="copyAddressFields('CurrentAddress', 'PermanentAddress')">
                                            <i class="fas fa-clone"></i> Use Current Address
                                        </button>
                                    </div>
                                    <div class="field-grid">
                                        <div class="field-group">
                                            <label>House / Unit No.</label>
                                            <input type="text" name="PermanentAddress_HouseUnitNo" placeholder="Blk 12 Lot 4, Unit 3">
                                        </div>
                                        <div class="field-group">
                                            <label>Street</label>
                                            <input type="text" name="PermanentAddress_Street" placeholder="Street name, village, subdivision">
                                        </div>
                                        <div class="field-group">
                                            <label>Region</label>
                                            <select name="PermanentAddress_RegionCode" data-address-role="region" data-address-prefix="PermanentAddress">
                                                <option value="">Select region</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>Province</label>
                                            <select name="PermanentAddress_ProvinceCode" data-address-role="province" data-address-prefix="PermanentAddress" disabled>
                                                <option value="">Select province</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>City / Municipality</label>
                                            <select name="PermanentAddress_CityCode" data-address-role="city" data-address-prefix="PermanentAddress" disabled>
                                                <option value="">Select city or municipality</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>Barangay</label>
                                            <select name="PermanentAddress_BarangayCode" data-address-role="barangay" data-address-prefix="PermanentAddress" disabled>
                                                <option value="">Select barangay</option>
                                            </select>
                                        </div>
                                        <div class="field-group">
                                            <label>ZIP Code</label>
                                            <input type="text" name="PermanentAddress_ZipCode" placeholder="1234">
                                        </div>
                                        <div class="field-group">
                                            <label>Country</label>
                                            <input type="text" name="PermanentAddress_Country" placeholder="Philippines" value="Philippines">
                                        </div>
                                    </div>
                                </div>
                               
                            </div>
                        </div>
                    </div>

                    <!-- STEP 2: EDUCATION -->
                    <div class="step-panel" data-step="2">
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-graduation-cap"></i></div>
                                <div class="section-title">Educational Background</div>
                                <button type="button" class="btn-add btn-add-inline" onclick="addEducation()">
                                    <i class="fas fa-plus"></i> Add School Record
                                </button>
                            </div>
                            <div id="educationContainer"></div>
                        </div>
                    </div>

                    <!-- STEP 3: ORGANIZATIONS -->
                    <div class="step-panel" data-step="3">
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-building"></i></div>
                                <div class="section-title">Organization Background</div>
                                <button type="button" class="btn-add btn-add-inline" onclick="addOrganization()">
                                    <i class="fas fa-plus"></i> Add Organization
                                </button>
                            </div>
                            <div id="organizationContainer"></div>
                        </div>
                    </div>

                    <!-- STEP 4: PARENTS -->
                    <div class="step-panel" data-step="4">
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-users"></i></div>
                                <div class="section-title">Parents Background</div>
                            </div>
                            <div class="parents-grid">
                                <div class="parent-card">
                                    <div class="parent-card-header">
                                        <i class="fas fa-person"></i> Father's Information
                                    </div>
                                    <div class="parent-card-body">
                                        <div class="field-group">
                                            <label>First Name</label>
                                            <input type="text" name="father_FirstName" placeholder="Given name">
                                        </div>
                                        <div class="field-group">
                                            <label>Middle Name</label>
                                            <input type="text" name="father_MiddleName">
                                        </div>
                                        <div class="field-group">
                                            <label>Last Name</label>
                                            <input type="text" name="father_LastName">
                                        </div>
                                        <div class="field-group">
                                            <label>Nickname</label>
                                            <input type="text" name="father_NickName">
                                        </div>
                                        <div class="field-group">
                                            <label>Birth Date</label>
                                            <input type="date" name="father_BirthDate">
                                        </div>
                                        <div class="field-group">
                                            <label>Place of Birth</label>
                                            <input type="text" name="father_PlaceOfBirth">
                                        </div>
                                        <div class="field-group">
                                            <label>Occupation</label>
                                            <input type="text" name="father_Occupation">
                                        </div>
                                        <div class="field-group">
                                            <label>Contact Number</label>
                                            <input type="text" name="father_ContactNumber">
                                        </div>
                                        <div class="field-group">
                                            <label>Address</label>
                                            <input type="text" name="father_Address">
                                        </div>
                                        <div class="field-group">
                                            <label>Highest Educational Attainment</label>
                                            <input type="text" name="father_HighestEducationalAttainment">
                                        </div>
                                        <div class="field-group">
                                            <label>Deceased?</label>
                                            <select name="father_isDeceased">
                                                <option value="No">No</option>
                                                <option value="Yes">Yes</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div class="parent-card">
                                    <div class="parent-card-header">
                                        <i class="fas fa-person-dress"></i> Mother's Information
                                    </div>
                                    <div class="parent-card-body">
                                        <div class="field-group">
                                            <label>First Name</label>
                                            <input type="text" name="mother_FirstName">
                                        </div>
                                        <div class="field-group">
                                            <label>Middle Name</label>
                                            <input type="text" name="mother_MiddleName">
                                        </div>
                                        <div class="field-group">
                                            <label>Last Name</label>
                                            <input type="text" name="mother_LastName">
                                        </div>
                                        <div class="field-group">
                                            <label>Nickname</label>
                                            <input type="text" name="mother_NickName">
                                        </div>
                                        <div class="field-group">
                                            <label>Birth Date</label>
                                            <input type="date" name="mother_BirthDate">
                                        </div>
                                        <div class="field-group">
                                            <label>Place of Birth</label>
                                            <input type="text" name="mother_PlaceOfBirth">
                                        </div>
                                        <div class="field-group">
                                            <label>Occupation</label>
                                            <input type="text" name="mother_Occupation">
                                        </div>
                                        <div class="field-group">
                                            <label>Contact Number</label>
                                            <input type="text" name="mother_ContactNumber">
                                        </div>
                                        <div class="field-group">
                                            <label>Address</label>
                                            <input type="text" name="mother_Address">
                                        </div>
                                        <div class="field-group">
                                            <label>Highest Educational Attainment</label>
                                            <input type="text" name="mother_HighestEducationalAttainment">
                                        </div>
                                        <div class="field-group">
                                            <label>Deceased?</label>
                                            <select name="mother_isDeceased">
                                                <option value="No">No</option>
                                                <option value="Yes">Yes</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- STEP 5: FAMILY STATUS -->
                    <div class="step-panel" data-step="5">
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-house-chimney"></i></div>
                                <div class="section-title">Family Status</div>
                            </div>
                            <div class="field-grid">
                                <div class="field-group">
                                    <label>Parents Living Together?</label>
                                    <select name="LivingTogether">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label>Married?</label>
                                    <select name="MarriedYet">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label>Married in Church?</label>
                                    <select name="MarriedChurch">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label>Temporarily Separated?</label>
                                    <select name="TemporarilySepered">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label>Permanently Separated?</label>
                                    <select name="PermanentlySepered">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label>Father with Partner?</label>
                                    <select name="FatherWithPartner">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div class="field-group">
                                    <label>Mother with Partner?</label>
                                    <select name="MotherWithPartner">
                                        <option value="">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- STEP 6: SIBLINGS & OTHERS -->
                    <div class="step-panel" data-step="6">
                        <!-- Siblings -->
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-children"></i></div>
                                <div class="section-title">Siblings Information</div>
                                <button type="button" class="btn-add btn-add-inline" onclick="addSibling()">
                                    <i class="fas fa-plus"></i> Add Sibling
                                </button>
                            </div>
                            <div id="siblingsContainer"></div>
                        </div>

                        <!-- Guardian -->
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-shield-halved"></i></div>
                                <div class="section-title">Guardian Information <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(if applicable)</span></div>
                            </div>
                            <div class="field-grid">
                                <div class="identity-row span-2">
                                    <div class="field-group">
                                        <label>First Name</label>
                                        <input type="text" name="guardian_FirstName">
                                    </div>
                                    <div class="field-group">
                                        <label>Last Name</label>
                                        <input type="text" name="guardian_LastName">
                                    </div>
                                    <div class="field-group">
                                        <label>Middle Name</label>
                                        <input type="text" name="guardian_MiddleName">
                                    </div>
                                </div>
                                <div class="field-group">
                                    <label>Relationship</label>
                                    <input type="text" name="guardian_Relationship" placeholder="e.g., Aunt, Grandparent">
                                </div>
                                <div class="field-group">
                                    <label>Address</label>
                                    <input type="text" name="guardian_Address">
                                </div>
                                <div class="field-group">
                                    <label>Landline</label>
                                    <input type="text" name="guardian_Landline">
                                </div>
                                <div class="field-group">
                                    <label>Mobile Number</label>
                                    <input type="text" name="guardian_MobileNumber">
                                </div>
                            </div>
                        </div>

                        <!-- Friends -->
                        <div class="section">
                            <div class="section-header">
                                <div class="section-icon"><i class="fas fa-user-group"></i></div>
                                <div class="section-title">Friends Information</div>
                                <button type="button" class="btn-add btn-add-inline" onclick="addFriend()">
                                    <i class="fas fa-plus"></i> Add Friend
                                </button>
                            </div>
                            <div id="friendsContainer"></div>
                        </div>
                    </div>

                </div><!-- /form-body -->

                <!-- NAVIGATION -->
                <div class="form-nav">
                    <button type="button" class="btn-nav btn-prev" id="prevBtn" disabled>
                        <i class="fas fa-arrow-left"></i> Previous
                    </button>
                    <div class="nav-progress">
                        <span id="stepLabel" style="margin-bottom:4px;">Step 1 of 6</span>
                        <div class="progress-bar-wrap">
                            <div class="progress-bar-fill" id="progressFill" style="width:16.66%"></div>
                        </div>
                    </div>
                    <button type="button" class="btn-nav btn-next" id="nextBtn">
                        Next <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </form>
        </div>
        </div>
    </div>
</div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/student/student-information.js') }}?v={{ filemtime(public_path('pages/student/student-information.js')) }}"></script>
</body>
</html>
