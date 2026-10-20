<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document Library - Guidance System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style>
        .document-container {
            width: 100%;
        }

        .upload-modal-body {
            text-align: left;
            padding: 24px;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--text-color);
        }

        .form-group select,
        .form-group input[type="text"],
        .form-group textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
        }

        .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }

        .file-input-wrapper {
            position: relative;
            overflow: hidden;
            display: inline-block;
            width: 100%;
        }

        .file-input-label {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
            border: 2px dashed #3b82f6;
            border-radius: 8px;
            background: #f0f9ff;
            cursor: pointer;
            transition: var(--transition);
            color: #3b82f6;
            font-weight: 600;
        }

        .file-input-label:hover {
            background: #e0f2fe;
            border-color: #2563eb;
        }

        .file-input-label i {
            margin-right: 10px;
            font-size: 24px;
        }

        input[type="file"] {
            display: none;
        }

        .upload-btn {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            padding: 10px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: var(--transition);
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .upload-btn:hover {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            transform: translateY(-2px);
        }

        .upload-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .documents-section {
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: var(--shadow);
        }

        .documents-section h3 {
            color: var(--primary-color);
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .document-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 0;
            flex-wrap: wrap;
        }

        .document-tab {
            padding: 12px 20px;
            border: none;
            background: none;
            cursor: pointer;
            color: #64748b;
            font-weight: 600;
            border-bottom: 3px solid transparent;
            transition: var(--transition);
        }

        .document-tab.active {
            color: #3b82f6;
            border-bottom-color: #3b82f6;
        }

        .document-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
        }

        .document-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
            transition: var(--transition);
            position: relative;
        }

        .document-card:hover {
            box-shadow: var(--shadow);
            border-color: #cbd5e1;
        }

        .document-icon {
            font-size: 48px;
            color: #3b82f6;
            margin-bottom: 10px;
            text-align: center;
        }

        .document-name {
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 8px;
            word-break: break-word;
            font-size: 13px;
        }

        .document-meta {
            font-size: 12px;
            color: #64748b;
            margin-bottom: 12px;
        }

        .document-actions {
            display: flex;
            gap: 8px;
            justify-content: center;
        }

        .doc-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: var(--transition);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .doc-btn-view {
            background: #e0f2fe;
            color: #0369a1;
        }

        .doc-btn-view:hover {
            background: #bae6fd;
        }

        .doc-btn-delete {
            background: #fee2e2;
            color: #dc2626;
        }

        .doc-btn-delete:hover {
            background: #fecaca;
        }

        .empty-state {
            text-align: center;
            padding: 48px 24px;
            color: #94a3b8;
        }

        .empty-state i {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state p {
            font-size: 14px;
        }

        /* ── Student Documents tab (counselor feature) ── */
        .search-section {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 20px;
        }

        .search-input {
            flex: 1;
            min-width: 200px;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-family: inherit;
        }

        .search-btn {
            background: #3b82f6;
            color: white;
            padding: 10px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: var(--transition);
        }

        .search-btn:hover {
            background: #2563eb;
        }

        .documents-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
        }

        .documents-table th {
            background: #f1f5f9;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: var(--primary-color);
            border-bottom: 2px solid #e2e8f0;
            font-size: 13px;
            text-transform: uppercase;
        }

        .documents-table td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
        }

        .documents-table tr:hover {
            background: #f8fafc;
        }

        .doc-type-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge-inventory {
            background: #dbeafe;
            color: #1e40af;
        }

        .badge-referral {
            background: #fce7f3;
            color: #be185d;
        }

        .badge-follow-up {
            background: #dbeafe;
            color: #0369a1;
        }

        .badge-case {
            background: #fecdd3;
            color: #7c1c2f;
        }

        .action-buttons {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: var(--transition);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .btn-view {
            background: #e0f2fe;
            color: #0369a1;
        }

        .btn-view:hover {
            background: #bae6fd;
        }

        .btn-delete {
            background: #fee2e2;
            color: #dc2626;
        }

        .btn-delete:hover {
            background: #fecaca;
        }

        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.3s ease;
        }

        .modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: white;
            padding: 0;
            border-radius: 8px;
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow: auto;
        }

        .modal-header {
            padding: 20px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #64748b;
        }

        .modal-body {
            padding: 20px;
            text-align: center;
        }

        .modal-body img {
            max-width: 100%;
            max-height: 80vh;
            object-fit: contain;
        }

        .upload-progress {
            margin-top: 16px;
            display: none;
        }

        .progress-bar {
            width: 100%;
            height: 6px;
            background: #e2e8f0;
            border-radius: 3px;
            overflow: hidden;
        }

        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #2563eb);
            width: 0%;
            transition: width 0.3s ease;
        }

        @media (max-width: 768px) {
            .form-row {
                grid-template-columns: 1fr;
            }

            .document-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            }

            .upload-modal-body,
            .documents-section {
                padding: 16px;
            }

            .form-group {
                margin-bottom: 12px;
            }

            .document-tabs {
                flex-wrap: nowrap;
                overflow-x: auto;
            }

            .document-tab {
                padding: 10px 16px;
                font-size: 13px;
                white-space: nowrap;
            }

            .search-section {
                flex-direction: column;
            }

            .documents-table {
                font-size: 12px;
            }

            .documents-table th,
            .documents-table td {
                padding: 8px;
            }

            .action-buttons {
                flex-direction: column;
            }

            .action-btn {
                width: 100%;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-other-school')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-folder-check"></i> Resources</div>
                    <h2 class="page-hero-title">Document Library</h2>
                    <p class="page-hero-text">The school-wide document library (Coordinator) and per-student document search (Counselor), both in one place.</p>
                </div>
                <button type="button" class="btn btn-primary" id="openUploadBtn">
                    <i class="fas fa-upload"></i> Upload File
                </button>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div class="document-container">
                    <!-- Documents Section -->
                    <div class="documents-section">
                        <div class="document-tabs" id="docSectionTabs">
                            <button type="button" class="document-tab active" data-section="library"><i class="fas fa-folder"></i> School Library</button>
                            <button type="button" class="document-tab" data-section="student"><i class="fas fa-user"></i> Student Documents</button>
                        </div>

                        <!-- School Library (Coordinator feature) — every document uploaded for this school -->
                        <div id="librarySection">
                            <div id="documentGrid" class="document-grid">
                                <!-- Documents will be loaded here -->
                            </div>
                        </div>

                        <!-- Student Documents (Counselor feature) — per-student document search -->
                        <div id="studentSection" style="display: none;">
                            <div class="search-section">
                                <input type="text" id="studentSearch" class="search-input" placeholder="Search by Student ID or Name...">
                                <button class="search-btn" onclick="searchDocuments()">
                                    <i class="fas fa-search"></i> Search
                                </button>
                            </div>
                            <table class="documents-table" id="documentsTable">
                                <thead>
                                    <tr>
                                        <th>Student ID</th>
                                        <th>Document Type</th>
                                        <th>File Name</th>
                                        <th>Uploaded</th>
                                        <th>Size</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="tableBody">
                                    <tr>
                                        <td colspan="6" class="empty-state">
                                            <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 8px;"></i>
                                            <p>Search for a student to view their documents</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Upload Document Modal — shared by both tabs; the Student ID/Document
         Type fields only appear (and are only required) when uploading from
         the Student Documents tab, matching the counselor's own flow. -->
    <div id="uploadModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h4 id="uploadModalTitle"><i class="fas fa-cloud-upload-alt"></i> Upload Document</h4>
                <button class="modal-close" onclick="hideUploadForm()">&times;</button>
            </div>
            <div class="modal-body upload-modal-body">
                <form id="uploadForm">
                    <div class="form-row" id="studentFieldsRow" style="display: none;">
                        <div class="form-group">
                            <label for="uploadStudentId">Student ID <span style="color: #ef4444;">*</span></label>
                            <input type="text" id="uploadStudentId" name="student_id" placeholder="e.g., 22">
                        </div>

                        <div class="form-group">
                            <label for="documentType">Document Type <span style="color: #ef4444;">*</span></label>
                            <select id="documentType" name="document_type">
                                <option value="">Select Document Type</option>
                                <option value="inventory">Individual Inventory Form</option>
                                <option value="referral">Referral Form</option>
                                <option value="follow-up">Follow-up Form</option>
                                <option value="case">Case Document</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="fileInput">Select Image File <span style="color: #ef4444;">*</span></label>
                        <div class="file-input-wrapper">
                            <label for="fileInput" class="file-input-label">
                                <i class="fas fa-image"></i>
                                <span>Click to select or drag and drop images (JPG, PNG)</span>
                            </label>
                            <input type="file" id="fileInput" name="file" accept="image/*" required>
                        </div>
                        <small style="color: #64748b; margin-top: 8px; display: block;">
                            Max file size: 10MB | Supported: JPG, PNG, GIF, WebP
                        </small>
                    </div>

                    <div class="form-group">
                        <label for="description">Description (Optional)</label>
                        <textarea id="description" name="description" placeholder="Add any notes or description..."></textarea>
                    </div>

                    <button type="submit" class="upload-btn">
                        <i class="fas fa-upload"></i> Upload Document
                    </button>

                    <div class="upload-progress">
                        <div class="progress-bar">
                            <div class="progress-bar-fill"></div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Image Preview Modal -->
    <div id="previewModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h4>Document Preview</h4>
                <button class="modal-close" onclick="closePreview()">&times;</button>
            </div>
            <div class="modal-body">
                <img id="previewImage" src="" alt="Document preview">
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script>
        // Which tab is active — decides what the shared Upload modal asks
        // for and which list gets refreshed after a successful upload.
        let activeSection = 'library';

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            setupUserInfo();
            setupEventListeners();
            loadDocuments();
        });

        // login.php only ever stores one JSON blob under 'user' (see
        // js/auth.js) — there is no flat 'userType'/'schoolAttended'/
        // 'userId' sessionStorage key anywhere in the app. Reading those
        // directly (as this page used to) always returns null, so every
        // request below silently sent an empty school_attended/user_id.
        function getCurrentUser() {
            try {
                return JSON.parse(sessionStorage.getItem('user') || sessionStorage.getItem('userInfo') || '{}');
            } catch (err) {
                return {};
            }
        }

        // Setup user info
        function setupUserInfo() {
            renderSidebarAvatar();

            const user = JSON.parse(localStorage.getItem('currentUser') || '{}') || JSON.parse(sessionStorage.getItem('user') || '{}');
            const userName = user.name || sessionStorage.getItem('userName');
            const userRole = user.role || sessionStorage.getItem('userRole');
            const userNameElement = document.getElementById('userName');
            const userRoleElement = document.getElementById('userRole');
            const userAvatar = document.getElementById('userAvatar');

            if (userName) {
                if (userNameElement) userNameElement.textContent = userName;
                if (userRoleElement) {
                    userRoleElement.textContent = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1).replace('-', ' ') : 'Coordinator';
                }
                const initials = userName.split(' ').map(n => n.charAt(0)).join('').toUpperCase();
                if (userAvatar) userAvatar.textContent = initials;
            }
        }

        // Setup event listeners
        function setupEventListeners() {
            // Upload modal toggle
            document.getElementById('openUploadBtn').addEventListener('click', openUploadForm);
            document.getElementById('uploadModal').addEventListener('click', (e) => {
                if (e.target.id === 'uploadModal') hideUploadForm();
            });

            // Upload form
            document.getElementById('uploadForm').addEventListener('submit', handleUpload);

            // File input drag and drop
            const fileInput = document.getElementById('fileInput');
            const fileInputLabel = document.querySelector('.file-input-label');

            fileInputLabel.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileInputLabel.style.background = '#e0f2fe';
                fileInputLabel.style.borderColor = '#2563eb';
            });

            fileInputLabel.addEventListener('dragleave', () => {
                fileInputLabel.style.background = '#f0f9ff';
                fileInputLabel.style.borderColor = '#3b82f6';
            });

            fileInputLabel.addEventListener('drop', (e) => {
                e.preventDefault();
                fileInputLabel.style.background = '#f0f9ff';
                fileInputLabel.style.borderColor = '#3b82f6';

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    fileInput.files = files;
                    updateFileInputLabel(files[0]);
                }
            });

            // Selecting via the native file dialog (label click) only fires
            // 'change' on the input, not 'drop' — without this the label
            // text never updates so a click-selected file looks like nothing
            // happened, even though fileInput.files is actually populated.
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) updateFileInputLabel(fileInput.files[0]);
            });

            // School Library / Student Documents tabs
            document.querySelectorAll('#docSectionTabs .document-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('#docSectionTabs .document-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    activeSection = tab.dataset.section;
                    document.getElementById('librarySection').style.display = activeSection === 'library' ? '' : 'none';
                    document.getElementById('studentSection').style.display = activeSection === 'student' ? '' : 'none';
                });
            });

            // Logout
            document.getElementById('logoutBtn').addEventListener('click', logout);
        }

        // Show upload modal — the Student ID/Document Type fields only show
        // (and are only required) when uploading from the Student
        // Documents tab, matching the counselor's own upload flow exactly;
        // the School Library tab uploads a general school resource, same
        // as the coordinator's own flow.
        function openUploadForm() {
            const studentFieldsRow = document.getElementById('studentFieldsRow');
            const studentIdInput = document.getElementById('uploadStudentId');
            const documentTypeSelect = document.getElementById('documentType');
            const titleEl = document.getElementById('uploadModalTitle');

            if (activeSection === 'student') {
                studentFieldsRow.style.display = 'grid';
                studentIdInput.required = true;
                documentTypeSelect.required = true;
                titleEl.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload Document for Student';
                const searched = document.getElementById('studentSearch').value.trim();
                if (searched) studentIdInput.value = searched;
            } else {
                studentFieldsRow.style.display = 'none';
                studentIdInput.required = false;
                documentTypeSelect.required = false;
                titleEl.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload Document';
            }

            document.getElementById('uploadModal').classList.add('show');
        }

        // Hide upload modal
        function hideUploadForm() {
            document.getElementById('uploadModal').classList.remove('show');
            resetFileInputLabel();
        }

        // Swaps the dropzone's placeholder text/icon for the picked file's
        // name so selecting a file (click OR drag-drop) gives visible
        // confirmation instead of silently leaving the placeholder text up.
        function updateFileInputLabel(file) {
            const label = document.querySelector('.file-input-label');
            const icon = label.querySelector('i');
            const span = label.querySelector('span');
            icon.classList.remove('fa-image');
            icon.classList.add('fa-check-circle');
            span.textContent = file.name;
            label.style.background = '#f0fdf4';
            label.style.borderColor = '#22c55e';
            label.style.color = '#15803d';
        }

        function resetFileInputLabel() {
            const label = document.querySelector('.file-input-label');
            const icon = label.querySelector('i');
            const span = label.querySelector('span');
            icon.classList.remove('fa-check-circle');
            icon.classList.add('fa-image');
            span.textContent = 'Click to select or drag and drop images (JPG, PNG)';
            label.style.background = '#f0f9ff';
            label.style.borderColor = '#3b82f6';
            label.style.color = '#3b82f6';
        }

        // Handle file upload — a general school resource (School Library
        // tab) needs only the file itself (+ optional notes); a per-student
        // document (Student Documents tab) additionally needs Student ID +
        // Document Type.
        async function handleUpload(e) {
            e.preventDefault();

            const form = document.getElementById('uploadForm');
            const fileInput = document.getElementById('fileInput');
            const description = document.getElementById('description').value;
            const uploadBtn = form.querySelector('.upload-btn');
            const progressDiv = form.querySelector('.upload-progress');

            if (!fileInput.files.length) {
                showNotification('Please select a file to upload', 'error');
                return;
            }

            let studentId = '';
            let documentType = '';
            if (activeSection === 'student') {
                studentId = document.getElementById('uploadStudentId').value.trim();
                documentType = document.getElementById('documentType').value;
                if (!studentId || !documentType) {
                    showNotification('Please fill in all required fields', 'error');
                    return;
                }
            }

            const currentUser = getCurrentUser();
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('description', description);
            formData.append('user_type', currentUser.user_type || currentUser.role || '');
            formData.append('school_attended', currentUser.school_attended || '');
            formData.append('user_id', currentUser.id || '');
            if (activeSection === 'student') {
                formData.append('student_id', studentId);
                formData.append('document_type', documentType);
            }

            uploadBtn.disabled = true;
            progressDiv.style.display = 'block';

            try {
                const response = await fetch('../../api/upload-document', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    showNotification('Document uploaded successfully!', 'success');
                    form.reset();
                    fileInput.value = '';
                    resetFileInputLabel();
                    progressDiv.style.display = 'none';
                    hideUploadForm();
                    if (activeSection === 'student') {
                        document.getElementById('studentSearch').value = studentId;
                        searchDocuments();
                    } else {
                        loadDocuments();
                    }
                } else {
                    showNotification(data.message || 'Upload failed', 'error');
                }
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            } finally {
                uploadBtn.disabled = false;
                progressDiv.style.display = 'none';
            }
        }

        // ── School Library (Coordinator feature) ──────────────────────
        // Loads every document uploaded for this school — no student_id
        // param means api/list-documents returns the whole school's
        // library instead of scoping to one student.
        async function loadDocuments() {
            const currentUser = getCurrentUser();
            const userType = currentUser.user_type || currentUser.role || '';
            const schoolAttended = currentUser.school_attended || '';

            try {
                const response = await fetch(`../../api/list-documents?user_type=${userType}&school_attended=${schoolAttended}`);
                const data = await response.json();

                if (data.success && data.documents.length > 0) {
                    displayDocuments(data.documents);
                } else {
                    showEmptyState('No documents yet');
                }
            } catch (error) {
                console.error('Error loading documents:', error);
                showEmptyState('Error loading documents');
            }
        }

        function displayDocuments(documents) {
            const grid = document.getElementById('documentGrid');
            grid.innerHTML = '';

            const docTypeIcons = {
                'inventory': 'fa-id-card',
                'referral': 'fa-clipboard',
                'follow-up': 'fa-tasks',
                'case': 'fa-briefcase'
            };

            documents.forEach(doc => {
                const card = document.createElement('div');
                card.className = 'document-card';

                const icon = doc.document_type ? (docTypeIcons[doc.document_type] || 'fa-file') : 'fa-file';
                const uploadDate = new Date(doc.uploaded_at).toLocaleDateString();
                const typeLabel = doc.document_type ? `<div><strong>${doc.document_type.replace('-', ' ').toUpperCase()}</strong></div>` : '';

                card.innerHTML = `
                    <div class="document-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="document-name">${doc.original_filename}</div>
                    <div class="document-meta">
                        ${typeLabel}
                        <div>${uploadDate}</div>
                        <div style="font-size: 11px; margin-top: 4px;">${(doc.file_size / 1024).toFixed(2)} KB</div>
                    </div>
                    ${doc.description ? `<div class="document-meta">${doc.description}</div>` : ''}
                    <div class="document-actions">
                        <button class="doc-btn doc-btn-view" onclick="viewDocument(${doc.document_id})">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="doc-btn doc-btn-delete" onclick="deleteDocument(${doc.document_id})">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function showEmptyState(message = 'No documents yet') {
            document.getElementById('documentGrid').innerHTML = `
                <div style="grid-column: 1/-1;">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>${message}</p>
                    </div>
                </div>
            `;
        }

        // ── Student Documents (Counselor feature) ──────────────────────
        async function searchDocuments() {
            const studentId = document.getElementById('studentSearch').value.trim();

            if (!studentId) {
                showNotification('Please enter a Student ID', 'error');
                return;
            }

            const currentUser = getCurrentUser();
            const userType = currentUser.user_type || currentUser.role || '';
            const schoolAttended = currentUser.school_attended || '';

            try {
                const response = await fetch(`../../api/list-documents?student_id=${studentId}&user_type=${userType}&school_attended=${schoolAttended}`);
                const data = await response.json();

                if (data.success && data.documents.length > 0) {
                    displayStudentDocuments(data.documents);
                } else {
                    showNotification('No documents found for this student', 'info');
                    clearTable();
                }
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            }
        }

        function displayStudentDocuments(documents) {
            const tbody = document.getElementById('tableBody');
            tbody.innerHTML = '';

            const docTypeLabels = {
                'inventory': 'Individual Inventory',
                'referral': 'Referral Form',
                'follow-up': 'Follow-up Form',
                'case': 'Case Document'
            };

            documents.forEach(doc => {
                const uploadDate = new Date(doc.uploaded_at).toLocaleDateString();
                const sizeKB = (doc.file_size / 1024).toFixed(2);
                const docType = docTypeLabels[doc.document_type] || doc.document_type;
                const badgeClass = `badge-${doc.document_type}`;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${doc.student_id}</strong></td>
                    <td><span class="doc-type-badge ${badgeClass}">${docType}</span></td>
                    <td>${doc.original_filename}</td>
                    <td>${uploadDate}</td>
                    <td>${sizeKB} KB</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn btn-view" onclick="viewDocument(${doc.document_id})">
                                <i class="fas fa-eye"></i> View
                            </button>
                            <button class="action-btn btn-delete" onclick="deleteDocument(${doc.document_id})">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }

        function clearTable() {
            document.getElementById('tableBody').innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <i class="fas fa-inbox" style="font-size: 24px; margin-bottom: 8px;"></i>
                        <p>No documents found</p>
                    </td>
                </tr>
            `;
        }

        // ── Shared: view / delete / preview ─────────────────────────────
        function viewDocument(documentId) {
            const currentUser = getCurrentUser();
            const userType = currentUser.user_type || currentUser.role || '';
            const schoolAttended = currentUser.school_attended || '';

            const imageUrl = `../../api/download-document?document_id=${documentId}&user_type=${userType}&school_attended=${schoolAttended}&user_id=${currentUser.id || 0}`;

            document.getElementById('previewImage').src = imageUrl;
            document.getElementById('previewModal').classList.add('show');
        }

        function closePreview() {
            document.getElementById('previewModal').classList.remove('show');
        }

        async function deleteDocument(documentId) {
            if (!confirm('Are you sure you want to delete this document?')) {
                return;
            }

            const currentUser = getCurrentUser();
            const userType = currentUser.user_type || currentUser.role || '';
            const schoolAttended = currentUser.school_attended || '';
            const userId = currentUser.id || '';

            try {
                const response = await fetch('../../api/delete-document', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        document_id: documentId,
                        user_type: userType,
                        school_attended: schoolAttended,
                        user_id: userId
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showNotification('Document deleted successfully', 'success');
                    if (activeSection === 'student') {
                        const studentId = document.getElementById('studentSearch').value;
                        if (studentId) searchDocuments();
                    } else {
                        loadDocuments();
                    }
                } else {
                    showNotification(data.message || 'Delete failed', 'error');
                }
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            }
        }

        // Logout is provided by js/auth.js (calls api/logout to clear the
        // server-side session token) — do not redeclare it here.
    </script>
</body>
</html>
