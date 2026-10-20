<!-- Mobile nav toggle -->
<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">
    <span></span><span></span><span></span>
</button>
<div class="sidebar-overlay" id="sidebarOverlay"></div>

<!-- Sidebar -->
<div class="sidebar">
    <div class="sidebar-header">
        <a href="{{ url('coordinator/profile') }}" class="sidebar-avatar-link" title="My Profile" data-profile-popup-trigger>
            <span class="sidebar-avatar" id="sidebarAvatar">C</span>
        </a>
        <h2>Coordinator</h2>
        <p>Guidance System</p>
    </div>
    <ul class="sidebar-menu">
        <li><a href="{{ url('coordinator/dashboard') }}"><i class="bi bi-graph-up"></i> Dashboard</a></li>
        <li><a href="{{ url('coordinator/referrals') }}"><i class="bi bi-clipboard-data"></i> Referrals</a></li>
        <li><a href="{{ url('coordinator/report-case') }}"><i class="bi bi-pencil-square"></i> Report Case</a></li>
        <li><a href="{{ url('coordinator/schedule') }}"><i class="bi bi-calendar3"></i> Schedule</a></li>
        <li><a href="{{ url('coordinator/analytics') }}"><i class="bi bi-bar-chart"></i> Analytics</a></li>
        <li><a href="{{ url('coordinator/documents') }}"><i class="bi bi-bar-chart"></i> Documentation</a></li>
        <li><a href="{{ url('coordinator/student-feedback') }}"><i class="bi bi-chat-square-text"></i> Student Feedback</a></li>
        <li><a href="{{ url('coordinator/account') }}"><i class="bi bi-person-circle"></i> Account</a></li>
        <li><a href="#" id="logoutBtn"><i class="bi bi-box-arrow-left"></i> Logout</a></li>
    </ul>
</div>

@include('partials.profile-summary-modal')

<script src="{{ asset('js/sidebar-active.js') }}?v={{ filemtime(public_path('js/sidebar-active.js')) }}"></script>
