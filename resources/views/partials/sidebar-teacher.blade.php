<!-- Mobile nav toggle -->
<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">
    <span></span><span></span><span></span>
</button>
<div class="sidebar-overlay" id="sidebarOverlay"></div>

<!-- Sidebar -->
<div class="sidebar">
    <div class="sidebar-header">
        <a href="{{ url('teacher/profile') }}" class="sidebar-avatar-link" title="My Profile" data-profile-popup-trigger>
            <span class="sidebar-avatar" id="sidebarAvatar">T</span>
        </a>
        <h2>Teacher</h2>
        <p>Guidance System</p>
    </div>
    <ul class="sidebar-menu">
        <li><a href="{{ url('teacher/dashboard') }}"><i class="bi bi-graph-up"></i> Dashboard</a></li>
        <li><a href="{{ url('teacher/referral-form') }}"><i class="bi bi-pencil-square"></i> Submit Referral</a></li>
        <li><a href="{{ url('teacher/referral-status') }}"><i class="bi bi-clipboard-data"></i> Referral Status</a></li>
        <li><a href="#" id="logoutBtn"><i class="bi bi-box-arrow-left"></i> Logout</a></li>
    </ul>
</div>

@include('partials.profile-summary-modal')

<script src="{{ asset('js/sidebar-active.js') }}?v={{ filemtime(public_path('js/sidebar-active.js')) }}"></script>
