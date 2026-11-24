// As-you-type bad-word warning for fields students write in. Asks
// api/profanity-check (the same word lists the server applies when the text
// is saved), shows which words to rephrase right under the field (masked,
// e.g. "g**o"), and holds the form's submit button until they're gone. The
// server checks again on save, so this only spares students a round trip.
//
//   const guard = ProfanityGuard.attach(textarea, { submit: button });
//   if (!(await guard.ready())) return;             // just before sending
//   ProfanityGuard.showServerResult(textarea, data); // after a 422 "profanity"
//
// Needs js/utils.js (escapeHtml).

const ProfanityGuard = (() => {
    const API = '../../api/profanity-check';
    const DELAY_MS = 450;
    let noticeCount = 0;

    function noticeFor(field) {
        if (!field._profanityNotice) {
            const notice = document.createElement('div');
            notice.className = 'profanity-notice';
            notice.id = `profanityNotice${++noticeCount}`;
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            notice.hidden = true;
            field.insertAdjacentElement('afterend', notice);
            field._profanityNotice = notice;
        }
        return field._profanityNotice;
    }

    // Shows or clears the warning for `result` ({clean, matches}).
    function render(field, result) {
        const notice = noticeFor(field);
        const submit = field._profanitySubmit;
        const flagged = Boolean(result && result.clean === false);

        field.classList.toggle('has-profanity', flagged);
        field.setAttribute('aria-invalid', flagged ? 'true' : 'false');
        if (flagged) {
            field.setAttribute('aria-describedby', notice.id);
            const words = (result.matches || []).slice(0, 5)
                .map(m => `<strong>${escapeHtml(m.masked)}</strong>`).join(', ');
            notice.innerHTML = `<i class="bi bi-exclamation-octagon" aria-hidden="true"></i>
                <span>Please rephrase without ${words || 'the flagged words'}. Feedback has to stay respectful, but you can still say exactly what happened.</span>`;
        }
        notice.hidden = !flagged;

        if (submit) {
            if (flagged) {
                submit.disabled = true;
                submit.dataset.profanityHeld = '1';
            } else if (submit.dataset.profanityHeld) {
                submit.disabled = false;
                delete submit.dataset.profanityHeld;
            }
        }
    }

    function attach(field, { submit = null } = {}) {
        if (!field) return null;
        field._profanitySubmit = submit;
        if (field._profanityGuard) return field._profanityGuard;

        let timer = null;
        let controller = null;

        // The check for the field's current text: {clean, matches}, or null
        // when it couldn't be checked (then the server decides on save).
        async function run() {
            const text = field.value;
            if (!text.trim()) {
                render(field, { clean: true, matches: [] });
                return { clean: true, matches: [] };
            }
            if (controller) controller.abort();
            controller = new AbortController();
            try {
                const response = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text }),
                    signal: controller.signal
                });
                const data = await response.json();
                if (!response.ok || !data.success || field.value !== text) return null;
                render(field, data);
                return data;
            } catch (error) {
                return null;
            }
        }

        field.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(run, DELAY_MS);
        });

        const guard = {
            // True when the text is fine to send (or couldn't be checked).
            async ready() {
                clearTimeout(timer);
                const result = await run();
                return !(result && result.clean === false);
            },
            reset() {
                clearTimeout(timer);
                render(field, { clean: true, matches: [] });
            }
        };
        field._profanityGuard = guard;
        return guard;
    }

    // Shows the words the server refused (its 422 "profanity" response).
    function showServerResult(field, data) {
        if (!field || !data) return;
        render(field, { clean: false, matches: data.matches || [] });
        field.focus();
    }

    return { attach, showServerResult };
})();
