<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Case Category - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        @include('partials.sidebar-sdo')

        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-folder2-open"></i> Case Management</div>
                    <h2 class="page-hero-title">All Case Category</h2>
                    <p class="page-hero-text">Create new case categories under a section and manage the ones already in the system.</p>
                </div>
            </div>

            <div class="page-content">
                <!-- Add Case Category Form -->
                <div class="card mb-5">
                    <div class="card-header">
                        <h2 class="card-title mb-0">New Case Category</h2>
                    </div>
                    <form id="addCaseCategoryForm" style="padding: 20px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="categorySectionSelect">Section</label>
                                <select id="categorySectionSelect" required>
                                    <option value="">Select a section</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="categoryNameInput">Category Name</label>
                                <input type="text" id="categoryNameInput" placeholder="e.g. Truancy" required autocomplete="off">
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary" id="addCaseCategorySubmitBtn">
                                <i class="bi bi-plus-lg"></i> Add Case Category
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Case Categories Table -->
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title mb-0">All Case Categories</h2>
                    </div>

                    <div class="table-toolbar">
                        <label>
                            Show
                            <select id="categoriesPageSizeSelect">
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="all">All</option>
                            </select>
                            entries
                        </label>
                        <label>
                            Search:
                            <input type="text" id="categorySearchInput" placeholder="Search category or section...">
                        </label>
                    </div>

                    <div class="account-table-container">
                        <table class="accounts-table" id="categoriesTable">
                            <thead>
                                <tr>
                                    <th style="width: 80px;">#</th>
                                    <th>Section</th>
                                    <th>Category Name</th>
                                    <th style="width: 170px;" class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody id="categoriesTableBody">
                                <tr>
                                    <td colspan="4" class="no-accounts">
                                        <i class="bi bi-hourglass-split" style="font-size: 24px; margin-bottom: 10px;"></i>
                                        <p>Loading case categories...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div id="categoriesPagination" class="accounts-pagination"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Case Category Modal -->
    <div id="editCaseCategoryModal" class="modal">
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <h2>Edit Case Category</h2>
                <span class="modal-close" onclick="closeEditCaseCategoryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="editCaseCategoryForm">
                    <input type="hidden" id="editCaseId">
                    <div class="form-group">
                        <label for="editCategorySectionSelect">Section</label>
                        <select id="editCategorySectionSelect" required>
                            <option value="">Select a section</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editCategoryNameInput">Category Name</label>
                        <input type="text" id="editCategoryNameInput" required autocomplete="off">
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button type="submit" class="btn btn-success">Save Changes</button>
                        <button type="button" class="btn btn-secondary" onclick="closeEditCaseCategoryModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Confirm Edit Case Category Modal -->
    <div id="confirmEditCaseCategoryModal" class="modal">
        <div class="modal-content" style="max-width: 420px;">
            <div class="modal-header">
                <h2>Confirm</h2>
                <span class="modal-close" onclick="cancelConfirmEditCaseCategory()">&times;</span>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to save changes to this category?</p>
                <div class="form-actions" style="margin-top: 20px;">
                    <button type="button" class="btn btn-primary" id="confirmEditCaseCategoryYesBtn">Yes</button>
                    <button type="button" class="btn btn-secondary" onclick="cancelConfirmEditCaseCategory()">No</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Confirm Add Case Category Modal -->
    <div id="confirmAddCategoryModal" class="modal">
        <div class="modal-content" style="max-width: 420px;">
            <div class="modal-header">
                <h2>Confirm</h2>
                <span class="modal-close" onclick="closeConfirmAddCategoryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to add this category?</p>
                <div class="form-actions" style="margin-top: 20px;">
                    <button type="button" class="btn btn-primary" id="confirmAddCategoryYesBtn">Yes</button>
                    <button type="button" class="btn btn-secondary" onclick="closeConfirmAddCategoryModal()">No</button>
                </div>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/sdo/add-case-category.js') }}?v={{ filemtime(public_path('pages/sdo/add-case-category.js')) }}"></script>
</body>
</html>
