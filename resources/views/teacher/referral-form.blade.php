<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" type="image/jpeg" href="{{ asset('img/deped-seal.jpg') }}">
    <script src="{{ asset('js/loader.js') }}?v={{ filemtime(public_path('js/loader.js')) }}"></script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Submit Referral - Guidance Management System</title>
    <link rel="stylesheet" href="{{ asset('css/style.css') }}?v={{ filemtime(public_path('css/style.css')) }}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
</head>
<body>
    <div class="main-wrapper">
        <!-- Sidebar -->
        @include('partials.sidebar-teacher')
        <!-- Main Content -->
        <div class="main-content">
            <!-- Page Hero -->
            <div class="page-hero">
                <div>
                    <div class="page-hero-eyebrow"><i class="bi bi-file-earmark-text"></i> Documentation</div>
                    <h2 class="page-hero-title">Create Referral</h2>
                    <p class="page-hero-text">Submit a new student referral to the school guidance office for counselor attention.</p>
                </div>
            </div>

            <!-- Page Content -->
            <div class="page-content">
                <!-- People already logged for this referral, collapsed to file icons -->
                <div id="peopleChips" class="referral-people-chips-bar"></div>

                <div class="referral-container">
                    <div class="guidelines-section">
                        <h3 class="guidelines-title"><i class="bi bi-clipboard-check"></i> Guidelines in Referring Students to GCO</h3>
                        
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

                    <form id="referralForm" class="referral-form">
                    <div class="form-title">COUNSELING REFERRAL FORM</div>

                    <input type="hidden" id="studentSchool" name="studentSchool">

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

                    <!-- Date of Referral (Auto-populated from database) -->
                    <input type="hidden" id="referralDate" name="referralDate">

                    <div class="form-field">
                        <label>Reason/s for Referral: <span style="color: var(--danger-color);">*</span></label>
                        <div class="guidelines-checklist referral-reason-checklist">
                            <label class="guideline-item">
                                <input type="checkbox" class="referral-reason-check" value="Behavioral or conduct problem">
                                <span>Behavioral or conduct problem</span>
                            </label>
                            <label class="guideline-item">
                                <input type="checkbox" class="referral-reason-check" value="Self-harming behavior or suicide ideation">
                                <span>Self-harming behavior or suicide ideation</span>
                            </label>
                            <label class="guideline-item">
                                <input type="checkbox" class="referral-reason-check" value="Poor social skills">
                                <span>Poor social skills</span>
                            </label>
                            <label class="guideline-item">
                                <input type="checkbox" class="referral-reason-check" value="Poor academic performance">
                                <span>Poor academic performance</span>
                            </label>
                            <label class="guideline-item">
                                <input type="checkbox" class="referral-reason-check" value="Difficulty in adapting to current situation">
                                <span>Difficulty in adapting to current situation</span>
                            </label>
                            <label class="guideline-item">
                                <input type="checkbox" class="referral-reason-check" value="Signs of distress (physical deterioration, lack of focus and motivation)">
                                <span>Signs of distress characterized by physical deterioration, lack of focus and motivation</span>
                            </label>
                            <label class="guideline-item">
                                <input type="checkbox" id="referralReasonOtherCheck">
                                <span>Others (please specify)</span>
                            </label>
                        </div>
                        <input type="text" id="referralReasonOtherText" class="referral-reason-other-input" placeholder="Specify other reason..." style="display:none;">
                    </div>

                    <div class="form-field">
                        <label>Description: <span style="color: var(--danger-color);">*</span></label>
                        <textarea id="referralDescription" name="referralDescription" placeholder="Describe the incident or concern in more detail..." required></textarea>
                    </div>

                    <div class="form-field">
                        <label>Initial Actions Taken: <span style="color: var(--danger-color);">*</span></label>
                        <textarea id="interventionAttempts" name="interventionAttempts" required></textarea>
                    </div>

                    <div class="form-row-three">
                        <div class="form-field">
                            <label>Referred by:</label>
                            <input type="text" id="teacherName" name="teacherName" readonly>
                        </div>

                        <div class="form-field">
                            <label>Designation:</label>
                            <input type="text" id="teacherDesignation" name="teacherDesignation" readonly>
                        </div>

                        <div class="form-field">
                            <label>Contact Number: <span style="color: var(--danger-color);">*</span></label>
                            <input type="tel" id="teacherContact" name="teacherContact" placeholder="e.g. 0917 123 4567" required>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn btn-success">Submit Referral</button>
                        <button type="reset" class="btn btn-secondary">Clear Form</button>
                    </div>
                </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Person Modal: clicking a collapsed file-icon opens their full
         info here, floating above everything, instead of jumping back into
         the form (which used to push the rest of the page around). -->
    <div id="personEditModal" class="modal person-edit-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="personEditModalTitle">Edit Person</h2>
                <span class="modal-close" id="personEditModalClose">&times;</span>
            </div>
            <div class="modal-body" id="personEditModalBody"></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-ghost person-edit-remove-btn" id="personEditModalRemove">
                    <i class="bi bi-trash3"></i> Remove This Person
                </button>
                <button type="button" class="btn btn-primary" id="personEditModalDone">Done</button>
            </div>
        </div>
    </div>

    <script src="{{ asset('js/auth.js') }}?v={{ filemtime(public_path('js/auth.js')) }}"></script>
    <script src="{{ asset('js/utils.js') }}?v={{ filemtime(public_path('js/utils.js')) }}"></script>
    <script src="{{ asset('pages/teacher/referral-form.js') }}?v={{ filemtime(public_path('pages/teacher/referral-form.js')) }}"></script>
</body>
</html>
