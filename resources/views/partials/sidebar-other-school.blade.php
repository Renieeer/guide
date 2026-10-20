<!-- Mobile nav toggle -->
<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">
    <span></span><span></span><span></span>
</button>
<div class="sidebar-overlay" id="sidebarOverlay"></div>

<!-- Sidebar -->
<div class="sidebar">
    <div class="sidebar-header">
        <a href="{{ url('other-school/profile') }}" class="sidebar-avatar-link" title="My Profile" data-profile-popup-trigger>
            <span class="sidebar-avatar" id="sidebarAvatar">O</span>
        </a>
        <h2>Guidance Office</h2>
        <p>Guidance System</p>
    </div>
    <ul class="sidebar-menu">
        <li><a href="{{ url('other-school/dashboard') }}"><i class="bi bi-graph-up"></i> Dashboard</a></li>
        <li><a href="{{ url('other-school/referrals') }}"><i class="bi bi-clipboard-data"></i> Referrals</a></li>
        <li><a href="{{ url('other-school/report-case') }}"><i class="bi bi-pencil-square"></i> Report Case</a></li>
        <li><a href="{{ url('other-school/counseling') }}"><i class="bi bi-plus-circle"></i> Counseling</a></li>
        <li><a href="{{ url('other-school/student-history') }}"><i class="bi bi-folder2-open"></i> Student History</a></li>
        <li><a href="{{ url('other-school/schedule') }}"><i class="bi bi-calendar3"></i> Schedule</a></li>
        <li><a href="{{ url('other-school/analytics') }}"><i class="bi bi-bar-chart"></i> Analytics</a></li>
        <li><a href="{{ url('other-school/documents') }}"><i class="bi bi-bar-chart"></i> Documentation</a></li>
        <li><a href="{{ url('other-school/student-feedback') }}"><i class="bi bi-chat-square-text"></i> Student Feedback</a></li>
        <li><a href="{{ url('other-school/account') }}"><i class="bi bi-person-circle"></i> Account</a></li>
        <li><a href="#" id="logoutBtn"><i class="bi bi-box-arrow-left"></i> Logout</a></li>
    </ul>
</div>

@include('partials.profile-summary-modal')

<script src="{{ asset('js/sidebar-active.js') }}?v={{ filemtime(public_path('js/sidebar-active.js')) }}"></script>
