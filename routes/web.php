<?php

use App\Http\Controllers\Api\Account;
use App\Http\Controllers\Api\Appointments;
use App\Http\Controllers\Api\Auth;
use App\Http\Controllers\Api\Cases;
use App\Http\Controllers\Api\Documents;
use App\Http\Controllers\Api\Feedback;
use App\Http\Controllers\Api\Referrals;
use App\Http\Controllers\Api\School;
use App\Http\Controllers\Api\Students;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public pages
|--------------------------------------------------------------------------
*/

Route::view('/', 'home')->name('home');
Route::view('/login', 'auth.login')->name('login');
Route::view('/register', 'auth.register')->name('register');
Route::view('/staff-login', 'auth.staff-login')->name('staff-login');
Route::view('/staff-register', 'auth.staff-register')->name('staff-register');

/*
|--------------------------------------------------------------------------
| Role pages
|--------------------------------------------------------------------------
| Each role's pages live under /<role>/<page> and render
| resources/views/<role>/<page>.blade.php. The legacy.session middleware
| shows anyone who isn't logged in (or is logged in as another role) the
| 403 page instead.
*/

$rolePages = [
    'student' => ['dashboard', 'student-information', 'appointment-history', 'schedule', 'feedback', 'referral-status', 'profile'],
    'teacher' => ['dashboard', 'referral-form', 'referral-status', 'profile'],
    'counselor' => ['dashboard', 'counseling', 'referral-status', 'student-history', 'schedule', 'documents', 'analytics', 'report-case', 'feedback', 'student-feedback', 'profile'],
    'coordinator' => ['dashboard', 'referrals', 'account', 'schedule', 'documents', 'analytics', 'report-case', 'feedback', 'student-feedback', 'profile'],
    'other-school' => ['dashboard', 'counseling', 'referrals', 'student-history', 'account', 'schedule', 'documents', 'analytics', 'report-case', 'feedback', 'student-feedback', 'profile'],
    'sdo' => ['dashboard', 'school-management', 'add-section', 'add-case-category', 'school-reports', 'district-analytics', 'district-report-cases', 'profile'],
];

foreach ($rolePages as $role => $pages) {
    Route::prefix($role)
        ->name("$role.")
        ->middleware("legacy.session:page,$role")
        ->group(function () use ($role, $pages) {
            foreach ($pages as $page) {
                Route::view($page, "$role.$page")->name($page);
            }
        });
}

/*
|--------------------------------------------------------------------------
| JSON API
|--------------------------------------------------------------------------
| Called with fetch() from the page scripts under public/. Each endpoint
| still branches on the HTTP method / ?action= itself, so the routes accept
| any method.
*/

Route::prefix('api')->name('api.')->middleware('legacy.errors')->group(function () {

    // No login required: sign-in, sign-up, and the public school list used
    // by the registration form.
    Route::any('login', Auth\LoginController::class)->name('login');
    Route::any('logout', Auth\LogoutController::class)->name('logout');
    Route::any('register', Auth\RegisterController::class)->name('register');
    Route::any('verify-otp', Auth\VerifyOtpController::class)->name('verify-otp');
    Route::any('resend-otp', Auth\ResendOtpController::class)->name('resend-otp');
    Route::any('teacher-signup-request', Auth\TeacherSignupRequestController::class)->name('teacher-signup-request');
    Route::any('school-config', School\SchoolConfigController::class)->name('school-config');
    // Pinged by an external cron with ?key=REMINDER_SECRET.
    Route::any('send-appointment-reminders', Appointments\SendAppointmentRemindersController::class)->name('send-appointment-reminders');

    Route::middleware('legacy.session')->group(function () {
        // Account
        Route::any('profile', Account\ProfileController::class)->name('profile');
        Route::any('avatar', Account\AvatarController::class)->name('avatar');
        Route::any('manage-accounts', Account\ManageAccountsController::class)->name('manage-accounts');

        // Students
        Route::any('get-students', Students\GetStudentsController::class)->name('get-students');
        Route::any('get-student-details', Students\GetStudentDetailsController::class)->name('get-student-details');
        Route::any('save-student', Students\SaveStudentController::class)->name('save-student');
        Route::any('import-students', Students\ImportStudentsController::class)->name('import-students');
        Route::any('student-history', Students\StudentHistoryController::class)->name('student-history');
        Route::any('student-ratings', Students\StudentRatingsController::class)->name('student-ratings');
        Route::any('address-options', Students\AddressOptionsController::class)->name('address-options');

        // Referrals and their stages
        Route::any('referral', Referrals\ReferralController::class)->name('referral');
        Route::any('update-referral', Referrals\UpdateReferralController::class)->name('update-referral');
        Route::any('referral-acknowledgement', Referrals\ReferralAcknowledgementController::class)->name('referral-acknowledgement');
        Route::any('referral-assessment', Referrals\ReferralAssessmentController::class)->name('referral-assessment');
        Route::any('referral-consent', Referrals\ReferralConsentController::class)->name('referral-consent');
        Route::any('referral-screening', Referrals\ReferralScreeningController::class)->name('referral-screening');
        Route::any('referral-intervention', Referrals\ReferralInterventionController::class)->name('referral-intervention');
        Route::any('referral-external-referral', Referrals\ReferralExternalReferralController::class)->name('referral-external-referral');
        Route::any('referral-follow-up', Referrals\ReferralFollowUpController::class)->name('referral-follow-up');
        Route::any('intervention-suggestions', Referrals\InterventionSuggestionsController::class)->name('intervention-suggestions');
        Route::any('follow-up', Referrals\FollowUpController::class)->name('follow-up');

        // Cases and reports
        Route::any('case-report', Cases\CaseReportController::class)->name('case-report');
        Route::any('case-scenario', Cases\CaseScenarioController::class)->name('case-scenario');
        Route::any('get-case-section', Cases\GetCaseSectionController::class)->name('get-case-section');

        // Appointments and calendar
        Route::any('appointment-request', Appointments\AppointmentRequestController::class)->name('appointment-request');
        Route::any('appointment-email', Appointments\AppointmentEmailController::class)->name('appointment-email');
        Route::any('schedule-events', Appointments\ScheduleEventsController::class)->name('schedule-events');

        // Student documents
        Route::any('list-documents', Documents\ListDocumentsController::class)->name('list-documents');
        Route::any('upload-document', Documents\UploadDocumentController::class)->name('upload-document');
        Route::any('download-document', Documents\DownloadDocumentController::class)->name('download-document');
        Route::any('delete-document', Documents\DeleteDocumentController::class)->name('delete-document');

        // Feedback
        Route::any('feedback', Feedback\FeedbackController::class)->name('feedback');
        Route::any('feedback-replies', Feedback\FeedbackRepliesController::class)->name('feedback-replies');

        // School / SDO administration
        Route::any('sdo-school-staff', School\SdoSchoolStaffController::class)->name('sdo-school-staff');
        Route::any('report-letterhead', School\ReportLetterheadController::class)->name('report-letterhead');
        Route::any('issue-teacher-access-code', School\IssueTeacherAccessCodeController::class)->name('issue-teacher-access-code');
    });
});

/*
|--------------------------------------------------------------------------
| Error pages
|--------------------------------------------------------------------------
| /error?code=403|404 shows that error page with that status; any other
| code shows the 404. public/error.php sends Apache's ErrorDocument
| requests here. The fallback runs unknown URLs through the web middleware
| so the 404 page can read the session (Dashboard vs. Login button).
*/

Route::get('error', function () {
    $code = request()->integer('code');
    abort(in_array($code, [403, 404], true) ? $code : 404);
})->name('error');

Route::fallback(fn () => abort(404));
