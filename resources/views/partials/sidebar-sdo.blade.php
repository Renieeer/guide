<!-- Mobile nav toggle -->
<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">
    <span></span><span></span><span></span>
</button>
<div class="sidebar-overlay" id="sidebarOverlay"></div>

<!-- Sidebar -->
<div class="sidebar">
    <div class="sidebar-header">
        <a href="{{ url('sdo/profile') }}" class="sidebar-avatar-link" title="My Profile" data-profile-popup-trigger>
            <span class="sidebar-avatar" id="sidebarAvatar">S</span>
        </a>
        <h2>SDO</h2>
        <p>Guidance System</p>
    </div>
    <ul class="sidebar-menu">
        <li><a href="{{ url('sdo/dashboard') }}"><i class="bi bi-graph-up"></i> Dashboard</a></li>
        <li><a href="{{ url('sdo/school-management') }}"><i class="bi bi-building"></i> School Management</a></li>
        <li><a href="{{ url('sdo/district-report-cases') }}"><i class="bi bi-pencil-square"></i> Report Cases</a></li>
        <li class="sidebar-group">
            <button type="button" class="sidebar-group-toggle">
                <span><i class="bi bi-folder2-open"></i> Case Management</span>
                <i class="bi bi-chevron-down sidebar-group-chevron"></i>
            </button>
            <ul class="sidebar-submenu">
                <li><a href="{{ url('sdo/add-section') }}">All Section</a></li>
                <li><a href="{{ url('sdo/add-case-category') }}">All Case Category</a></li>
            </ul>
        </li>
        <li><a href="{{ url('sdo/district-analytics') }}"><i class="bi bi-bar-chart"></i> District Analytics</a></li>
        <li><a href="{{ url('sdo/school-reports') }}"><i class="bi bi-file-earmark-text"></i> School Reports</a></li>
        <li><a href="#" id="logoutBtn"><i class="bi bi-box-arrow-left"></i> Logout</a></li>
    </ul>
</div>

@include('partials.profile-summary-modal')

<script src="{{ asset('js/sidebar-active.js') }}?v={{ filemtime(public_path('js/sidebar-active.js')) }}"></script>
