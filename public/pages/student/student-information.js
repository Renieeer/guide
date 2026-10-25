    // ============================================================
    //  student-information.js  —  works with the redesigned HTML
    // ============================================================

    function getApiUrl() {
        return '../../api';
    }

    function parseStoredJson(storage, key) {
        try {
            return JSON.parse(storage.getItem(key) || '{}');
        } catch (error) {
            return {};
        }
    }

    function getCurrentUserProfile() {
        const sources = [
            parseStoredJson(localStorage, 'currentUser'),
            parseStoredJson(sessionStorage, 'userInfo'),
            parseStoredJson(sessionStorage, 'user')
        ];

        const merged = sources.reduce((acc, src) => ({ ...acc, ...src }), {});
        const firstName = (merged.first_name || merged.firstName || merged.First_name || merged.FirstName || '').trim();
        const lastName = (merged.last_name || merged.lastName || merged.Last_name || merged.LastName || '').trim();
        const fullName = (merged.name || `${firstName} ${lastName}` || sessionStorage.getItem('userName') || '').trim();

        return {
            id: merged.id || merged.ID || merged.AccountID || merged.accountId || merged.account_id || merged.student_id || merged.studentId || merged.StudentId || merged.studentID || '',
            firstName,
            lastName,
            fullName,
            role: merged.user_type || merged.role || merged.Type || 'Student'
        };
    }

    function resolveStudentId() {
        const profile = getCurrentUserProfile();
        const storedUser = parseStoredJson(sessionStorage, 'user');
        const storedUserInfo = parseStoredJson(sessionStorage, 'userInfo');
        const storedCurrentUser = parseStoredJson(localStorage, 'currentUser');

        const candidates = [
            profile.id,
            storedUser.studentId,
            storedUser.StudentId,
            storedUser.student_id,
            storedUser.accountId,
            storedUser.account_id,
            storedUser.ID,
            storedUserInfo.studentId,
            storedUserInfo.StudentId,
            storedUserInfo.student_id,
            storedUserInfo.accountId,
            storedUserInfo.account_id,
            storedUserInfo.ID,
            storedCurrentUser.studentId,
            storedCurrentUser.StudentId,
            storedCurrentUser.student_id,
            storedCurrentUser.accountId,
            storedCurrentUser.account_id,
            storedCurrentUser.ID,
            sessionStorage.getItem('studentId'),
            sessionStorage.getItem('StudentId')
        ];

        return candidates.find(value => String(value ?? '').trim() !== '') || '';
    }

    function renderTopbarUserInfo(fullName, role) {
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        const userAvatar = document.getElementById('userAvatar');

        if (!userNameEl || !fullName) {
            return;
        }

        userNameEl.textContent = fullName;

        if (userRoleEl) {
            const normalizedRole = String(role || 'Student');
            userRoleEl.textContent = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1).replace('-', ' ');
        }

        if (userAvatar) {
            const initials = fullName
                .split(' ')
                .filter(Boolean)
                .map(part => part.charAt(0))
                .join('')
                .toUpperCase()
                .slice(0, 2);
            userAvatar.textContent = initials || 'ST';
        }
    }

    function prefillStudentNameFields(firstName, lastName) {
        const firstNameField = document.querySelector('input[name="FirstName"]');
        const lastNameField = document.querySelector('input[name="LastName"]');

        if (firstNameField && !firstNameField.value.trim() && firstName) {
            firstNameField.value = firstName;
        }

        if (lastNameField && !lastNameField.value.trim() && lastName) {
            lastNameField.value = lastName;
        }
    }

    function updateTopbarNameFromStudentRecord(student) {
        if (!student || typeof student !== 'object') {
            return;
        }

        const firstName = (student.FirstName || student.first_name || '').trim();
        const lastName = (student.LastName || student.last_name || '').trim();

        if (!firstName && !lastName) {
            return;
        }

        const profile = getCurrentUserProfile();
        const fullName = `${firstName} ${lastName}`.trim();
        renderTopbarUserInfo(fullName, profile.role);
    }

    function normalizeGradeValue(value, gradeName = '') {
        const rawValue = String(value ?? '').trim();
        const rawName = String(gradeName ?? '').trim();

        if (!rawValue && !rawName) {
            return '';
        }

        const nameMatch = rawName.match(/grade\s*(\d+)/i);
        if (nameMatch) {
            return nameMatch[1];
        }

        // The legacy 1-4-means-7-10 code only ever made sense for a
        // secondary school's old numbering — an elementary account's raw
        // "1"-"6" is already a literal grade number and must never be run
        // through it, or it gets rewritten to a grade (7-10) that doesn't
        // exist as an option in the elementary 1-6 dropdown, and the Grade
        // field silently comes back blank when reloading a saved profile.
        if (isElementarySchool) {
            if (/^\d+$/.test(rawValue)) {
                const numericValue = Number(rawValue);
                if (numericValue >= 1 && numericValue <= 6) {
                    return rawValue;
                }
            }
            return rawValue;
        }

        const legacyMap = {
            '1': '7',
            '2': '8',
            '3': '9',
            '4': '10'
        };

        if (legacyMap[rawValue]) {
            return legacyMap[rawValue];
        }

        if (/^\d+$/.test(rawValue)) {
            const numericValue = Number(rawValue);
            if (numericValue >= 7 && numericValue <= 10) {
                return rawValue;
            }
        }

        return rawValue;
    }

    const addressSectionPrefixes = ['CurrentAddress', 'PermanentAddress'];

    function getAddressField(prefix, suffix) {
        return document.querySelector(`[name="${prefix}_${suffix}"]`);
    }

    function getAddressSelect(prefix, level) {
        return document.querySelector(`select[name="${prefix}_${level}Code"]`);
    }

    function getSelectLabel(selectElement) {
        if (!selectElement || selectElement.selectedIndex < 0) {
            return '';
        }

        const selectedOption = selectElement.options[selectElement.selectedIndex];
        // The placeholder ("Select city or municipality") has an empty value:
        // nothing picked means no name, not the placeholder's own label
        // saved as the address.
        return selectedOption && selectedOption.value ? selectedOption.textContent.trim() : '';
    }

    function parseAddressData(rawValue) {
        if (!rawValue) {
            return {};
        }

        if (typeof rawValue === 'object') {
            return rawValue;
        }

        if (typeof rawValue === 'string') {
            try {
                const parsed = JSON.parse(rawValue);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (error) {
                return {};
            }
        }

        return {};
    }

    function buildAddressSummary(addressData = {}) {
        const parts = [
            addressData.houseUnitNo,
            addressData.street,
            addressData.barangayName,
            addressData.cityName,
            addressData.provinceName,
            addressData.regionName,
            addressData.zipCode,
            addressData.country
        ]
            .map(value => String(value ?? '').trim())
            .filter(Boolean);

        return parts.join(', ');
    }

    function normalizeAddressToken(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function resolveSelectValueByLabel(selectElement, candidateValue = '') {
        if (!selectElement || !candidateValue) {
            return '';
        }

        const normalizedCandidate = normalizeAddressToken(candidateValue);
        const matchedOption = Array.from(selectElement.options || []).find(option => {
            return normalizeAddressToken(option.value) === normalizedCandidate || normalizeAddressToken(option.textContent) === normalizedCandidate;
        });

        return matchedOption ? String(matchedOption.value || '') : '';
    }

    function buildStructuredAddressPayload(record, prefix) {
        const source = parseAddressData(
            record?.[`${prefix}Data`] ||
            record?.[`${prefix.toLowerCase()}_data`] ||
            record?.[prefix] ||
            record?.[prefix.toLowerCase()] ||
            {}
        );

        const fieldPrefix = prefix === 'CurrentAddress' ? 'CurrentAddress' : 'PermanentAddress';

        return {
            ...source,
            regionCode: source.regionCode || record?.[`${fieldPrefix}RegionCode`] || '',
            regionName: source.regionName || record?.[`${fieldPrefix}RegionName`] || '',
            provinceCode: source.provinceCode || record?.[`${fieldPrefix}ProvinceCode`] || '',
            provinceName: source.provinceName || record?.[`${fieldPrefix}ProvinceName`] || '',
            cityCode: source.cityCode || record?.[`${fieldPrefix}CityCode`] || '',
            cityName: source.cityName || record?.[`${fieldPrefix}CityName`] || '',
            barangayCode: source.barangayCode || record?.[`${fieldPrefix}BarangayCode`] || '',
            barangayName: source.barangayName || record?.[`${fieldPrefix}BarangayName`] || ''
        };
    }

    function collectAddressSectionData(prefix) {
        const regionSelect = getAddressSelect(prefix, 'Region');
        const provinceSelect = getAddressSelect(prefix, 'Province');
        const citySelect = getAddressSelect(prefix, 'City');
        const barangaySelect = getAddressSelect(prefix, 'Barangay');

        const addressData = {
            houseUnitNo: getAddressField(prefix, 'HouseUnitNo')?.value.trim() || '',
            street: getAddressField(prefix, 'Street')?.value.trim() || '',
            regionCode: regionSelect?.value || '',
            regionName: getSelectLabel(regionSelect),
            provinceCode: provinceSelect?.value || '',
            provinceName: getSelectLabel(provinceSelect),
            cityCode: citySelect?.value || '',
            cityName: getSelectLabel(citySelect),
            barangayCode: barangaySelect?.value || '',
            barangayName: getSelectLabel(barangaySelect),
            zipCode: getAddressField(prefix, 'ZipCode')?.value.trim() || '',
            country: getAddressField(prefix, 'Country')?.value.trim() || 'Philippines'
        };

        addressData.summary = buildAddressSummary(addressData);
        return addressData;
    }

    function setAddressSectionValues(prefix, addressData = {}) {
        const values = parseAddressData(addressData);

        const fieldMap = {
            HouseUnitNo: values.houseUnitNo || values.HouseUnitNo || '',
            Street: values.street || values.Street || '',
            ZipCode: values.zipCode || values.ZipCode || '',
            Country: values.country || values.Country || 'Philippines'
        };

        Object.entries(fieldMap).forEach(([suffix, value]) => {
            const field = getAddressField(prefix, suffix);
            if (field) {
                field.value = value;
            }
        });
    }
async function fetchAddressOptions(level, params = {}) {
    // window.location.origin is scheme+host only (no path), so resolving a
    // relative "../../api/..." against it collapses straight to the site
    // root regardless of where this page actually lives — window.location.href
    // (the full current URL) is what a relative path needs to resolve
    // against correctly.
    const url = new URL(`${getApiUrl()}/address-options`, window.location.href);
    url.searchParams.set('level', level);
 
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
            url.searchParams.set(key, value);
        }
    });
 
    const response = await fetch(url.toString());

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from address-options.php`);
    }

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.message || `Unable to load ${level}`);
    }
 
    return Array.isArray(data.data) ? data.data : [];
}

    function fillAddressSelect(selectElement, items, placeholder, selectedValue = '') {
        if (!selectElement) return;
    
        const currentValue = selectedValue || selectElement.value || '';
        selectElement.innerHTML = '';
    
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholder;
        selectElement.appendChild(placeholderOption);
    
        items.forEach(item => {
            const option = document.createElement('option');
            option.value       = String(item.code || '');
            option.textContent = item.name || item.label || '';
            // Store zip on the option so city change can auto-fill ZIP field
            if (item.zip_code) option.dataset.zip = item.zip_code;
            selectElement.appendChild(option);
        });
    
        if (currentValue) {
            selectElement.value = currentValue;
            if (selectElement.value !== currentValue) {
                const fallback = resolveSelectValueByLabel(selectElement, currentValue);
                if (fallback) selectElement.value = fallback;
            }
        }
    }
    
   async function loadAddressRegions(prefix, selectedRegionCode = '') {
    const selectElement = getAddressSelect(prefix, 'Region');
    if (!selectElement) {
        return [];
    }

    try {
        const regions = await fetchAddressOptions('regions');
        fillAddressSelect(selectElement, regions, 'Select region', selectedRegionCode);
        selectElement.disabled = false;
        return regions;
    } catch (err) {
        selectElement.innerHTML = '<option value="">Failed to load regions</option>';
        return [];
    }
}

    async function loadAddressProvinces(prefix, regionCode = '', selectedProvinceCode = '') {
        const selectElement = getAddressSelect(prefix, 'Province');
        const citySelect = getAddressSelect(prefix, 'City');
        const barangaySelect = getAddressSelect(prefix, 'Barangay');

        if (!selectElement) {
            return [];
        }

        if (!regionCode) {
            fillAddressSelect(selectElement, [], 'Select province', '');
            selectElement.disabled = true;
            if (citySelect) {
                fillAddressSelect(citySelect, [], 'Select city or municipality', '');
                citySelect.disabled = true;
            }
            if (barangaySelect) {
                fillAddressSelect(barangaySelect, [], 'Select barangay', '');
                barangaySelect.disabled = true;
            }
            return [];
        }

        const provinces = await fetchAddressOptions('provinces', { regionCode });
        fillAddressSelect(selectElement, provinces, 'Select province', selectedProvinceCode);
        selectElement.disabled = false;

        if (citySelect) {
            fillAddressSelect(citySelect, [], 'Select city or municipality', '');
            citySelect.disabled = true;
        }
        if (barangaySelect) {
            fillAddressSelect(barangaySelect, [], 'Select barangay', '');
            barangaySelect.disabled = true;
        }

        return provinces;
    }

    async function loadAddressCities(prefix, provinceCode = '', selectedCityCode = '') {
        const selectElement = getAddressSelect(prefix, 'City');
        const barangaySelect = getAddressSelect(prefix, 'Barangay');

        if (!selectElement) {
            return [];
        }

        if (!provinceCode) {
            fillAddressSelect(selectElement, [], 'Select city or municipality', '');
            selectElement.disabled = true;
            if (barangaySelect) {
                fillAddressSelect(barangaySelect, [], 'Select barangay', '');
                barangaySelect.disabled = true;
            }
            return [];
        }

        const cities = await fetchAddressOptions('cities', { provinceCode });
        fillAddressSelect(selectElement, cities, 'Select city or municipality', selectedCityCode);
        selectElement.disabled = false;

        if (barangaySelect) {
            fillAddressSelect(barangaySelect, [], 'Select barangay', '');
            barangaySelect.disabled = true;
        }

        return cities;
    }

    async function loadAddressBarangays(prefix, cityCode = '', selectedBarangayCode = '') {
        const selectElement = getAddressSelect(prefix, 'Barangay');

        if (!selectElement) {
            return [];
        }

        if (!cityCode) {
            fillAddressSelect(selectElement, [], 'Select barangay', '');
            selectElement.disabled = true;
            return [];
        }

        const barangays = await fetchAddressOptions('barangays', { cityCode });
        fillAddressSelect(selectElement, barangays, 'Select barangay', selectedBarangayCode);
        selectElement.disabled = false;
        return barangays;
    }

    async function hydrateAddressSection(prefix, addressData = {}) {
        const parsedData = parseAddressData(addressData);

        setAddressSectionValues(prefix, parsedData);

        const regionSeed = parsedData.regionCode || parsedData.region_code || parsedData.regionName || parsedData.region_name || '';
        const provinceSeed = parsedData.provinceCode || parsedData.province_code || parsedData.provinceName || parsedData.province_name || '';
        const citySeed = parsedData.cityCode || parsedData.city_code || parsedData.municipalityCode || parsedData.municipality_code || parsedData.cityName || parsedData.city_name || parsedData.municipalityName || parsedData.municipality_name || '';
        const barangaySeed = parsedData.barangayCode || parsedData.barangay_code || parsedData.barangayName || parsedData.barangay_name || '';

        await loadAddressRegions(prefix, regionSeed);

        const regionSelect = getAddressSelect(prefix, 'Region');
        const resolvedRegionCode = regionSelect?.value || parsedData.regionCode || parsedData.region_code || '';

        await loadAddressProvinces(prefix, resolvedRegionCode, provinceSeed);

        const provinceSelect = getAddressSelect(prefix, 'Province');
        const resolvedProvinceCode = provinceSelect?.value || parsedData.provinceCode || parsedData.province_code || '';

        await loadAddressCities(prefix, resolvedProvinceCode, citySeed);

        const citySelect = getAddressSelect(prefix, 'City');
        const resolvedCityCode = citySelect?.value || parsedData.cityCode || parsedData.city_code || parsedData.municipalityCode || parsedData.municipality_code || '';

        await loadAddressBarangays(prefix, resolvedCityCode, barangaySeed);

        const summaryField = getAddressField(prefix, 'Summary');
        if (summaryField) {
            summaryField.value = parsedData.summary || buildAddressSummary(parsedData);
        }
    }


    function wireAddressSelectDependencies(prefix) {
        const regionSelect   = getAddressSelect(prefix, 'Region');
        const provinceSelect = getAddressSelect(prefix, 'Province');
        const citySelect     = getAddressSelect(prefix, 'City');
    
        if (regionSelect) {
            regionSelect.addEventListener('change', async () => {
                await loadAddressProvinces(prefix, regionSelect.value, '');
                clearZipCode(prefix);
            });
        }
    
        if (provinceSelect) {
            provinceSelect.addEventListener('change', async () => {
                await loadAddressCities(prefix, provinceSelect.value, '');
                clearZipCode(prefix);
            });
        }
    
        if (citySelect) {
            citySelect.addEventListener('change', async () => {
                await loadAddressBarangays(prefix, citySelect.value, '');
                autoFillZipCode(prefix, citySelect);
            });
        }
    }
    
    // Auto-fill ZIP from the selected city option's data-zip attribute
    function autoFillZipCode(prefix, citySelectElement) {
        const zipField = getAddressField(prefix, 'ZipCode');
        if (!zipField) return;
        const selectedOption = citySelectElement?.selectedOptions[0];
        const zip = selectedOption?.dataset?.zip || '';
        zipField.value = zip;
        if (zip) {
            zipField.title = 'Auto-filled from city selection';
        }
    }
    
    function clearZipCode(prefix) {
        const zipField = getAddressField(prefix, 'ZipCode');
        if (zipField) zipField.value = '';
    }
    

    function setupStructuredAddressFields() {
        addressSectionPrefixes.forEach(prefix => {
            wireAddressSelectDependencies(prefix);
            loadAddressRegions(prefix).catch(error => console.error(`Failed to load ${prefix} regions:`, error));
        });
    }

    function copyAddressFields(sourcePrefix, targetPrefix) {
        const sourceData = collectAddressSectionData(sourcePrefix);
        hydrateAddressSection(targetPrefix, sourceData).catch(error => {
            console.error('Failed to copy address fields:', error);
        });
    }

    function appendStructuredAddressData(target) {
        addressSectionPrefixes.forEach(prefix => {
            const addressData = collectAddressSectionData(prefix);
            target[`${prefix}Data`] = JSON.stringify(addressData);
            target[prefix] = addressData.summary;
        });
    }

    let currentStep   = 1;
    const totalSteps  = 6;
    let completedSteps = new Set();
    let savedFormData  = {};
    let isUpdateMode   = false;   // true once existing data is loaded
    let autoSaveTimer  = null;    // Timer for debounced database save

    // Set by loadGrades() from api/school-config?action=getGrades's own
    // isElementary flag — normalizeGradeValue() needs this so a raw "1"-"6"
    // from an elementary account's saved Grade isn't run through the
    // legacy 1-4-means-7-10 secondary code map below.
    let isElementarySchool = false;

    // ─── counters for dynamic sections ───────────────────────────
    let eduCount     = 0;
    let orgCount     = 0;
    let sibCount     = 0;
    let friendCount  = 0;

    // ─── INIT ─────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
    loadGrades();
 
    setTimeout(() => {
        try {
            setupUserInfo();
            setupStepClickListeners();
            initDynamicSections();
            setupStudentNameSearch();
            setupAgeAutoCalculate();
            setupStructuredAddressFields(); // ← moved INSIDE setTimeout
            loadStudentData();
            updateStepIndicator();
            updateNavigationButtons();
            setupFamilyStatusDependencies();
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }, 200);
});
 
    // ─── LOAD GRADES ───────────────────────────────────────────────
    // Grade 1-6 for an elementary school (school_level East/West/South),
    // Grade 7-12 for everything else — decided server-side from the
    // logged-in student's own school (api/school-config?action=getGrades),
    // same East/West/South convention used for coordinator grade scoping.
    function loadGrades() {
        const gradeSelect = document.getElementById('gradeSelect');
        if (!gradeSelect) return;
        const selectedValue = normalizeGradeValue(gradeSelect.value, gradeSelect.selectedOptions[0]?.textContent || '');

        const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        const school = currentUser.school_attended || '';

        fetch(`${getApiUrl()}/school-config?action=getGrades&school=${encodeURIComponent(school)}`)
            .then(r => r.json())
            .then(data => {
                isElementarySchool = !!data.isElementary;
                if (data.success && Array.isArray(data.grades) && data.grades.length > 0) {
                    while (gradeSelect.options.length > 1) {
                        gradeSelect.remove(1);
                    }
                    data.grades.forEach(grade => {
                        const option = document.createElement('option');
                        option.value = normalizeGradeValue(grade.id, grade.grade_name);
                        option.textContent = grade.grade_name;
                        gradeSelect.appendChild(option);
                    });
                    if (selectedValue) {
                        gradeSelect.value = selectedValue;
                    }
                } else {
                    addFallbackGrades(gradeSelect, selectedValue);
                }
            })
            .catch(err => {
                addFallbackGrades(gradeSelect, selectedValue);
            });
    }

    // ─── FALLBACK GRADES ───────────────────────────────────────────
    // Only reached if the getGrades request itself fails (network/server
    // error) — with no reliable client-side school_level at that point,
    // this falls back to the full Secondary Grade 7-12 range rather than
    // guessing elementary.
    function addFallbackGrades(gradeSelect, selectedValue = '') {
        const fallbackGrades = [7, 8, 9, 10, 11, 12].map(n => ({ id: n, grade_name: `Grade ${n}` }));


        while (gradeSelect.options.length > 1) {
            gradeSelect.remove(1);
        }
        
        fallbackGrades.forEach(grade => {
            const option = document.createElement('option');
            option.value = String(grade.id);
            option.textContent = grade.grade_name;
            gradeSelect.appendChild(option);
        });

        if (selectedValue) {
            gradeSelect.value = selectedValue;
        }
    }

    function calculateAgeFromBirthDate(birthDateValue) {
        if (!birthDateValue) {
            return '';
        }

        const birthDate = new Date(birthDateValue);
        if (Number.isNaN(birthDate.getTime())) {
            return '';
        }

        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();

        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        return age >= 0 ? String(age) : '';
    }

    function syncAgeFromDateOfBirth() {
        const dobField = document.querySelector('input[name="DateOfBirth"]');
        const ageField = document.querySelector('input[name="Age"]');

        if (!dobField || !ageField) {
            return;
        }

        ageField.value = calculateAgeFromBirthDate(dobField.value);
    }

    function setupAgeAutoCalculate() {
        const dobField = document.querySelector('input[name="DateOfBirth"]');
        if (!dobField) {
            return;
        }

        dobField.addEventListener('input', syncAgeFromDateOfBirth);
        dobField.addEventListener('change', syncAgeFromDateOfBirth);
        syncAgeFromDateOfBirth();
    }

    // ─── MANUAL SAVE BUTTON (no auto-save) ──────────────────────
    function manualSaveChanges() {
        
        const studentIdField = document.querySelector('input[name="StudentId"]');
        const resolvedStudentId = (studentIdField && studentIdField.value.trim()) || resolveStudentId();
        
        if (!resolvedStudentId) {
            showNotification('Cannot save: StudentId is empty', 'error');
            return;
        }

        // Validate grade selection
        const gradeSelect = document.querySelector('select[name="grade_id"]');
        
        if (!gradeSelect || !gradeSelect.value) {
            showNotification('Please select a grade before saving', 'warning');
            return;
        }

        const studentIdToSave = resolvedStudentId;
        
        showConfirmationDialog(
            'Save Changes',
            'Save your changes?',
            () => saveToDatabaseQuick(studentIdToSave)
        );
    }

    // ─── SAVE TO DATABASE (called by manual save button) ──────────
    function saveToDatabaseQuick(studentId) {
        try {
            
            const form = document.getElementById('studentForm');
            if (!form) {
                console.error('studentForm not found');
                return;
            }

            const fd = new FormData(form);
            const resolvedStudentId = (studentId && String(studentId).trim()) || resolveStudentId() || String(fd.get('StudentId') || '').trim();
            
            // Collect basic student data
            const studentData = {
                StudentId: resolvedStudentId,
                LRN: fd.get('LRN') || '',
                FirstName: fd.get('FirstName') || '',
                LastName: fd.get('LastName') || '',
                MiddleName: fd.get('MiddleName') || '',
                NickName: fd.get('NickName') || '',
                Sex: fd.get('Sex') || '',
                Age: fd.get('Age') || '',
                DateOfBirth: fd.get('DateOfBirth') || '',
                PlaceOfBirth: fd.get('PlaceOfBirth') || '',
                ReligionFromBirth: fd.get('ReligionFromBirth') || '',
                CurrentReligion: fd.get('CurrentReligion') || '',
                CurrentAddress: fd.get('CurrentAddress') || '',
                PermanentAddress: fd.get('PermanentAddress') || '',
                CellphoneNumber: fd.get('CellphoneNumber') || '',
                grade_id: fd.get('grade_id') !== '' ? parseInt(fd.get('grade_id'), 10) : null,
                
                // Parents
                father_FirstName: fd.get('father_FirstName') || '',
                father_MiddleName: fd.get('father_MiddleName') || '',
                father_LastName: fd.get('father_LastName') || '',
                father_NickName: fd.get('father_NickName') || '',
                father_BirthDate: fd.get('father_BirthDate') || '',
                father_PlaceOfBirth: fd.get('father_PlaceOfBirth') || '',
                father_Occupation: fd.get('father_Occupation') || '',
                father_ContactNumber: fd.get('father_ContactNumber') || '',
                father_Address: fd.get('father_Address') || '',
                father_HighestEducationalAttainment: fd.get('father_HighestEducationalAttainment') || '',
                father_isDeceased: fd.get('father_isDeceased') || '',
                
                mother_FirstName: fd.get('mother_FirstName') || '',
                mother_MiddleName: fd.get('mother_MiddleName') || '',
                mother_LastName: fd.get('mother_LastName') || '',
                mother_NickName: fd.get('mother_NickName') || '',
                mother_BirthDate: fd.get('mother_BirthDate') || '',
                mother_PlaceOfBirth: fd.get('mother_PlaceOfBirth') || '',
                mother_Occupation: fd.get('mother_Occupation') || '',
                mother_ContactNumber: fd.get('mother_ContactNumber') || '',
                mother_Address: fd.get('mother_Address') || '',
                mother_HighestEducationalAttainment: fd.get('mother_HighestEducationalAttainment') || '',
                mother_isDeceased: fd.get('mother_isDeceased') || '',
                
                // Family status
                LivingTogether: fd.get('LivingTogether') || '',
                MarriedYet: fd.get('MarriedYet') || '',
                MarriedChurch: fd.get('MarriedChurch') || '',
                TemporarilySepered: fd.get('TemporarilySepered') || '',
                PermanentlySepered: fd.get('PermanentlySepered') || '',
                FatherWithPartner: fd.get('FatherWithPartner') || '',
                MotherWithPartner: fd.get('MotherWithPartner') || '',
                
                // Guardian
                guardian_FirstName: fd.get('guardian_FirstName') || '',
                guardian_MiddleName: fd.get('guardian_MiddleName') || '',
                guardian_LastName: fd.get('guardian_LastName') || '',
                guardian_Relationship: fd.get('guardian_Relationship') || '',
                guardian_Address: fd.get('guardian_Address') || '',
                guardian_Landline: fd.get('guardian_Landline') || '',
                guardian_MobileNumber: fd.get('guardian_MobileNumber') || '',
                
                // Education data
                education: collectEducationData(),
                
                // Organization data
                organization: collectOrganizationData(),
                
                // Sibling data
                sibling: collectSiblingData(),
                
                // Friend data
                friend: collectFriendData()
            };

            appendStructuredAddressData(studentData);

            // Check if there's actual data to save
            if (!resolvedStudentId) {
                console.warn('No StudentId provided');
                showNotification('Please enter a Student ID', 'warning');
                return;
            }

            // Send to database
            const apiUrl = `${getApiUrl()}/save-student`;
            
            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(studentData)
            })
            .then(r => {
                return r.text();
            })
            .then(text => {
                try {
                    const data = JSON.parse(text);
                    if (data.success) {
                        showNotification('✓ All information saved successfully!', 'success');
                        // Always land back on Step 1 after a save, regardless
                        // of which step the user was on when they clicked
                        // Save/Update — not navigateToStep(1), which no-ops
                        // when already on the target step and also re-runs
                        // saveCurrentStep()'s local-only bookkeeping, neither
                        // of which is needed right after a real DB save.
                        currentStep = 1;
                        updateStepIndicator();
                        updateNavigationButtons();
                        scrollToTop();
                    } else {
                        showNotification(data.message || 'Failed to save information', 'error');
                    }
                } catch (parseErr) {
                    console.error('Response parsing error:', parseErr);
                    console.error('Raw response:', text);
                    showNotification('Server error: ' + text, 'error');
                }
            })
            .catch(err => {
                console.error('Fetch error:', err);
                showNotification('Error saving information: ' + err.message, 'error');
            });
        } catch (error) {
            console.error('Error in saveToDatabaseQuick:', error);
            showNotification('Error: ' + error.message, 'error');
        }
    }

    // ─── HELPER: Collect education data from form ──────────────────
    function collectEducationData() {
        const education = [];
        const eduContainer = document.getElementById('educationContainer');
        
        if (!eduContainer) {
            return education;
        }
        
        const eduCards = eduContainer.querySelectorAll('.dyn-card');
        
        eduCards.forEach((card, i) => {
            const gradeLevel = card.querySelector(`input[name="education[${i}][GradeLevel]"]`)?.value || '';
            const schoolAttended = card.querySelector(`input[name="education[${i}][SchoolAttended]"]`)?.value || '';
            const inclusiveYes = card.querySelector(`input[name="education[${i}][InclusiveYes]"]`)?.value || '';
            const placeAndSchool = card.querySelector(`textarea[name="education[${i}][PlaceAndSchool]"]`)?.value || '';
            
            if (gradeLevel || schoolAttended || inclusiveYes || placeAndSchool) {
                education.push({ GradeLevel: gradeLevel, SchoolAttended: schoolAttended, InclusiveYes: inclusiveYes, PlaceAndSchool: placeAndSchool });
            }
        });
        return education;
    }

    // ─── HELPER: Collect organization data from form ──────────────────
    function collectOrganizationData() {
        const organization = [];
        const orgContainer = document.getElementById('organizationContainer');
        
        if (!orgContainer) {
            return organization;
        }
        
        const orgCards = orgContainer.querySelectorAll('.dyn-card');
        
        orgCards.forEach((card, i) => {
            const orgName = card.querySelector(`input[name="organization[${i}][OrganizationName]"]`)?.value || '';
            const positionTitle = card.querySelector(`input[name="organization[${i}][PositionTitle]"]`)?.value || '';
            const inCampus = card.querySelector(`select[name="organization[${i}][inCampus]"]`)?.value || '';
            
            if (orgName || positionTitle || inCampus) {
                organization.push({ OrganizationName: orgName, PositionTitle: positionTitle, inCampus: inCampus });
            }
        });
        return organization;
    }

    // ─── HELPER: Collect sibling data from form ──────────────────
    function collectSiblingData() {
        const siblings = [];
        const sibContainer = document.getElementById('siblingsContainer');
        
        if (!sibContainer) {
            return siblings;
        }
        
        const sibCards = sibContainer.querySelectorAll('.dyn-card');
        
        sibCards.forEach((card, i) => {
            const firstName = card.querySelector(`input[name="sibling[${i}][FirstName]"]`)?.value || '';
            const lastName = card.querySelector(`input[name="sibling[${i}][LastName]"]`)?.value || '';
            const middleName = card.querySelector(`input[name="sibling[${i}][MiddleName]"]`)?.value || '';
            const nickName = card.querySelector(`input[name="sibling[${i}][NickName]"]`)?.value || '';
            const age = card.querySelector(`input[name="sibling[${i}][Age]"]`)?.value || '';
            const birthOrder = card.querySelector(`input[name="sibling[${i}][BirthOrder]"]`)?.value || '';
            const schoolId = card.querySelector(`input[name="sibling[${i}][SchoolId]"]`)?.value || '';
            
            if (firstName || lastName || age) {
                siblings.push({ FirstName: firstName, LastName: lastName, MiddleName: middleName, NickName: nickName, Age: age, BirthOrder: birthOrder, SchoolId: schoolId });
            }
        });
        return siblings;
    }

    // ─── HELPER: Collect friend data from form ──────────────────
    function collectFriendData() {
        const friends = [];
        const friendContainer = document.getElementById('friendsContainer');
        
        if (!friendContainer) {
            return friends;
        }
        
        const friendCards = friendContainer.querySelectorAll('.dyn-card');
        
        friendCards.forEach((card, i) => {
            const inSchool = card.querySelector(`select[name="friend[${i}][In_school]"]`)?.value || '';
            const firstName = card.querySelector(`input[name="friend[${i}][FirstName]"]`)?.value || '';
            const middleName = card.querySelector(`input[name="friend[${i}][MiddleName]"]`)?.value || '';
            const lastName = card.querySelector(`input[name="friend[${i}][LastName]"]`)?.value || '';
            
            if (firstName || lastName) {
                friends.push({ In_school: inSchool, FirstName: firstName, MiddleName: middleName, LastName: lastName });
            }
        });
        return friends;
    }

    // ─── Seed one entry in each dynamic container ─────────────────
    function initDynamicSections() {
        try {
            if (typeof addEducation === 'function') addEducation();
            if (typeof addOrganization === 'function') addOrganization();
            if (typeof addSibling === 'function') addSibling();
            if (typeof addFriend === 'function') addFriend();
        } catch (error) {
            console.error('Error in initDynamicSections:', error);
        }
    }

    // ─── USER INFO (topbar) ────────────────────────────────────────
    function setupUserInfo() {
        renderSidebarAvatar();

        const currentUser = getCurrentUserProfile();
        const resolvedStudentId = resolveStudentId();

        // Pre-fill hidden StudentId field with logged-in user's ID (for data linking)
        const studentIdField = document.querySelector('input[name="StudentId"]');
        if (studentIdField && resolvedStudentId) {
            studentIdField.value = resolvedStudentId;
        }

        // Wire StudentId change event to load data (if visible)
        if (studentIdField) {
            studentIdField.addEventListener('change', loadStudentDataByInputId);
        }

        prefillStudentNameFields(currentUser.firstName, currentUser.lastName);

        // Update topbar info
        setTimeout(() => {
            if (currentUser.fullName) {
                renderTopbarUserInfo(currentUser.fullName, currentUser.role);
                sessionStorage.setItem('userName', currentUser.fullName);
            }
        }, 100);
    }

    // ─── SETUP STUDENT NAME SEARCH AUTO-FILL ──────────────────────
    let searchTimeout;
    function setupStudentNameSearch() {
        
        // Try to find name fields - could be separate First/Last or combined Student Name
        const firstNameField = document.querySelector('input[name="FirstName"]');
        const lastNameField = document.querySelector('input[name="LastName"]');
        const studentNameField = document.querySelector('input[name="StudentName"]') || 
                                document.querySelector('input[placeholder*="Student Name" i]') ||
                                document.querySelector('input[placeholder*="students name" i]');
        
        if (!firstNameField && !lastNameField && !studentNameField) {
            console.error('ERROR: No name fields found on the form!');
            return;
        }
        
        const handleStudentSearch = () => {
            clearTimeout(searchTimeout);
            
            let firstName = '';
            let lastName = '';
            
            if (studentNameField && studentNameField.value.trim()) {
                // If using combined Student Name field, split it
                const parts = studentNameField.value.trim().split(' ');
                firstName = parts[0] || '';
                lastName = parts.slice(1).join(' ') || '';
            } else {
                // Use separate fields
                firstName = firstNameField?.value?.trim() || '';
                lastName = lastNameField?.value?.trim() || '';
            }
            
            // Need at least 2 characters to search
            if (firstName.length < 2 && lastName.length < 2) {
                return;
            }
            
            // Build search query
            const searchQuery = `${firstName} ${lastName}`.trim();
            
            // Get school from current logged-in user
            const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
            const school = currentUser.school_attended || 'Default School';
            
            // Debounce search - wait 500ms after user stops typing
            searchTimeout = setTimeout(() => {
                const url = `${getApiUrl()}/get-students?search=${encodeURIComponent(searchQuery)}&school=${encodeURIComponent(school)}&limit=5`;
                
                fetch(url)
                    .then(r => {
                        if (!r.ok) {
                            throw new Error(`HTTP ${r.status}`);
                        }
                        return r.json();
                    })
                    .then(data => {
                        
                        if (data.success && Array.isArray(data.students) && data.students.length > 0) {
                            // Auto-fill with the first matching student
                            const student = data.students[0];
                            
                            // Populate StudentId / LRN field
                            const lrnField = document.querySelector('input[name="LRN"]');
                            if (lrnField && student.id) {
                                lrnField.value = student.id;
                            }
                            
                            const studentIdField = document.querySelector('input[name="StudentId"]');
                            if (studentIdField && student.id) {
                                studentIdField.value = student.id;
                            }
                            
                            // Auto-fill Age
                            if (student.Age) {
                                const ageField = document.querySelector('input[name="Age"]');
                                if (ageField) {
                                    ageField.value = student.Age;
                                }
                            }
                            
                            // Auto-fill Sex/Gender
                            if (student.Sex) {
                                const sexField = document.querySelector('select[name="Sex"]');
                                if (sexField) {
                                    sexField.value = student.Sex;
                                }
                            }
                            
                            // Auto-fill Date of Birth
                            if (student.DateOfBirth) {
                                const dobField = document.querySelector('input[name="DateOfBirth"]');
                                if (dobField) {
                                    dobField.value = student.DateOfBirth;
                                }
                            }

                            syncAgeFromDateOfBirth();
                            
                            // Auto-fill Grade
                            if (student.grade_id) {
                                const gradeField = document.querySelector('select[name="grade_id"]');
                                if (gradeField) {
                                    gradeField.value = normalizeGradeValue(student.grade_id, student.grade_name || student.grade_level || '');
                                }
                            }
                            
                            showNotification('✓ Student found and auto-filled!', 'success');
                        } else {
                        }
                    })
                    .catch(err => {
                        console.error('=== FETCH ERROR ===', err);
                    });
            }, 500);
        };
        
        // Add event listeners for real-time search
        if (firstNameField) {
            firstNameField.addEventListener('input', handleStudentSearch);
        }
        if (lastNameField) {
            lastNameField.addEventListener('input', handleStudentSearch);
        }
        if (studentNameField) {
            studentNameField.addEventListener('input', handleStudentSearch);
        }
    }

    // ─── LOAD DATA (on page load) ──────────────────────────────────
    function loadStudentData() {
        let studentId = resolveStudentId();

        if (!studentId) {
            return;
        }

        setTimeout(() => {
            // First try the merged API endpoint which gets data from both accounts and student_table
            fetch(`${getApiUrl()}/get-student-details?student_id=${encodeURIComponent(studentId)}`)
                .then(r => {
                    if (!r.ok) {
                        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
                    }
                    return r.json();
                })
                .then(data => {
                    
                    if (data.success && data.student) {
                        
                        // Pass the full response object
                        populateFormWithStudentDetails(data);
                        updateTopbarNameFromStudentRecord(data.student);
                        markStepsAsComplete();
                        enterUpdateMode();
                        showNotification('✓ Your previous information has been loaded.', 'success');
                    } else {
                        // Fallback to save-student.php if get-student-details fails
                        return fetch(`${getApiUrl()}/save-student?StudentId=${encodeURIComponent(studentId)}`);
                    }
                })
                .then(r => {
                    if (!r) return null;
                    if (!r.ok) {
                        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
                    }
                    return r.json();
                })
                .then(data => {
                    if (data && data.success && data.data) {
                            populateFormWithData({
                                ...data.data,
                                family_status: data.family_status || {}
                            });
                        updateTopbarNameFromStudentRecord(data.data);
                        markStepsAsComplete();
                        enterUpdateMode();
                        showNotification('✓ Your previous information has been loaded.', 'success');
                    }
                })
                .catch(err => {
                    console.error('Error loading student data:', err.message);
                    console.error('Full error:', err);
                    // Still pre-fill the StudentId even if fetch fails
                    const studentIdField = document.querySelector('input[name="StudentId"]');
                    if (studentIdField && !studentIdField.value) {
                        studentIdField.value = studentId;
                    }
                });
        }, 200);
    }

    // ─── POPULATE FORM FROM get-student-details.php ─────────────────
    function populateFormWithStudentDetails(response) {
        const student = response.student || {};
        const familyStatus = response.family_status || student.family_status || {};
        
        // ── Step 1: Basic student info (from merged account + student_table data) ──
        const basicMap = {
            'StudentId': 'input[name="StudentId"]',
            'id': 'input[name="StudentId"]',  // Fallback to account id
            'LRN': 'input[name="LRN"]',
            'first_name': 'input[name="FirstName"]',
            'FirstName': 'input[name="FirstName"]',
            'last_name': 'input[name="LastName"]',
            'LastName': 'input[name="LastName"]',
            'MiddleName': 'input[name="MiddleName"]',
            'NickName': 'input[name="NickName"]',
            'Sex': 'select[name="Sex"]',
            'Age': 'input[name="Age"]',
            'grade_id': 'select[name="grade_id"]',
            'DateOfBirth': 'input[name="DateOfBirth"]',
            'PlaceOfBirth': 'input[name="PlaceOfBirth"]',
            'ReligionFromBirth': 'input[name="ReligionFromBirth"]',
            'CurrentReligion': 'input[name="CurrentReligion"]',
            'CellphoneNumber': 'input[name="CellphoneNumber"]'
        };
        
        Object.entries(basicMap).forEach(([key, sel]) => {
            const el = document.querySelector(sel);
            if (el && student[key] && student[key] !== '' && student[key] !== null) {
                el.value = student[key];
            }
        });

        const sexField = document.querySelector('select[name="Sex"]');
        const sexValue = student.Sex ?? student.sex ?? student.gender ?? '';
        if (sexField && sexValue !== '') {
            sexField.value = String(sexValue);
        }

        const gradeField = document.querySelector('select[name="grade_id"]');
        const gradeValue = normalizeGradeValue(student.grade_id ?? student.Grade ?? student.grade_level ?? student.GradeId ?? student.grade ?? '', student.grade_name || student.grade_level || '');
        if (gradeField && gradeValue !== '') {
            gradeField.value = String(gradeValue);
        }

        hydrateAddressSection('CurrentAddress', buildStructuredAddressPayload(student, 'CurrentAddress')).catch(error => {
            console.error('Failed to hydrate current address:', error);
        });
        hydrateAddressSection('PermanentAddress', buildStructuredAddressPayload(student, 'PermanentAddress')).catch(error => {
            console.error('Failed to hydrate permanent address:', error);
        });

        syncAgeFromDateOfBirth();

        // ── Step 2: Education ──
        if (Array.isArray(response.education) && response.education.length) {
            const container = document.getElementById('educationContainer');
            container.innerHTML = '';
            eduCount = 0;
            response.education.forEach(edu => {
                const i = eduCount++;
                container.appendChild(buildEducationCard(i, edu));
            });
            updateRemoveButtons('educationContainer');
        }

        // ── Step 3: Organizations ──
        if (Array.isArray(response.organizations) && response.organizations.length) {
            const container = document.getElementById('organizationContainer');
            container.innerHTML = '';
            orgCount = 0;
            response.organizations.forEach(org => {
                const i = orgCount++;
                container.appendChild(buildOrganizationCard(i, org));
            });
            updateRemoveButtons('organizationContainer');
        }

        // ── Step 4: Parents ──
        if (Array.isArray(response.parents) && response.parents.length) {
            const parentMap = {
                'father': 0,
                'mother': 1
            };
            const parentFieldMap = {
                'HighestEducationalAttainment': 'HighestEducationAttained',
                'isDeceased': 'IsDeceased'
            };
            
            response.parents.forEach((parent, idx) => {
                const parentType = idx === 0 ? 'father' : 'mother';
                const fields = ['FirstName', 'MiddleName', 'LastName', 'NickName', 'BirthDate',
                            'PlaceOfBirth', 'Occupation', 'ContactNumber', 'Address',
                            'HighestEducationalAttainment', 'isDeceased'];
                
                fields.forEach(field => {
                    const key = `${parentType}_${field}`;
                    const el = document.querySelector(`[name="${key}"]`);
                    const sourceKey = parentFieldMap[field] || field;
                    if (el && parent[sourceKey]) {
                        el.value = parent[sourceKey];
                    }
                });
            });
        }

        // ── Step 5: Family Status ──
        if (familyStatus && typeof familyStatus === 'object') {
            const familyFields = ['LivingTogether', 'MarriedYet', 'MarriedChurch',
                'TemporarilySepered', 'PermanentlySepered',
                'FatherWithPartner', 'MotherWithPartner'];
            
            familyFields.forEach(f => {
                const el = document.querySelector(`[name="${f}"]`);
                if (el && familyStatus[f] !== undefined && familyStatus[f] !== null && familyStatus[f] !== '') {
                    el.value = familyStatus[f];
                }
            });
        }

        // ── Step 6: Siblings ──
        if (Array.isArray(response.siblings) && response.siblings.length) {
            const container = document.getElementById('siblingsContainer');
            container.innerHTML = '';
            sibCount = 0;
            response.siblings.forEach(sib => {
                const i = sibCount++;
                container.appendChild(buildSiblingCard(i, sib));
            });
            updateRemoveButtons('siblingsContainer');
        }

        // ── Step 6: Guardian ──
        if (Array.isArray(response.guardians) && response.guardians.length > 0) {
            const guardian = response.guardians[0];
            const guardianFields = ['FirstName', 'MiddleName', 'LastName', 'Relationship',
                                    'Address', 'Landline', 'MobileNumber'];
            guardianFields.forEach(f => {
                const el = document.querySelector(`[name="guardian_${f}"]`);
                if (el && guardian[f]) el.value = guardian[f];
            });
        }

        // ── Step 6: Friends ──
        if (Array.isArray(response.friends) && response.friends.length) {
            const container = document.getElementById('friendsContainer');
            container.innerHTML = '';
            friendCount = 0;
            response.friends.forEach(fr => {
                const i = friendCount++;
                container.appendChild(buildFriendCard(i, fr));
            });
            updateRemoveButtons('friendsContainer');
        }

        // Re-apply family status dependencies after populating data
        setupFamilyStatusDependencies();
    }

    // ─── LOAD DATA (manual StudentId change) ──────────────────────
    function loadStudentDataByInputId() {
        const field = document.querySelector('input[name="StudentId"]');
        if (!field || !field.value.trim()) return;

        fetch(`${getApiUrl()}/save-student?StudentId=${encodeURIComponent(field.value.trim())}`)
            .then(r => r.json())
            .then(data => {
                if (data.success && data.data) {
                        populateFormWithData({
                            ...data.data,
                            family_status: data.family_status || {}
                        });
                    markStepsAsComplete();
                    enterUpdateMode();
                    showNotification('✓ Student information loaded successfully!', 'success');
                }
            })
            .catch(err => console.error('Error loading student data:', err));
    }

    // ─── POPULATE FORM ─────────────────────────────────────────────
    function populateFormWithData(d) {
        // ── Step 1: basic fields ──
        const sexValue = d.Sex ?? d.sex ?? d.gender ?? '';
        const gradeValue = normalizeGradeValue(d.grade_id ?? d.Grade ?? d.grade_level ?? d.GradeId ?? d.grade ?? '', d.grade_name || d.grade_level || '');
        const basicMap = {
            StudentId: 'input[name="StudentId"]',
            LRN:       'input[name="LRN"]',
            FirstName: 'input[name="FirstName"]',
            MiddleName:'input[name="MiddleName"]',
            LastName:  'input[name="LastName"]',
            NickName:  'input[name="NickName"]',
            Age:       'input[name="Age"]',
            DateOfBirth:       'input[name="DateOfBirth"]',
            PlaceOfBirth:      'input[name="PlaceOfBirth"]',
            ReligionFromBirth: 'input[name="ReligionFromBirth"]',
            CurrentReligion:   'input[name="CurrentReligion"]',
            CellphoneNumber:   'input[name="CellphoneNumber"]'
        };
        Object.entries(basicMap).forEach(([key, sel]) => {
            const el = document.querySelector(sel);
            if (el && (d[key] !== null && d[key] !== undefined && d[key] !== '')) {
                el.value = d[key];
            }
        });

        const sexField = document.querySelector('select[name="Sex"]');
        if (sexField && sexValue !== '') {
            sexField.value = String(sexValue);
        }

        const gradeField = document.querySelector('select[name="grade_id"]');
        if (gradeField && gradeValue !== '') {
            gradeField.value = String(gradeValue);
        }

        hydrateAddressSection('CurrentAddress', buildStructuredAddressPayload(d, 'CurrentAddress')).catch(error => {
            console.error('Failed to hydrate current address:', error);
        });
        hydrateAddressSection('PermanentAddress', buildStructuredAddressPayload(d, 'PermanentAddress')).catch(error => {
            console.error('Failed to hydrate permanent address:', error);
        });

        syncAgeFromDateOfBirth();

        // ── Step 2: education ──
        if (Array.isArray(d.education) && d.education.length) {
            const container = document.getElementById('educationContainer');
            container.innerHTML = '';
            eduCount = 0;
            d.education.forEach(edu => {
                const i = eduCount++;
                container.appendChild(buildEducationCard(i, edu));
            });
            updateRemoveButtons('educationContainer');
        }

        // ── Step 3: organizations ──
        if (Array.isArray(d.organizations) && d.organizations.length) {
            const container = document.getElementById('organizationContainer');
            container.innerHTML = '';
            orgCount = 0;
            d.organizations.forEach(org => {
                const i = orgCount++;
                container.appendChild(buildOrganizationCard(i, org));
            });
            updateRemoveButtons('organizationContainer');
        }

        // ── Step 4: parents ──
        const parentFields = {
            father: ['FirstName','MiddleName','LastName','NickName','BirthDate',
                    'PlaceOfBirth','Occupation','ContactNumber','Address',
                    'HighestEducationalAttainment','isDeceased'],
            mother: ['FirstName','MiddleName','LastName','NickName','BirthDate',
                    'PlaceOfBirth','Occupation','ContactNumber','Address',
                    'HighestEducationalAttainment','isDeceased']
        };
        Object.entries(parentFields).forEach(([parent, fields]) => {
            fields.forEach(f => {
                const key = `${parent}_${f}`;
                const el  = document.querySelector(`[name="${key}"]`);
                if (el && d[key]) el.value = d[key];
            });
        });

        // ── Step 5: family status ──
        const familySource = d.family_status || d;
        const familyFields = ['LivingTogether','MarriedYet','MarriedChurch',
            'TemporarilySepered','PermanentlySepered',
            'FatherWithPartner','MotherWithPartner'];
        familyFields.forEach(f => {
            const el = document.querySelector(`[name="${f}"]`);
            if (el && familySource[f] !== undefined && familySource[f] !== null && familySource[f] !== '') el.value = familySource[f];
        });

        // ── Step 6: siblings ──
        if (Array.isArray(d.siblings) && d.siblings.length) {
            const container = document.getElementById('siblingsContainer');
            container.innerHTML = '';
            sibCount = 0;
            d.siblings.forEach(sib => {
                const i = sibCount++;
                container.appendChild(buildSiblingCard(i, sib));
            });
            updateRemoveButtons('siblingsContainer');
        }

        // ── Step 6: guardian ──
        const guardianFields = ['FirstName','MiddleName','LastName','Relationship',
                                'Address','Landline','MobileNumber'];
        guardianFields.forEach(f => {
            const el = document.querySelector(`[name="guardian_${f}"]`);
            if (el && d[`guardian_${f}`]) el.value = d[`guardian_${f}`];
        });

        // ── Step 6: friends ──
        if (Array.isArray(d.friends) && d.friends.length) {
            const container = document.getElementById('friendsContainer');
            container.innerHTML = '';
            friendCount = 0;
            d.friends.forEach(fr => {
                const i = friendCount++;
                container.appendChild(buildFriendCard(i, fr));
            });
            updateRemoveButtons('friendsContainer');
        }

        // Re-apply family status dependencies after populating data
        setupFamilyStatusDependencies();
    }

    // ─── UPDATE MODE UI ────────────────────────────────────────────
    function enterUpdateMode() {
        isUpdateMode = true;

        // Show persistent "saved" banner in topbar area
        if (!document.querySelector('.saved-banner')) {
            const banner = document.createElement('div');
            banner.className = 'saved-banner';
            banner.innerHTML = '<i class="fas fa-circle-check"></i> Information already on Save — editing will update your record.';
            banner.style.cssText = `
                background: #dcfce7;
                color: #15803d;
                border-bottom: 1px solid #bbf7d0;
                padding: 10px 32px;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            const topbar = document.querySelector('.topbar');
            if (topbar && topbar.parentNode) {
                topbar.parentNode.insertBefore(banner, topbar.nextSibling);
            }
        }

        // Change submit button text
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn && currentStep === totalSteps) {
            nextBtn.innerHTML = '<i class="fas fa-rotate"></i> Update Information';
        }
    }

    // ─── MARK STEPS COMPLETE ──────────────────────────────────────
    function markStepsAsComplete() {
        for (let step = 1; step <= totalSteps; step++) {
            // NEW selector: .step-panel instead of .step-form
            const panel = document.querySelector(`.step-panel[data-step="${step}"]`);
            if (!panel) continue;
            // Shared with saveCurrentStep() — see panelHasData() for why
            // plain .value truthiness on a <select> is wrong here.
            if (panelHasData(panel)) completedSteps.add(step);
        }
        updateStepIndicator();
    }

    // ─── STEP CLICK LISTENERS ─────────────────────────────────────
    function setupStepClickListeners() {
        const stepItems = document.querySelectorAll('.step-item');
        if (stepItems && stepItems.length > 0) {
            stepItems.forEach(item => {
                if (item) {
                    item.style.cursor = 'pointer';
                    item.addEventListener('click', () => {
                        const target = parseInt(item.getAttribute('data-step'));
                        navigateToStep(target);
                    });
                }
            });
        }
    }

    function navigateToStep(target) {
        if (target === currentStep) return;
        saveCurrentStep();
        currentStep = Math.max(1, Math.min(totalSteps, target));
        updateStepIndicator();
        updateNavigationButtons();
        scrollToTop();
    }

    // ─── CHANGE STEP (Next / Prev buttons) ────────────────────────
    function changeStep(direction) {
        
        // Only validate when going FORWARD (direction === 1)
        // Only validate on the last step before submission
        if (direction === 1 && currentStep === totalSteps && !validateCurrentStep()) {
            return;
        }
        
        saveCurrentStep();
        const newStep = Math.max(1, Math.min(totalSteps, currentStep + direction));
        currentStep = newStep;
        updateStepIndicator();
        updateNavigationButtons();
        
        // Delay scroll to allow animation to start
        setTimeout(() => {
            scrollToTop();
        }, 50);
    }

    // ─── SAVE STEP STATE ──────────────────────────────────────────
    // Whether any field inside a given step's own panel has real user
    // input — shared by saveCurrentStep() and markStepsAsComplete() so the
    // two can't drift apart and re-introduce this same bug independently.
    // <select> fields need selectedIndex (not .value) because several of
    // this form's selects (father_isDeceased/mother_isDeceased) have no
    // blank placeholder option — their first <option> is a real value
    // ("No"), so the browser auto-selects it on page load and .value reads
    // truthy before the user ever touches the field. selectedIndex > 0
    // asks "did the user move it off its default", which is correct
    // whether or not that default happens to be a blank placeholder.
    function panelHasData(panel) {
        const fields = panel.querySelectorAll('input, select, textarea');
        for (const field of fields) {
            if (field.tagName === 'SELECT') {
                if (field.selectedIndex > 0) return true;
            } else if (field.type === 'checkbox' || field.type === 'radio') {
                if (field.checked) return true;
            } else if (field.value && field.value.trim()) {
                return true;
            }
        }
        return false;
    }

    function saveCurrentStep() {
        const panel = document.querySelector(`.step-panel[data-step="${currentStep}"]`);
        if (!panel) return;

        // Scoped to THIS step's own panel only — using FormData on the whole
        // multi-step form here marked every step "completed" (green) the
        // moment ANY other step had data (e.g. Step 1's name fields), since
        // it has no way to tell which step a given field belongs to.
        if (panelHasData(panel)) {
            completedSteps.add(currentStep);
        }
    }

    // ─── STEP INDICATOR UPDATE ────────────────────────────────────
    function updateStepIndicator() {
        try {
            
            // Hide all panels, show current
            const panels = document.querySelectorAll('.step-panel');
            if (panels && panels.length > 0) {
                panels.forEach(p => {
                    if (p) {
                        try {
                            p.classList.remove('active');
                        } catch (e) {
                            console.error('Error removing active class:', e);
                        }
                    }
                });
            }
            
            const active = document.querySelector(`.step-panel[data-step="${currentStep}"]`);
            if (active) {
                active.classList.add('active');
            } else {
                console.warn('Could not find step-panel for step', currentStep);
            }

            // Update step bubbles
            const stepItems = document.querySelectorAll('.step-item');
            if (stepItems && stepItems.length > 0) {
                stepItems.forEach((item, idx) => {
                    try {
                        if (!item) return; // Skip if item is null
                        const n = idx + 1;
                        item.classList.remove('active', 'completed');
                        const bubble = item.querySelector('.step-bubble');

                        if (completedSteps.has(n) && n !== currentStep) {
                            item.classList.add('completed');
                            if (bubble) bubble.innerHTML = '<i class="fas fa-check"></i>';
                        } else if (n === currentStep) {
                            item.classList.add('active');
                            if (bubble) bubble.textContent = n;
                        } else {
                            if (bubble) bubble.textContent = n;
                        }
                    } catch (e) {
                        console.error('Error updating step item:', e);
                    }
                });
            }

            // Progress bar & label
            const fill  = document.getElementById('progressFill');
            const label = document.getElementById('stepLabel');
            if (fill) {
                try {
                    fill.style.width = `${(currentStep / totalSteps) * 100}%`;
                } catch (e) {
                    console.error('Error setting progress bar width:', e);
                }
            }
            if (label) {
                try {
                    label.textContent = `Step ${currentStep} of ${totalSteps}` +
                        (completedSteps.size ? ` · ${completedSteps.size} completed` : '');
                } catch (e) {
                    console.error('Error updating step label:', e);
                }
            }
        } catch (error) {
            console.error('Error in updateStepIndicator:', error);
        }
    }

    // ─── NAV BUTTONS ──────────────────────────────────────────────
    function updateNavigationButtons() {
        try {
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            
            if (!prevBtn) {
                console.error('Previous button not found');
                return;
            }
            if (!nextBtn) {
                console.error('Next button not found');
                return;
            }

            // Handle Previous button
            prevBtn.disabled = currentStep === 1;
            prevBtn.onclick = function(e) { 
                e.preventDefault();
                e.stopPropagation();
                changeStep(-1);
                return false;
            };

            // Handle Next button
            if (currentStep === totalSteps) {
                const label = isUpdateMode ? 'Update Information' : 'Submit Form';
                const icon  = isUpdateMode ? 'fa-rotate' : 'fa-save';
                nextBtn.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
                nextBtn.className = 'btn-nav btn-submit';
                nextBtn.onclick = function(e) { 
                    e.preventDefault();
                    e.stopPropagation();
                    const studentIdField = document.querySelector('input[name="StudentId"]');
                    if (studentIdField && studentIdField.value) {
                        manualSaveChanges();
                    } else {
                        console.error('StudentId field not found or empty');
                        showNotification('Error: StudentId is missing', 'error');
                    }
                    return false;
                };
            } else {
                nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
                nextBtn.className = 'btn-nav btn-next';
                nextBtn.onclick = function(e) { 
                    e.preventDefault();
                    e.stopPropagation();
                    changeStep(1);
                    return false;
                };
            }
        } catch (error) {
            console.error('Error in updateNavigationButtons:', error);
        }
    }

    // ─── VALIDATE ─────────────────────────────────────────────────
    function validateCurrentStep() {
        const panel = document.querySelector(`.step-panel[data-step="${currentStep}"]`);
        if (!panel) {
            console.error('Could not find step panel for step', currentStep);
            return true; // Allow proceeding if panel not found
        }
        let valid = true;
        const requiredFields = panel.querySelectorAll('[required]');
        requiredFields.forEach(f => {
            if (!f.value || !f.value.trim()) { 
                f.classList.add('error'); 
                valid = false; 
            } else { 
                f.classList.remove('error');
            }
        });
        if (!valid) showNotification('Please fill in all required fields.', 'error');
        return valid;
    }

    // ─── SUBMIT ───────────────────────────────────────────────────
    function submitForm(e) {
        if (e) e.preventDefault();
        if (!validateCurrentStep()) return;

        const form = document.getElementById('studentForm');
        const fd   = new FormData(form);

        // ── Basic student data ──
        const studentData = {
            StudentId:        fd.get('StudentId')        || '',
            LRN:              fd.get('LRN')              || '',
            FirstName:        fd.get('FirstName')        || '',
            LastName:         fd.get('LastName')         || '',
            MiddleName:       fd.get('MiddleName')       || '',
            NickName:         fd.get('NickName')         || '',
            Sex:              fd.get('Sex')              || '',
            Age:              fd.get('Age')              || '',
            DateOfBirth:      fd.get('DateOfBirth')      || '',
            PlaceOfBirth:     fd.get('PlaceOfBirth')     || '',
            ReligionFromBirth:fd.get('ReligionFromBirth')|| '',
            CurrentReligion:  fd.get('CurrentReligion')  || '',
            CurrentAddress:   fd.get('CurrentAddress')   || '',
            PermanentAddress: fd.get('PermanentAddress') || '',
            CellphoneNumber:  fd.get('CellphoneNumber')  || '',

            // Parents
            father_FirstName:'', father_MiddleName:'', father_LastName:'',
            father_NickName:'', father_BirthDate:'', father_PlaceOfBirth:'',
            father_Occupation:'', father_ContactNumber:'', father_Address:'',
            father_HighestEducationalAttainment:'', father_isDeceased:'',
            mother_FirstName:'', mother_MiddleName:'', mother_LastName:'',
            mother_NickName:'', mother_BirthDate:'', mother_PlaceOfBirth:'',
            mother_Occupation:'', mother_ContactNumber:'', mother_Address:'',
            mother_HighestEducationalAttainment:'', mother_isDeceased:'',

            // Family status
            LivingTogether:'', MarriedYet:'', MarriedChurch:'',
            TemporarilySepered:'', PermanentlySepered:'',
            FatherWithPartner:'', MotherWithPartner:'',

            // Guardian
            guardian_FirstName:'', guardian_MiddleName:'', guardian_LastName:'',
            guardian_Relationship:'', guardian_Address:'',
            guardian_Landline:'', guardian_MobileNumber:''
        };

        // Fill in all scalar fields from FormData
        for (let [key, val] of fd.entries()) {
            if (key in studentData) studentData[key] = val;
        }

        // ── Dynamic arrays ──
        studentData.education     = collectArray(fd, 'education',     ['GradeLevel','SchoolAttended','InclusiveYes','PlaceAndSchool']);
        studentData.organizations = collectArray(fd, 'organization',  ['OrganizationName','PositionTitle','inCampus']);
        studentData.siblings      = collectArray(fd, 'sibling',       ['FirstName','MiddleName','LastName','NickName','Age','BirthOrder','SchoolId']);
        studentData.friends       = collectArray(fd, 'friend',        ['In_school','FirstName','MiddleName','LastName']);

        // Required field check
        const required = ['StudentId','LRN','FirstName','LastName','Sex','Age','DateOfBirth'];
        const missing  = required.filter(k => !studentData[k].trim());
        if (missing.length) {
            showNotification(`Required fields missing: ${missing.join(', ')}`, 'error');
            return;
        }

        fetch(`${getApiUrl()}/save-student`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(studentData)
        })
        .then(r => r.text().then(text => {
            try { return { status: r.status, data: JSON.parse(text) }; }
            catch { return { status: r.status, data: { success: false, message: text } }; }
        }))
        .then(result => {
            if (!result.data.success) {
                showNotification(result.data.message || 'Error saving information.', 'error');
                return;
            }
            const msg = result.data.action === 'update'
                ? '✓ Student information updated successfully!'
                : '✓ Student information saved successfully!';
            showNotification(msg, 'success');
            enterUpdateMode();
            
            // Get StudentId from the form and reload data
            const studentIdField = document.querySelector('input[name="StudentId"]');
            if (studentIdField && studentIdField.value) {
                setTimeout(() => {
                    // Reload and populate form with all saved data
                    fetch(`${getApiUrl()}/save-student?StudentId=${encodeURIComponent(studentIdField.value)}`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.success && data.data) {
                                populateFormWithData({
                                    ...data.data,
                                    family_status: data.family_status || {}
                                });
                                markStepsAsComplete();
                                // Go to Step 1
                                currentStep = 1;
                                updateStepIndicator();
                                updateNavigationButtons();
                                scrollToTop();
                                showNotification('✓ All your information is loaded. You are back on Step 1.', 'success');
                            }
                        })
                        .catch(err => console.error('Error reloading student data:', err));
                }, 500);
            }
        })
        .catch(err => showNotification('Error: ' + err.message, 'error'));
    }

    // ─── HELPER: collect indexed FormData arrays ──────────────────
    function collectArray(fd, prefix, fields) {
        const result = [];
        let i = 0;
        while (true) {
            const obj = {};
            let found = false;
            fields.forEach(f => {
                const val = fd.get(`${prefix}[${i}][${f}]`);
                if (val !== null) { obj[f] = val; found = true; }
            });
            if (!found) break;
            result.push(obj);
            i++;
        }
        return result;
    }

    // ─── SCROLL ───────────────────────────────────────────────────
    function scrollToTop() {
        const w = document.querySelector('.wizard');
        if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ─── NOTIFICATION ─────────────────────────────────────────────
    function showNotification(message, type = 'info') {
        const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6' };
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            padding: 14px 20px; border-radius: 10px;
            background: ${colors[type] || colors.info};
            color: white; font-size: 13px; font-weight: 600;
            box-shadow: 0 8px 24px rgba(0,0,0,0.18);
            display: flex; align-items: center; gap: 8px;
            animation: ntfIn 0.3s ease;
            font-family: 'Plus Jakarta Sans', sans-serif;
            max-width: 360px;
        `;
        const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
        el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.animation = 'ntfOut 0.3s ease forwards'; setTimeout(() => el.remove(), 300); }, 3500);
    }

    // ─── CONFIRMATION DIALOG ──────────────────────────────────────
    function showConfirmationDialog(title, message, onConfirm) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            animation: fadeIn 0.2s ease;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white; border-radius: 16px; padding: 32px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.25);
            max-width: 420px; width: 90%; font-family: 'Plus Jakarta Sans', sans-serif;
            animation: scaleIn 0.2s ease;
        `;

        dialog.innerHTML = `
            <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #1f2937; font-weight: 700;">${title}</h2>
            <p style="margin: 0 0 28px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">${message}</p>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="confirmCancel" style="
                    padding: 10px 20px; border: 1px solid #d8e0ea; background: white;
                    border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600;
                    color: #16233a; transition: all 0.3s ease;
                ">Cancel</button>
                <button id="confirmSave" style="
                    padding: 10px 24px; background: #1b7f5a; color: white;
                    border: none; border-radius: 8px; cursor: pointer; font-size: 14px;
                    font-weight: 600; transition: all 0.3s ease;
                ">Save</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Add hover effects
        const cancelBtn = dialog.querySelector('#confirmCancel');
        const saveBtn = dialog.querySelector('#confirmSave');

        cancelBtn.addEventListener('mouseover', () => {
            cancelBtn.style.background = '#f5f7fa';
            cancelBtn.style.borderColor = '#8494a7';
        });
        cancelBtn.addEventListener('mouseout', () => {
            cancelBtn.style.background = 'white';
            cancelBtn.style.borderColor = '#d8e0ea';
        });

        saveBtn.addEventListener('mouseover', () => {
            saveBtn.style.background = '#15633f';
            saveBtn.style.boxShadow = '0 4px 12px rgba(27, 127, 90, 0.4)';
        });
        saveBtn.addEventListener('mouseout', () => {
            saveBtn.style.background = '#1b7f5a';
            saveBtn.style.boxShadow = 'none';
        });

        cancelBtn.addEventListener('click', () => {
            overlay.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => overlay.remove(), 200);
        });

        saveBtn.addEventListener('click', () => {
            overlay.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => {
                overlay.remove();
                onConfirm();
            }, 200);
        });
    }

    // Notification & Dialog keyframes injected once
    const ntfStyle = document.createElement('style');
    ntfStyle.textContent = `
        @keyframes ntfIn  { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
        @keyframes ntfOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(40px); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        input.error, select.error { border-color: #ef4444 !important; background-color: #fef2f2 !important; }
    `;
    document.head.appendChild(ntfStyle);

    // ─── DYNAMIC SECTION BUILDERS ─────────────────────────────────

    // ── Education ──
    function buildEducationCard(i, data = {}) {
        const div = document.createElement('div');
        div.className = 'dyn-card';
        div.innerHTML = `
            <div class="dyn-card-header">
                <span class="dyn-card-title">School Record #${i + 1}</span>
                <button type="button" class="btn-remove" onclick="this.closest('.dyn-card').remove(); updateRemoveButtons('educationContainer')">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
            <div class="field-grid education-grid">
                <div class="field-group">
                    <label>Grade Level</label>
                    <input type="text" name="education[${i}][GradeLevel]" placeholder="e.g., Grade 7" value="${data.GradeLevel || ''}">
                </div>
                <div class="field-group">
                    <label>School Attended</label>
                    <input type="text" name="education[${i}][SchoolAttended]" value="${data.SchoolAttended || ''}">
                </div>
                <div class="field-group">
                    <label>Inclusive Years</label>
                    <input type="text" name="education[${i}][InclusiveYes]" placeholder="e.g., 2020–2024" value="${data.InclusiveYes || ''}">
                </div>
                <div class="field-group education-plan-field">
                    <label>Plan After High School</label>
                    <textarea name="education[${i}][PlaceAndSchool]">${data.PlaceAndSchool || ''}</textarea>
                </div>
            </div>`;
        return div;
    }

    function addEducation() {
        const i   = eduCount++;
        const card = buildEducationCard(i);
        document.getElementById('educationContainer').appendChild(card);
        updateRemoveButtons('educationContainer');
    }

    // ── Organization ──
    function buildOrganizationCard(i, data = {}) {
        const div = document.createElement('div');
        div.className = 'dyn-card';
        div.innerHTML = `
            <div class="dyn-card-header">
                <span class="dyn-card-title">Organization #${i + 1}</span>
                <button type="button" class="btn-remove" onclick="this.closest('.dyn-card').remove(); updateRemoveButtons('organizationContainer')">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
            <div class="field-grid organization-grid">
                <div class="field-group">
                    <label>Organization Name</label>
                    <input type="text" name="organization[${i}][OrganizationName]" value="${data.OrganizationName || ''}">
                </div>
                <div class="field-group">
                    <label>Position / Title</label>
                    <input type="text" name="organization[${i}][PositionTitle]" value="${data.PositionTitle || ''}">
                </div>
                <div class="field-group">
                    <label>In Campus?</label>
                    <select name="organization[${i}][inCampus]">
                        <option value="">Select</option>
                        <option value="Yes" ${data.inCampus === 'Yes' ? 'selected' : ''}>Yes</option>
                        <option value="No"  ${data.inCampus === 'No'  ? 'selected' : ''}>No</option>
                    </select>
                </div>
            </div>`;
        return div;
    }

    function addOrganization() {
        const i   = orgCount++;
        const card = buildOrganizationCard(i);
        document.getElementById('organizationContainer').appendChild(card);
        updateRemoveButtons('organizationContainer');
    }

    // ── Sibling ──
    function buildSiblingCard(i, data = {}) {
        const div = document.createElement('div');
        div.className = 'dyn-card';
        div.innerHTML = `
            <div class="dyn-card-header">
                <span class="dyn-card-title">Sibling #${i + 1}</span>
                <button type="button" class="btn-remove" onclick="this.closest('.dyn-card').remove(); updateRemoveButtons('siblingsContainer')">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
            <div class="sibling-row">
                <div class="field-group">
                    <label>First Name</label>
                    <input type="text" name="sibling[${i}][FirstName]" value="${data.FirstName || ''}">
                </div>
                <div class="field-group">
                    <label>Middle Name</label>
                    <input type="text" name="sibling[${i}][MiddleName]" value="${data.MiddleName || ''}">
                </div>
                <div class="field-group">
                    <label>Last Name</label>
                    <input type="text" name="sibling[${i}][LastName]" value="${data.LastName || ''}">
                </div>
                <div class="field-group">
                    <label>Nickname</label>
                    <input type="text" name="sibling[${i}][NickName]" value="${data.NickName || ''}">
                </div>
                <div class="field-group">
                    <label>Age</label>
                    <input type="number" name="sibling[${i}][Age]" value="${data.Age || ''}">
                </div>
                <div class="field-group">
                    <label>Birth Order</label>
                    <input type="text" name="sibling[${i}][BirthOrder]" placeholder="e.g., 1st, 2nd" value="${data.BirthOrder || ''}">
                </div>
                <div class="field-group">
                    <label>School ID</label>
                    <input type="text" name="sibling[${i}][SchoolId]" value="${data.SchoolId || ''}">
                </div>
            </div>`;
        return div;
    }

    function addSibling() {
        const i    = sibCount++;
        const card  = buildSiblingCard(i);
        document.getElementById('siblingsContainer').appendChild(card);
        updateRemoveButtons('siblingsContainer');
    }

    // ── Friend ──
    function buildFriendCard(i, data = {}) {
        const div = document.createElement('div');
        div.className = 'dyn-card';
        div.innerHTML = `
            <div class="dyn-card-header">
                <span class="dyn-card-title">Friend #${i + 1}</span>
                <button type="button" class="btn-remove" onclick="this.closest('.dyn-card').remove(); updateRemoveButtons('friendsContainer')">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
            <div class="friend-row">
                <div class="field-group">
                    <label>In School?</label>
                    <select name="friend[${i}][In_school]">
                        <option value="">Select</option>
                        <option value="Yes" ${data.In_school === 'Yes' ? 'selected' : ''}>Yes</option>
                        <option value="No"  ${data.In_school === 'No'  ? 'selected' : ''}>No</option>
                    </select>
                </div>
                <div class="field-group">
                    <label>First Name</label>
                    <input type="text" name="friend[${i}][FirstName]" value="${data.FirstName || ''}">
                </div>
                <div class="field-group">
                    <label>Middle Name</label>
                    <input type="text" name="friend[${i}][MiddleName]" value="${data.MiddleName || ''}">
                </div>
                <div class="field-group">
                    <label>Last Name</label>
                    <input type="text" name="friend[${i}][LastName]" value="${data.LastName || ''}">
                </div>
            </div>`;
        return div;
    }

    function addFriend() {
        const i    = friendCount++;
        const card  = buildFriendCard(i);
        document.getElementById('friendsContainer').appendChild(card);
        updateRemoveButtons('friendsContainer');
    }

    // ─── REMOVE BUTTONS VISIBILITY ────────────────────────────────
    function updateRemoveButtons(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const cards   = container.querySelectorAll('.dyn-card');
        const btns    = container.querySelectorAll('.btn-remove');
        btns.forEach(btn => { btn.style.display = cards.length > 1 ? 'inline-flex' : 'none'; });
    }

    // ─── FAMILY STATUS FIELD DEPENDENCIES ──────────────────────────
    function setupFamilyStatusDependencies() {
        const livingTogetherEl = document.querySelector('[name="LivingTogether"]');
        const tempSeparatedEl = document.querySelector('[name="TemporarilySepered"]');
        const permSeparatedEl = document.querySelector('[name="PermanentlySepered"]');
        const fatherPartnerEl = document.querySelector('[name="FatherWithPartner"]');
        const motherPartnerEl = document.querySelector('[name="MotherWithPartner"]');

        if (!livingTogetherEl || !tempSeparatedEl || !permSeparatedEl) return;

        // Function to disable conflicting options
        const updateFamilyStatus = () => {
            // Living Together, Temporarily Separated, Permanently Separated - mutually exclusive
            if (livingTogetherEl.value === 'Yes') {
                tempSeparatedEl.disabled = true;
                permSeparatedEl.disabled = true;
                tempSeparatedEl.value = '';
                permSeparatedEl.value = '';
            } else if (tempSeparatedEl.value === 'Yes') {
                livingTogetherEl.disabled = true;
                permSeparatedEl.disabled = true;
                livingTogetherEl.value = '';
                permSeparatedEl.value = '';
            } else if (permSeparatedEl.value === 'Yes') {
                livingTogetherEl.disabled = true;
                tempSeparatedEl.disabled = true;
                livingTogetherEl.value = '';
                tempSeparatedEl.value = '';
            } else {
                livingTogetherEl.disabled = false;
                tempSeparatedEl.disabled = false;
                permSeparatedEl.disabled = false;
            }
        };

        // Attach event listeners
        livingTogetherEl.addEventListener('change', updateFamilyStatus);
        tempSeparatedEl.addEventListener('change', updateFamilyStatus);
        permSeparatedEl.addEventListener('change', updateFamilyStatus);

        // Initial state update
        updateFamilyStatus();
    }

    // ─── LOGOUT ───────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', () => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', requestLogout);
        }

        // Clear error on input
        document.querySelectorAll('[required]').forEach(f => {
            f.addEventListener('input', () => { if (f.value.trim()) f.classList.remove('error'); });
        });

        // Setup family status dependencies
        setupFamilyStatusDependencies();
    });
