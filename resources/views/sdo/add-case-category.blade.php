<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Violations - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style>
        /* Case categories grouped by section — one collapsible panel each. */
        .category-accordion-toolbar {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
        }
        .category-accordion-toggles {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .category-accordion {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 0 20px 20px;
        }
        .category-accordion-item {
            border: 1px solid var(--border);
            border-radius: 10px;
            background: #fff;
            overflow: hidden;
        }
        .category-accordion-heading {
            margin: 0;
            font-size: inherit;
        }
        .category-accordion-header {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 12px;
            min-height: 48px;
            padding: 12px 16px;
            background: var(--navy-050);
            border: none;
            cursor: pointer;
            text-align: left;
            font: inherit;
            color: var(--ink);
        }
        .category-accordion-header:hover {
            background: var(--navy-100);
        }
        .category-accordion-header:focus-visible {
            outline: 2px solid var(--navy-500);
            outline-offset: -2px;
        }
        .category-accordion-chevron {
            color: var(--navy-600);
            transition: transform 0.2s ease;
        }
        .category-accordion-item.is-open .category-accordion-chevron {
            transform: rotate(90deg);
        }
        .category-accordion-title {
            flex: 1;
            min-width: 0;
            font-weight: 700;
            font-size: 15px;
        }
        .category-accordion-count {
            flex-shrink: 0;
            padding: 2px 10px;
            border-radius: 999px;
            background: #fff;
            border: 1px solid var(--navy-200);
            color: var(--navy-700);
            font-size: 12px;
            font-weight: 600;
        }
        .category-accordion-panel {
            border-top: 1px solid var(--border-soft);
            overflow-x: auto;
        }
        .category-accordion-table {
            margin: 0;
        }
        .category-accordion-empty {
            padding: 16px;
            color: var(--ink-muted);
            font-size: 14px;
        }
        @media (prefers-reduced-motion: reduce) {
            .category-accordion-chevron { transition: none; }
        }
    </style>
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
                    <h2 class="page-hero-title">All Violations</h2>
                    <p class="page-hero-text">Create new violations under a category and manage the ones already in the system.</p>
                </div>
            </div>

            <div class="page-content">
                <!-- Add Case Category Form -->
                <div class="card mb-5">
                    <div class="card-header">
                        <h2 class="card-title mb-0">New Violation</h2>
                    </div>
                    <form id="addCaseCategoryForm" style="padding: 20px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="categorySectionSelect">Category</label>
                                <select id="categorySectionSelect" required>
                                    <option value="">Select a category</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="categoryNameInput">Violation Name</label>
                                <input type="text" id="categoryNameInput" placeholder="e.g. Truancy" required autocomplete="off">
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary" id="addCaseCategorySubmitBtn">
                                <i class="bi bi-plus-lg"></i> Add Violation
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Case Categories, grouped by section in an accordion:
                     one collapsible panel per section, holding that
                     section's categories. -->
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title mb-0">All Violations</h2>
                    </div>

                    <div class="table-toolbar category-accordion-toolbar">
                        <label>
                            Search:
                            <input type="text" id="categorySearchInput" placeholder="Search violation or category...">
                        </label>
                        <div class="category-accordion-toggles">
                            <button type="button" class="btn btn-secondary btn-sm" id="expandAllSectionsBtn">
                                <i class="bi bi-arrows-expand"></i> Expand all
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" id="collapseAllSectionsBtn">
                                <i class="bi bi-arrows-collapse"></i> Collapse all
                            </button>
                        </div>
                    </div>

                    <div id="categoryAccordion" class="category-accordion">
                        <div class="no-accounts">
                            <i class="bi bi-hourglass-split" style="font-size: 24px; margin-bottom: 10px;"></i>
                            <p>Loading violations...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Case Category Modal -->
    <div id="editCaseCategoryModal" class="modal">
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <h2>Edit Violation</h2>
                <span class="modal-close" onclick="closeEditCaseCategoryModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="editCaseCategoryForm">
                    <input type="hidden" id="editCaseId">
                    <div class="form-group">
                        <label for="editCategorySectionSelect">Category</label>
                        <select id="editCategorySectionSelect" required>
                            <option value="">Select a category</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editCategoryNameInput">Violation Name</label>
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
                <p>Are you sure you want to save changes to this violation?</p>
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
                <p>Are you sure you want to add this violation?</p>
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
