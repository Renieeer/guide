<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Section - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <link rel="stylesheet" href="{{ asset('css/responsive.css') }}?v={{ filemtime(public_path('css/responsive.css')) }}">
</head>
<body>
    <div class="main-wrapper">
        @include('partials.sidebar-sdo')

        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-folder2-open"></i> Case Management</div>
                    <h2 class="page-hero-title">All Section</h2>
                    <p class="page-hero-text">Create new case sections and manage the ones already in the system.</p>
                </div>
            </div>

            <div class="page-content">
                <!-- Add Section Form -->
                <div class="card mb-5">
                    <div class="card-header">
                        <h2 class="card-title mb-0">New Section</h2>
                    </div>
                    <form id="addSectionForm" style="padding: 20px;">
                        <div class="form-group">
                            <label for="sectionNameInput">Section Name</label>
                            <input type="text" id="sectionNameInput" placeholder="e.g. Poor Study Habits" required autocomplete="off">
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary" id="addSectionSubmitBtn">
                                <i class="bi bi-plus-lg"></i> Add Section
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Sections Table -->
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title mb-0">All Sections</h2>
                    </div>

                    <div class="table-toolbar">
                        <label>
                            Show
                            <select id="sectionsPageSizeSelect">
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="all">All</option>
                            </select>
                            entries
                        </label>
                        <label>
                            Search:
                            <input type="text" id="sectionSearchInput" placeholder="Search section name...">
                        </label>
                    </div>

                    <div class="account-table-container">
                        <table class="accounts-table" id="sectionsTable">
                            <thead>
                                <tr>
                                    <th style="width: 80px;">#</th>
                                    <th>Section Name</th>
                                    <th style="width: 100px;" class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody id="sectionsTableBody">
                                <tr>
                                    <td colspan="3" class="no-accounts">
                                        <i class="bi bi-hourglass-split" style="font-size: 24px; margin-bottom: 10px;"></i>
                                        <p>Loading sections...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div id="sectionsPagination" class="accounts-pagination"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Section Modal -->
    <div id="editSectionModal" class="modal">
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <h2>Edit Section</h2>
                <span class="modal-close" onclick="closeEditSectionModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="editSectionForm">
                    <input type="hidden" id="editSectionId">
                    <div class="form-group">
                        <label for="editSectionNameInput">Section Name</label>
                        <input type="text" id="editSectionNameInput" required autocomplete="off">
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="submit" class="btn btn-success">Save Changes</button>
                        <button type="button" class="btn btn-secondary" onclick="closeEditSectionModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Confirm Edit Section Modal -->
    <div id="confirmEditSectionModal" class="modal">
        <div class="modal-content" style="max-width: 420px;">
            <div class="modal-header">
                <h2>Confirm</h2>
                <span class="modal-close" onclick="cancelConfirmEditSection()">&times;</span>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to save changes to this section?</p>
                <div class="form-actions" style="margin-top: 20px;">
                    <button type="button" class="btn btn-primary" id="confirmEditSectionYesBtn">Yes</button>
                    <button type="button" class="btn btn-secondary" onclick="cancelConfirmEditSection()">No</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Confirm Add Section Modal -->
    <div id="confirmAddSectionModal" class="modal">
        <div class="modal-content" style="max-width: 420px;">
            <div class="modal-header">
                <h2>Confirm</h2>
                <span class="modal-close" onclick="closeConfirmAddSectionModal()">&times;</span>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to add this section?</p>
                <div class="form-actions" style="margin-top: 20px;">
                    <button type="button" class="btn btn-primary" id="confirmAddSectionYesBtn">Yes</button>
                    <button type="button" class="btn btn-secondary" onclick="closeConfirmAddSectionModal()">No</button>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/sdo/add-section.js') }}?v={{ filemtime(public_path('pages/sdo/add-section.js')) }}"></script>
</body>
</html>
