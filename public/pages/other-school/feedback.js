// Feedback Script (Combined Coordinator & Counselor)

function loadFeedback() {
    initPage();
    
    const form = document.getElementById('feedbackForm');
    form?.addEventListener('submit', handleFeedbackSubmit);

    displayFeedback();
}

function handleFeedbackSubmit(e) {
    e.preventDefault();

    const feedback = {
        id: 'FB-' + Date.now(),
        type: document.getElementById('feedbackType').value,
        message: document.getElementById('feedbackMessage').value,
        submittedBy: getCurrentUser().name || 'User',
        submittedDate: new Date().toISOString(),
        status: 'Received'
    };

    const feedbackList = getData('feedback') || [];
    feedbackList.push(feedback);
    saveData('feedback', feedbackList);

    alert('Feedback submitted successfully!');
    document.getElementById('feedbackForm').reset();
    displayFeedback();
}

function displayFeedback() {
    const feedbackList = getData('feedback') || [];
    const container = document.getElementById('feedbackList');

    if (feedbackList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No feedback received yet</p>';
        return;
    }

    container.innerHTML = feedbackList
        .reverse()
        .map(fb => `
            <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span class="badge ${getBadgeColor(fb.type)}">${fb.type.charAt(0).toUpperCase() + fb.type.slice(1)}</span>
                    <small style="color: #999;">${formatDate(fb.submittedDate)}</small>
                </div>
                <p style="margin: 10px 0;"><strong>${fb.submittedBy}</strong></p>
                <p style="margin: 0; word-wrap: break-word;">${fb.message}</p>
            </div>
        `).join('');
}

function getBadgeColor(type) {
    const colors = {
        'suggestion': 'badge-info',
        'complaint': 'badge-danger',
        'praise': 'badge-success',
        'other': 'badge-secondary'
    };
    return colors[type] || 'badge-secondary';
}

// Logout functionality
document.getElementById('logoutBtn')?.addEventListener('click', requestLogout);

