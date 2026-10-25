<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Student Documents - Guidance System</title>
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
        }
    </style>
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-coordinator')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-folder-check"></i> Resources</div>
                    <h2 class="page-hero-title">Document Library</h2>
                    <p class="page-hero-text">Access and manage guidance documents, forms, and resources for your school.</p>
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
                        <h3><i class="fas fa-folder"></i> Student Documents</h3>
                        
                        <div class="document-tabs">
                            <button class="document-tab active" data-filter="all">All Documents</button>
                        </div>

                        <div id="documentGrid" class="document-grid">
                            <!-- Documents will be loaded here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Upload Document Modal -->
    <div id="uploadModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h4><i class="fas fa-cloud-upload-alt"></i> Upload Document for Student</h4>
                <button class="modal-close" onclick="hideUploadForm()">&times;</button>
            </div>
            <div class="modal-body upload-modal-body">
                <form id="uploadForm">
                    <div class="form-group">
                        <label for="fileInput">Select Image File <span style="color: #ef4444;">*</span></label>
                        <div class="file-input-wrapper">
                            <label for="fileInput" class="file-input-label">
                                <i class="fas fa-image"></i>
                                <span>Click to select or drag and drop images (JPG, PNG)</span>
                            </label>
                            {{-- No "required": the input is hidden (the label above is the picker), so the browser can't point at it and the form just silently refused to submit. handleUpload() checks for a file and says so. --}}
                            <input type="file" id="fileInput" name="file" accept="image/*">
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

            // Document filter tabs
            document.querySelectorAll('.document-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.document-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    filterDocuments(tab.dataset.filter);
                });
            });

            // Logout
            document.getElementById('logoutBtn').addEventListener('click', logout);
        }

        // Show upload modal
        function openUploadForm() {
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

        // Handle file upload — general school resources, not tied to any
        // one student, so this only needs the file itself (+ optional notes).
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

            const currentUser = getCurrentUser();
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('description', description);
            formData.append('user_type', currentUser.user_type || currentUser.role || '');
            formData.append('school_attended', currentUser.school_attended || '');
            formData.append('user_id', currentUser.id || '');

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
                    document.getElementById('fileInput').value = '';
                    resetFileInputLabel();
                    progressDiv.style.display = 'none';
                    loadDocuments();
                    hideUploadForm();
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

        // Load every document uploaded for this school — the whole point of
        // a shared "Document Library" rather than one student's folder.
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

        // Display documents
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

        // Filter documents
        function filterDocuments(filter) {
            const cards = document.querySelectorAll('.document-card');
            
            if (filter === 'all') {
                cards.forEach(card => card.style.display = '');
            } else {
                cards.forEach(card => {
                    card.style.display = card.dataset.type === filter ? '' : 'none';
                });
            }
        }

        // View document
        function viewDocument(documentId) {
            const currentUser = getCurrentUser();
            const userType = currentUser.user_type || currentUser.role || '';
            const schoolAttended = currentUser.school_attended || '';

            const imageUrl = `../../api/download-document?document_id=${documentId}&user_type=${userType}&school_attended=${schoolAttended}&user_id=${currentUser.id || 0}`;

            document.getElementById('previewImage').src = imageUrl;
            document.getElementById('previewModal').classList.add('show');
        }

        // Close preview
        function closePreview() {
            document.getElementById('previewModal').classList.remove('show');
        }

        // Delete document
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
                    loadDocuments();
                } else {
                    showNotification(data.message || 'Delete failed', 'error');
                }
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            }
        }

        // Show empty state
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

        // Logout is provided by js/auth.js (calls api/logout to clear the
        // server-side session token) — do not redeclare it here.
    </script>
</body>
</html>
