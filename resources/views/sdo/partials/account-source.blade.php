{{--
    "New account" vs "Existing account" for one role card of the School
    Access Setup form (coordinator / counselor / combined). Existing lets the
    SDO give a person who already has an account this school too; they then
    switch between their schools from their own dashboard. Wired up by
    initAccountSourcePickers() in pages/sdo/school-management.js.
    Expects $prefix: coordinator | counselor | combined.
--}}
<div class="account-source" data-account-source="{{ $prefix }}">
    <div class="account-source-toggle" role="radiogroup" aria-label="Account">
        <label class="account-source-option">
            <input type="radio" name="{{ $prefix }}AccountMode" value="new" checked>
            <span><i class="bi bi-person-plus"></i> New account</span>
        </label>
        <label class="account-source-option">
            <input type="radio" name="{{ $prefix }}AccountMode" value="existing">
            <span><i class="bi bi-person-check"></i> Existing account</span>
        </label>
    </div>

    <div class="existing-account-picker" data-existing-picker="{{ $prefix }}" hidden>
        <label for="{{ $prefix }}ExistingSearch">Find the person's account</label>
        <input type="search" id="{{ $prefix }}ExistingSearch" class="existing-account-search" placeholder="Type a name or email" autocomplete="off"
               role="combobox" aria-expanded="false" aria-controls="{{ $prefix }}ExistingResults" aria-autocomplete="list">
        <div class="existing-account-results" id="{{ $prefix }}ExistingResults" role="listbox"></div>
        <div class="existing-account-selected" data-existing-selected hidden></div>
        <input type="hidden" id="{{ $prefix }}ExistingId">
        <p class="existing-account-hint"><i class="bi bi-info-circle"></i> Their login stays the same. They'll pick this school from their dashboard.</p>
    </div>
</div>
