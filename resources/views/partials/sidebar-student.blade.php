<!-- Mobile nav toggle -->
<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">
    <span></span><span></span><span></span>
</button>
<div class="sidebar-overlay" id="sidebarOverlay"></div>

<!-- Sidebar -->
<div class="sidebar">
    <div class="sidebar-header">
        <a href="{{ url('student/profile') }}" class="sidebar-avatar-link" title="My Profile" data-profile-popup-trigger>
            <span class="sidebar-avatar" id="sidebarAvatar">S</span>
        </a>
        <h2>Student</h2>
        <p>Guidance System</p>
    </div>
    <ul class="sidebar-menu">
        <li><a href="{{ url('student/dashboard') }}"><i class="bi bi-graph-up"></i> Dashboard</a></li>
        <li><a href="{{ url('student/student-information') }}"><i class="bi bi-person-vcard"></i> My Information</a></li>
        <li><a href="{{ url('student/appointment-history') }}"><i class="bi bi-clock-history"></i> History</a></li>
        <li><a href="{{ url('student/schedule') }}"><i class="bi bi-calendar3"></i> Schedule</a></li>
        <li><a href="{{ url('student/feedback') }}"><i class="bi bi-chat-dots"></i> Feedback</a></li>

        <li><a href="#" id="logoutBtn"><i class="bi bi-box-arrow-left"></i> Logout</a></li>
    </ul>
</div>

@include('partials.profile-summary-modal')

<script src="{{ asset('js/sidebar-active.js') }}?v={{ filemtime(public_path('js/sidebar-active.js')) }}"></script>
