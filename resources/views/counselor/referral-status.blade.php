<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Referral Status - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-counselor')<!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-diagram-3"></i> Case Management</div>
                    <h2 class="page-hero-title">Referral Status</h2>
                    <p class="page-hero-text">Track the status of all student referrals assigned to you and monitor case progress.</p>
                </div>
                <button type="button" class="btn btn-primary" id="openReferralFormBtn">
                    <i class="bi bi-plus-circle"></i> Create Referral
                </button>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <div id="detailView" style="display: none;">
                    <div class="card mb-5">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <h2 class="card-title">Referral Details</h2>
                            <button class="btn btn-secondary" onclick="backToList()">Back to List</button>
                        </div>

                        <!-- Referral Overview -->
                        <h3 class="text-primary">Referral Overview</h3>
                        <div class="form-row-three">
                            <p><strong>Teacher:</strong> <span id="detTeacherName"></span></p>
                            <p><strong>School:</strong> <span id="detTeacherSchool"></span></p>
                            <p><strong>Contact Number:</strong> <span id="detTeacherContact"></span></p>
                        </div>
                        <div class="form-row">
                            <p><strong>Parent/Guardian:</strong> <span id="detParent"></span></p>
                            <p><strong>Contact Number:</strong> <span id="detContactNum"></span></p>
                        </div>
                        <div class="form-row">
                            <div>
                                <p><strong>Referral ID:</strong> <span id="detRefId"></span></p>
                                <p><strong>Student:</strong> <span id="detStudentName"></span></p>
                                <p><strong>Grade/Section:</strong> <span id="detStudentGradeSection"></span></p>
                            </div>
                            <div>
                                <p><strong>Date Submitted:</strong> <span id="detDateSubmitted"></span></p>
                                <p><strong>Urgency:</strong> <span id="detUrgency"></span></p>
                                <p><strong>Status:</strong> <span id="detStatus"></span></p>
                                <p><strong>Current Stage:</strong> <span id="detStage"></span><span id="detStageNote" class="text-muted"></span></p>
                            </div>
                        </div>
                        <p><strong>Reason for Referral:</strong> <span id="ovReason"></span></p>

                        <hr>

                        <!-- Stage Progress -->
                        <h3 class="text-primary">Referral Progress (7 Stages)</h3>
                        <p class="text-muted" style="margin-top:-6px;">Click any stage number to review what was recorded there.</p>
                        <div id="detailStagesContainer"></div>
                        <div id="stageViewNote" class="text-muted" style="margin-top: 10px; display: none;">
                            Viewing <strong id="stageViewLabel"></strong> (not the current stage) —
                            <a href="#" id="backToCurrentStageLink">Back to current stage</a>
                        </div>

                        <hr>

                        <!-- Referral Reason & Description -->
                        <h3 class="text-primary">Referral Information</h3>
                        <div class="referral-info-columns">
                            <div>
                                <p><strong>Initial Actions Taken:</strong> <span id="detIntervention"></span></p>
                            </div>
                            <div>
                                <p><strong>Description:</strong> <span id="detDescription"></span></p>
                            </div>
                        </div>

                        <!-- Always-visible mirror of the Stage 2 assessment document — the
                             upload form + file list further down only render while viewStage
                             is 2 (see renderStageSection()), so once the referral moves past
                             Stage 2 there was no way to see it again without clicking back to
                             Stage 2 on the progress indicator. This copy stays visible no
                             matter which stage is currently being viewed. -->
                        <div id="detAssessmentFileList" style="margin-top: 12px;"></div>

                        <hr>

                        <!-- Interview/Background (Stage 1) -->
                        <div id="interviewFormSection" style="display: none;">
                            <h3 class="text-primary">Interview / Background Check-up (Stage 1)</h3>
                            <p class="text-muted" style="margin-top:-6px;">Document the initial interview and background check-up for this student.</p>

                            <div id="interviewHistoryList" style="margin-bottom: 16px;"></div>

                            <form id="interviewForm">
                                <div class="form-group">
                                    <label for="interviewNotes">Interview / Background Notes</label>
                                    <textarea id="interviewNotes" name="interviewNotes" placeholder="What was discussed during the interview, and any background check-up findings..."></textarea>
                                </div>

                                <button type="submit" class="btn btn-success">Save Interview Notes</button>
                                <button type="button" class="btn btn-secondary" id="cancelInterviewEditBtn" style="display: none;">Cancel</button>
                            </form>
                        </div>

                        <!-- Initial Risk Assessment (Stage 2) -->
                        <div id="screeningFormSection" style="display: none;">
                            <h3 class="text-primary">Initial Risk Assessment (Stage 2)</h3>
                            <p class="text-muted" style="margin-top:-6px;">Attaching the completed assessment document is optional, given the confidentiality of its contents — confirming below whether the student has completed it is what actually moves the referral to Stage 3.</p>

                            <div id="assessmentFileList" style="margin-bottom: 16px;"></div>

                            <form id="assessmentUploadForm" style="margin-bottom: 24px;">
                                <div class="form-group">
                                    <label for="assessmentFile">Assessment Document (PDF, JPG, or PNG — max 5 MB, optional)</label>
                                    <input type="file" id="assessmentFile" name="assessmentFile" accept=".pdf,.jpg,.jpeg,.png">
                                </div>

                                <button type="submit" class="btn btn-secondary">Upload Document</button>
                            </form>

                            <div class="form-group">
                                <label>Has the student completed the assessment you gave?</label>
                                <div style="display: flex; gap: 10px;">
                                    <button type="button" class="btn btn-success" id="assessmentCompletedYesBtn">
                                        <i class="bi bi-check-lg"></i> Yes — Proceed to Stage 3
                                    </button>
                                    <button type="button" class="btn btn-secondary" id="assessmentCompletedNoBtn">Not yet</button>
                                </div>
                            </div>
                        </div>

                        <!-- Parent Call-up/Consent (Stage 3) -->
                        <div id="consentSection" style="display: none;">
                            <h3 class="text-primary">Parent Call-up/Consent (Stage 3)</h3>
                            <p class="text-muted" style="margin-top:-6px;">Upload the signed parent consent form (optional), then confirm whether the student and parent agree to proceed.</p>

                            <div id="consentFileList" style="margin-bottom: 16px;"></div>

                            <form id="consentUploadForm" style="margin-bottom: 24px;">
                                <div class="form-group">
                                    <label for="consentFile">Consent Form (PDF, JPG, or PNG — max 5 MB, optional)</label>
                                    <input type="file" id="consentFile" name="consentFile" accept=".pdf,.jpg,.jpeg,.png">
                                </div>

                                <button type="submit" class="btn btn-secondary">Upload Consent Form</button>
                            </form>

                            <div class="form-row">
                                <div class="form-group">
                                    <label for="consentStudentAgree">Did the student agree to proceed?</label>
                                    <select id="consentStudentAgree">
                                        <option value="">Select answer</option>
                                        <option value="yes">Yes</option>
                                        <option value="no">No</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="consentParentAgree">Did the parent/guardian agree to proceed?</label>
                                    <select id="consentParentAgree">
                                        <option value="">Select answer</option>
                                        <option value="yes">Yes</option>
                                        <option value="no">No</option>
                                    </select>
                                </div>
                            </div>
                            <p class="text-muted" style="margin-top:-6px;">Either way, the referral moves to Stage 4 (Intervention) — everyone needs intervention before counseling.</p>

                            <button type="button" class="btn btn-success" id="consentDecisionSubmitBtn">
                                <i class="bi bi-check-lg"></i> Confirm &amp; Continue
                            </button>
                        </div>

                        <!-- Intervention Activities (Stage 4) -->
                        <div id="interventionFormSection" style="display: none;">
                            <h3 class="text-primary">Intervention (Stage 4)</h3>
                            <p class="text-muted" style="margin-top:-6px;">Log each intervention session — an intervention plan often takes more than one day, so every save adds a new dated entry instead of replacing the last one.</p>

                            <div id="interventionHistoryList" style="margin-bottom: 16px;"></div>

                            <form id="interventionForm">
                                <div class="form-group">
                                    <label>Activities Conducted (this session)</label>
                                    <div id="interventionChecklist" class="referral-checklist"></div>
                                    <!-- NEW: Reason-based intervention suggestions — replaces the old
                                         free-text "Other" textarea with a tag/chip input that
                                         autocompletes from api/intervention-suggestions.php, filtered
                                         to this referral's own Reason for Referral. -->
                                    <div id="interventionOtherWrap" class="intervention-other-wrap" style="display:none;">
                                        <div id="interventionOtherChips" class="intervention-tag-chips"></div>
                                        <div class="intervention-tag-input-wrap">
                                            <input type="text" id="interventionOtherInput" class="intervention-tag-input" placeholder="Type an intervention..." autocomplete="off">
                                            <div id="interventionOtherSuggestions" class="intervention-tag-suggestions" style="display:none;"></div>
                                        </div>
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label for="interventionNotes">Session Notes (optional)</label>
                                    <textarea id="interventionNotes" name="interventionNotes" placeholder="Any additional details about this session..." rows="3"></textarea>
                                </div>

                                <button type="submit" class="btn btn-success">Save Intervention Session</button>
                            </form>

                            <!-- Shown only when "External Referral" is checked above — DepEd
                                 Appendix C "Referral for Service". Required before this
                                 referral can advance to Stage 5 (Counseling). -->
                            <div id="externalReferralFormSection" style="display: none;">
                                <hr>
                                <h4 class="text-primary">External Referral — Referral for Service (Appendix C)</h4>
                                <p class="text-muted" style="margin-top:-6px;">Required before this referral can move to Counseling.</p>

                                <div class="form-row-two">
                                    <div class="form-group">
                                        <label for="extRefAgencyName">Referred To (Agency)</label>
                                        <input type="text" id="extRefAgencyName" placeholder="e.g. City Social Welfare and Development">
                                    </div>
                                    <div class="form-group">
                                        <label for="extRefAgencyAddress">Agency Address</label>
                                        <input type="text" id="extRefAgencyAddress">
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label for="extRefStudentAddress">Student's Home Address</label>
                                    <input type="text" id="extRefStudentAddress" placeholder="Used on the printable Appendix C form">
                                </div>

                                <div class="form-row-two">
                                    <div class="form-group">
                                        <label for="extRefSchoolName">Referring Party / School</label>
                                        <input type="text" id="extRefSchoolName">
                                    </div>
                                    <div class="form-group">
                                        <label for="extRefSchoolAddress">School Address</label>
                                        <input type="text" id="extRefSchoolAddress">
                                    </div>
                                </div>

                                <div class="form-row-three">
                                    <div class="form-group">
                                        <label for="extRefCellphone">Cellphone No.</label>
                                        <input type="text" id="extRefCellphone">
                                    </div>
                                    <div class="form-group">
                                        <label for="extRefLandline">Landline No.</label>
                                        <input type="text" id="extRefLandline">
                                    </div>
                                    <div class="form-group">
                                        <label for="extRefContactPerson">Contact Person</label>
                                        <input type="text" id="extRefContactPerson">
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label for="extRefReason">Reason/s for Referral</label>
                                    <textarea id="extRefReason" rows="3"></textarea>
                                </div>

                                <div class="form-group">
                                    <label for="extRefServices">Specific Service/s Requested</label>
                                    <textarea id="extRefServices" rows="3"></textarea>
                                </div>

                                <!-- No inputs for "Referred By (Signature Over Printed Name)" or
                                     "Designation" — both are filled in by hand at the moment of
                                     signing the printed copy, not typed in ahead of time (see the
                                     blank #printByName/#printByDesignation lines in
                                     #externalReferralPrintSheet below). -->
                                <button type="button" class="btn btn-success" id="saveExternalReferralBtn">Save External Referral</button>
                                <button type="button" class="btn btn-secondary" id="printExternalReferralBtn" style="display:none;" onclick="printExternalReferral()">
                                    <i class="bi bi-printer"></i> Print / Save as PDF (Appendix C)
                                </button>
                                <p id="externalReferralPdfHint" class="text-muted" style="display:none; margin-top:6px; font-size:13px;">
                                    In the print dialog, choose <strong>Save as PDF</strong> as the destination to download it instead of printing.
                                </p>
                                <p id="externalReferralSavedNote" class="text-muted" style="display:none; margin-top:8px;">
                                    <i class="bi bi-check-circle-fill" style="color:#1b8f59;"></i> Saved — this referral can now advance to Counseling.
                                </p>
                            </div>
                        </div>

                        <!-- Student Follow-up (Stage 6) -->
                        <div id="followUpFormSection" style="display: none;">
                            <h3 class="text-primary">Student Follow-up (Stage 6)</h3>
                            <p class="text-muted" style="margin-top:-6px;">Log a dated check-in with the student at the interval you set — each entry shows when the next one is due.</p>

                            <div id="followUpHistoryList" style="margin-bottom: 16px;"></div>

                            <form id="followUpForm">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="followUpInterval">Follow-up Interval</label>
                                        <select id="followUpInterval">
                                            <option value="weekly">Weekly</option>
                                            <option value="biweekly">Biweekly</option>
                                            <option value="monthly">Monthly</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                    <div class="form-group" id="followUpCustomDaysGroup" style="display:none;">
                                        <label for="followUpCustomDays">Custom Interval (days)</label>
                                        <input type="number" id="followUpCustomDays" min="1" value="7">
                                    </div>
                                    <div class="form-group">
                                        <label for="followUpDate">Follow-up Date</label>
                                        <input type="date" id="followUpDate">
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label for="followUpNotes">Notes — student's progress/well-being at this check-in</label>
                                    <textarea id="followUpNotes" name="followUpNotes" placeholder="What was observed or discussed during this follow-up..."></textarea>
                                </div>

                                <button type="submit" class="btn btn-success">Save Follow-up</button>
                            </form>
                        </div>

                        <!-- Case Closing Acknowledgement (Stage 7) -->
                        <div id="acknowledgementFormSection" style="display: none;">
                            <h3 class="text-primary">Case Closing Acknowledgement (Stage 7)</h3>
                            <p class="text-muted" style="margin-top:-6px;">Complete this once counseling has ended — it's shown to the referring teacher as a read-only receipt.</p>

                            <form id="acknowledgementForm">
                                <div class="form-group">
                                    <label for="ackAttendedBy">Session attended by</label>
                                    <input type="text" id="ackAttendedBy" name="ackAttendedBy" placeholder="Counselor name">
                                </div>

                                <div class="form-group">
                                    <label>Status of the case at hand</label>
                                    <div id="ackChecklist" class="referral-checklist"></div>
                                </div>

                                <button type="submit" class="btn btn-success">Save Acknowledgement</button>
                                <button type="button" class="btn btn-secondary" id="printAcknowledgementBtn" style="display:none;" onclick="printAcknowledgement()">
                                    <i class="bi bi-printer"></i> Print / Save as PDF
                                </button>
                            </form>
                        </div>

                        <!-- Stage 5: Counseling — links out to the standalone Counseling
                             case feature (sidebar) instead of duplicating it here. -->
                        <div id="counselingCtaSection" style="display: none;">
                            <h3 class="text-primary">Counseling (Stage 5)</h3>

                            <!-- Shown by renderConsentStatusNote() (referral-status.js) — the
                                 Stage 3 student/parent consent answers, so it's clear whether
                                 this referral actually needs counseling or is only here because
                                 everyone passes through Stage 4 (Intervention) regardless. -->
                            <div id="consentStatusNote" style="display: none;"></div>

                            <!-- Shown once checkExistingCounselingCase() (referral-status.js)
                                 finds a case already linked to this referral, so it's clear
                                 the referral and that counseling case are the same effort. -->
                            <div id="linkedCaseStatus" style="display: none;"></div>

                            <div id="openCounselingCasePrompt">
                                <p class="text-muted" style="margin-top:-6px;">This referral has reached the Counseling stage. Open a counseling case for this student to begin logging sessions.</p>
                                <button type="button" class="btn btn-primary" id="openCounselingCaseBtn">
                                    <i class="bi bi-plus-circle"></i> Open Counseling Case
                                </button>
                            </div>
                        </div>

                        <hr>

                        <!-- Case Management Actions -->
                        <h3 class="text-primary">Case Management</h3>
                        <div id="caseActionsContainer"></div>
                    </div>

                    <!-- Printable acknowledgement sheet — sibling of .card for the same
                         reason as externalReferralPrintSheet below (a display:none
                         ancestor would hide it too). Hidden on screen, shown only via
                         @media print (see printAcknowledgement() in referral-status.js).
                         Mirrors the read-only layout the teacher sees on their own
                         referral-status page for the same saved acknowledgement. -->
                    <div id="acknowledgementPrintSheet" class="referral-paper" style="display:none;"></div>

                    <!-- Printable Appendix C sheet — deliberately a sibling of .card
                         (not nested inside it) since @media print hides .card entirely;
                         a display:none ancestor hides its descendants regardless of
                         their own display value, so this has to live outside it to be
                         printable at all. Hidden on screen, shown only via @media print
                         (see printExternalReferral() in referral-status.js). Layout/
                         wording mirrors the official DepEd "Referral for Service" form
                         exactly; only the underlined blanks are filled in dynamically. -->
                    <div id="externalReferralPrintSheet" class="er-print-sheet" style="display:none;">
                        <div class="er-print-page">
                            <div class="er-print-appendix">Appendix C</div>
                            <div class="er-print-confidential">Confidential</div>
                            <div class="er-print-logo">DepEd</div>
                            <h2 class="er-print-title">REFERRAL FOR SERVICE</h2>

                            <table class="er-print-instructions">
                                <tr>
                                    <td class="er-print-instructions-label">Instructions</td>
                                    <td class="er-print-instructions-text">
                                        This should be completed by fully trained and designated staff of the school.
                                        Original copy shall be maintained in the school and shall form part of the client's confidential records.<br><br>
                                        Any information contained herein and the rest of the records of the client shall be held in strict confidence. No information from this card shall be shared to anyone except to service provider and as may be authorized.<br>
                                        Attach additional pages with continued narrative, if needed.
                                    </td>
                                </tr>
                            </table>

                            <p class="er-print-line"><strong>To:</strong> <span class="er-print-fill" id="printAgencyName"></span></p>
                            <p class="er-print-line"><strong>Address:</strong> <span class="er-print-fill" id="printAgencyAddress"></span></p>
                            <p class="er-print-line"><strong>Name of Student:</strong> <span class="er-print-fill" id="printStudentName"></span></p>
                            <p class="er-print-line">
                                <strong>Age:</strong> <span class="er-print-fill er-print-fill-sm" id="printStudentAge"></span>
                                <strong>Sex:</strong> <span class="er-print-fill er-print-fill-sm" id="printStudentSex"></span>
                                <strong>Address:</strong> <span class="er-print-fill" id="printStudentAddress"></span>
                            </p>

                            <p class="er-print-section-label"><strong>Reason/s for Referral:</strong></p>
                            <p class="er-print-block" id="printReason"></p>

                            <p class="er-print-section-label"><strong>Specific Service/s Requested:</strong></p>
                            <p class="er-print-block er-print-block-ruled" id="printServices"></p>

                            <p>Please refer to attached report/intake form/case summary for more information.</p>

                            <p>Feedback is requested. Please send to:</p>
                            <p class="er-print-feedback">
                                Office of the School Principal, <span id="printFeedbackSchool"></span><br>
                                <span id="printFeedbackAddress"></span>
                            </p>
                        </div>

                        <div class="er-print-page er-print-page-break">
                            <div class="er-print-appendix">Appendix C</div>
                            <div class="er-print-confidential">Confidential</div>

                            <p class="er-print-line"><strong>Referring Party/School:</strong> <span class="er-print-fill" id="printSchoolName"></span></p>
                            <p class="er-print-line"><strong>Address:</strong> <span class="er-print-fill" id="printSchoolAddress"></span></p>
                            <p class="er-print-line">
                                <strong>Cellphone No. :</strong> <span class="er-print-fill er-print-fill-sm" id="printCellphone"></span>
                                <strong>Landline No:</strong> <span class="er-print-fill er-print-fill-sm" id="printLandline"></span>
                            </p>
                            <p class="er-print-line"><strong>Contact Person:</strong> <span class="er-print-fill" id="printContactPerson"></span></p>

                            <p class="er-print-referred-by">Referred by:</p>
                            <div class="er-print-signature-row">
                                <div class="er-print-signature">
                                    <div class="er-print-signature-line" id="printByName"></div>
                                    <div class="er-print-signature-caption">Signature Over Printed Name</div>
                                </div>
                                <div class="er-print-signature">
                                    <div class="er-print-signature-line" id="printByDesignation"></div>
                                    <div class="er-print-signature-caption">Designation</div>
                                </div>
                            </div>

                            <div class="er-print-signature er-print-date">
                                <div class="er-print-signature-line" id="printDate"></div>
                                <div class="er-print-signature-caption">Date Accomplished</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="listView">
                    <!-- Filter -->
                    <div class="card" style="margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: auto auto auto auto 1fr; gap: 15px; align-items: end;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 500;">Stage</label>
                                <select id="stageFilter" style="padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                                    <option value="">All Stages</option>
                                    <option value="3">Parent Call-up/Consent (3)</option>
                                    <option value="4">Intervention (4)</option>
                                    <option value="5">Counseling (5)</option>
                                </select>
                            </div>
                            <button class="btn btn-primary" onclick="applyStageFilter()">Filter</button>
                            <button class="btn btn-secondary" onclick="clearStageFilter()">Clear</button>
                        </div>
                    </div>

                    <!-- Referrals Table -->
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Referral ID</th>
                                    <th>Student Name</th>
                                    <th>Grade</th>
                                    <th>Reason</th>
                                    <th>Submitted</th>
                                    <th>Urgency</th>
                                    <th>Stage</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="referralsTableBody">
                                <tr>
                                    <td colspan="9" class="text-center p-5 text-muted">No referrals found</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Create Referral (Walk-in) — floating modal that mirrors the
         teacher's Create Referral form (guidelines checklist + multi-person
         cards with student search), for a student who comes to the
         guidance office directly instead of via a teacher-submitted
         referral. -->
    <div id="createReferralModal" class="modal modal-lg">
        <div class="modal-content" style="max-width:860px;">
            <div class="modal-header">
                <h2><i class="bi bi-person-plus"></i> Create Referral (Walk-in)</h2>
                <button type="button" class="modal-close" id="cancelReferralFormBtn" title="Close">&times;</button>
            </div>
            <div class="modal-body">
                <p class="text-muted" style="margin-top:-6px;">For a student who comes to the guidance office directly, without a teacher-submitted referral.</p>

                <!-- People already logged for this referral, collapsed to file icons — same idea as teacher/referral-form's #peopleChips. -->
                <div id="walkInPeopleChips" class="walkin-people-chips-bar"></div>

                <details class="walkin-guidelines">
                    <summary><i class="bi bi-clipboard-check"></i> Guidelines in Referring Students to GCO <i class="bi bi-chevron-down walkin-guidelines-caret"></i></summary>
                    <div class="walkin-guidelines-body">
                        <div class="guidelines-part">
                            <h4 class="guidelines-subtitle">A. CHECK THE LEARNER'S BEHAVIORS THAT INDICATE THE NEED FOR HELP:</h4>
                            <div class="guidelines-checklist">
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_difficult_to_get_along" value="true">
                                    <span>Frequently difficult to get along with; counseling would likely manifest the following behaviors.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_talks_aloud" value="true">
                                    <span>Talks aloud and distracts other in class</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_absent_tardy" value="true">
                                    <span>Frequently absent or tardy</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_performs_poorly" value="true">
                                    <span>Performs very poorly in both academic and non-academic activities</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_lack_motivation" value="true">
                                    <span>Shows lack of interest and motivation in his or her studies</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_isolates" value="true">
                                    <span>Isolates himself or herself from the group</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_emotionally_upset" value="true">
                                    <span>Appears to be emotionally upset - anxious, depressed, irritable, angry, etc.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_fails_submit_work" value="true">
                                    <span>Fails to submit work on time</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_poor_handwriting" value="true">
                                    <span>Manifests poor handwriting or illegible penmanship</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_dramatic_weight" value="true">
                                    <span>Shows signs of dramatic weight loss or gain, etc.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="behavior_talks_suicide" value="true">
                                    <span><strong>Talks about SUICIDE</strong></span>
                                </label>
                            </div>
                        </div>

                        <div class="guidelines-part">
                            <h4 class="guidelines-subtitle">B. TALK TO THE LEARNER ABOUT THE NEED TO SEEK PROFESSIONAL HELP:</h4>
                            <div class="guidelines-checklist">
                                <label class="guideline-item">
                                    <input type="checkbox" name="talk_inform_learner" value="true">
                                    <span>Inform the learner and/or parent regarding the behaviors and that you believe counseling would likely manifest the following behaviors.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="talk_suggest" value="true">
                                    <span>Suggest to the learner (and parents) that they consider services provided by the GCO for free.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="talk_listen" value="true">
                                    <span>Listen to the person's situation.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="talk_prepare_learner" value="true">
                                    <span>Prepare a learner has the right to refuse a referral without incurring consequences.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="talk_responsibility" value="true">
                                    <span>However, if the behavior endangers his or her well-being, it is your responsibility to provide such help to do the learner without necessarily getting his or her consent.</span>
                                </label>
                                <label class="guideline-item">
                                    <input type="checkbox" name="talk_inform_parents" value="true">
                                    <span>You should inform the parents in a calm, objective, confidential manner.</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </details>

                <form id="newReferralForm">
                    <div class="referral-people-section">
                        <div class="referral-people-heading">
                            <div>
                                <label>People Involved: <span id="peopleCount" class="referral-people-count"></span></label>
                                <p class="referral-people-hint">Add everyone involved in this incident — each person gets their own referral record. Tag each one as Offender or Victim if applicable.</p>
                            </div>
                            <button type="button" id="addPersonBtn" class="btn btn-primary btn-sm referral-add-person-btn">
                                <i class="bi bi-person-plus"></i> Add Another Person
                            </button>
                        </div>
                        <div id="peopleList"></div>
                    </div>

                    <div class="form-field">
                        <label>Reason/s for Referral: *</label>
                        <textarea id="newRefReason" required rows="3"></textarea>
                    </div>

                    <div class="form-field">
                        <label>Initial Actions Taken:</label>
                        <textarea id="newRefIntervention" rows="2"></textarea>
                    </div>

                    <div class="form-row-three">
                        <div class="form-field">
                            <label>Referred by:</label>
                            <input type="text" id="walkInReferrerName" readonly>
                        </div>
                        <div class="form-field">
                            <label>Designation:</label>
                            <input type="text" id="walkInReferrerDesignation" readonly>
                        </div>
                        <div class="form-field">
                            <label>Contact Number:</label>
                            <input type="tel" id="walkInReferrerContact" placeholder="e.g. 0917 123 4567">
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn btn-success">Submit Referral</button>
                        <button type="button" class="btn btn-secondary" id="cancelReferralFormBtn2">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Edit Person Modal — same floating pattern as
         teacher/referral-form's #personEditModal: clicking a
         collapsed chip in #walkInPeopleChips reopens that person's full
         card here instead of scrolling back into the form. -->
    <div id="walkInPersonEditModal" class="modal person-edit-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="walkInPersonEditModalTitle">Edit Person</h2>
                <span class="modal-close" id="walkInPersonEditModalClose">&times;</span>
            </div>
            <div class="modal-body" id="walkInPersonEditModalBody"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-ghost person-edit-remove-btn" id="walkInPersonEditModalRemove">
                    <i class="bi bi-trash3"></i> Remove This Person
                </button>
                <button type="button" class="btn btn-primary" id="walkInPersonEditModalDone">Done</button>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/counselor/referral-status.js') }}?v={{ filemtime(public_path('pages/counselor/referral-status.js')) }}"></script>
</body>
</html>
