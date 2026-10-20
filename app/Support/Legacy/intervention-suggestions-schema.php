<?php

/**
 * Reusable "Other intervention" suggestions for Stage 4 — learns from what
 * counselors actually type into the Other Intervention field (see
 * api/referral-intervention.php's POST handler) and offers the most-used
 * ones back as autocomplete suggestions, filtered by the referral's own
 * Reason for Referral (api/intervention-suggestions.php).
 *
 * intervention_suggestions holds each distinct intervention name once —
 * NormalizedName is the lowercase+whitespace-collapsed form used to dedupe
 * "Parent coordination" / "parent coordination" / "PARENT COORDINATION" as
 * the same row — with a running UsageCount. intervention_reason_map is the
 * many-to-many link to referral.Reason's own values: referral_reason has no
 * dedicated reasons table of its own (see teacher/referral-form.js's
 * collectReferralReason(), which just joins checked boxes with "; "), so
 * ReasonName here stores that same string, not a foreign key.
 *
 * Pure-function file (no top-level execution) so it's safe to require from
 * multiple entry points, the same way profile-schema.php/grade-scope.php
 * already are.
 */
function ensure_intervention_suggestions_tables(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    $conn->query("
        CREATE TABLE IF NOT EXISTS intervention_suggestions (
            InterventionID INT NOT NULL AUTO_INCREMENT,
            InterventionName VARCHAR(255) NOT NULL,
            NormalizedName VARCHAR(255) NOT NULL,
            UsageCount INT NOT NULL DEFAULT 0,
            Status VARCHAR(20) NOT NULL DEFAULT 'active',
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (InterventionID),
            UNIQUE KEY uniq_normalized_name (NormalizedName)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");

    $conn->query("
        CREATE TABLE IF NOT EXISTS intervention_reason_map (
            MapID INT NOT NULL AUTO_INCREMENT,
            InterventionID INT NOT NULL,
            ReasonName VARCHAR(255) NOT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (MapID),
            UNIQUE KEY uniq_intervention_reason (InterventionID, ReasonName),
            KEY idx_reason (ReasonName),
            CONSTRAINT fk_intervention_reason_map_intervention
                FOREIGN KEY (InterventionID) REFERENCES intervention_suggestions (InterventionID)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    ");
}

// Case/whitespace-insensitive key so "Parent coordination" and "parent
// coordination" resolve to the same intervention_suggestions row.
function normalize_intervention_name(string $name): string {
    return mb_strtolower(trim(preg_replace('/\s+/', ' ', $name)));
}

/**
 * Records one intervention name as used on a saved Stage 4 session:
 * increments UsageCount if it already exists (matched case/whitespace-
 * insensitively), otherwise creates it with UsageCount = 1 — then links it
 * to every reason passed in (INSERT IGNORE, so the same pair is never
 * recorded twice). $reasons is the referral's own split Reason values —
 * see split_referral_reasons() below.
 */
function record_intervention_usage(mysqli $conn, string $name, array $reasons): void {
    $name = trim(preg_replace('/\s+/', ' ', $name));
    if ($name === '') {
        return;
    }
    $normalized = normalize_intervention_name($name);

    $stmt = $conn->prepare('SELECT InterventionID FROM intervention_suggestions WHERE NormalizedName = ?');
    $stmt->bind_param('s', $normalized);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($existing) {
        $interventionId = (int)$existing['InterventionID'];
        $stmt = $conn->prepare('UPDATE intervention_suggestions SET UsageCount = UsageCount + 1 WHERE InterventionID = ?');
        $stmt->bind_param('i', $interventionId);
        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $conn->prepare('INSERT INTO intervention_suggestions (InterventionName, NormalizedName, UsageCount) VALUES (?, ?, 1)');
        $stmt->bind_param('ss', $name, $normalized);
        $stmt->execute();
        $interventionId = $stmt->insert_id;
        $stmt->close();
    }

    foreach ($reasons as $reason) {
        $reason = trim((string)$reason);
        if ($reason === '') {
            continue;
        }
        $stmt = $conn->prepare('INSERT IGNORE INTO intervention_reason_map (InterventionID, ReasonName) VALUES (?, ?)');
        $stmt->bind_param('is', $interventionId, $reason);
        $stmt->execute();
        $stmt->close();
    }
}

// Splits a referral_reason value the same way teacher/referral-form.js's
// collectReferralReason() built it — semicolon-separated.
function split_referral_reasons(?string $reasonString): array {
    if (!$reasonString) {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(';', $reasonString)), fn($r) => $r !== ''));
}
