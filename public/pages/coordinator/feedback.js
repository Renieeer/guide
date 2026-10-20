// Feedback Script

function initFeedbackPage() {
    initPage();
    loadFeedbackHistory();
    document.getElementById('feedbackForm').addEventListener('submit', submitFeedback);
}

function submitFeedback(e) {
    e.preventDefault();

    const user = getCurrentUser();
    const formData = new FormData(document.getElementById('feedbackForm'));

    const feedback = {
        id: generateId(),
        type: formData.get('feedbackType'),
        title: formData.get('feedbackTitle'),
        content: formData.get('feedbackContent'),
        allowResponse: document.getElementById('allowResponse').checked,
        submittedBy: user.email,
        submittedByName: user.name,
        date: new Date().toISOString(),
        status: 'received',
        response: null
    };

    let feedbacks = getData('feedback') || [];
    feedbacks.push(feedback);
    saveData('feedback', feedbacks);

    showAlert('Feedback submitted successfully! Thank you for your input.', 'success');
    document.getElementById('feedbackForm').reset();
    loadFeedbackHistory();
}

function loadFeedbackHistory() {
    const feedbacks = getData('feedback') || [];
    const user = getCurrentUser();
    const userFeedbacks = feedbacks.filter(f => f.submittedBy === user.email);
    const tbody = document.getElementById('feedbackTableBody');

    if (userFeedbacks.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="6" style="text-align: center; padding: 30px; color: #999;">No feedback submitted yet</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = userFeedbacks.reverse().map(feedback => `
        <tr>
            <td>${formatDate(feedback.date)}</td>
            <td>${feedback.type}</td>
            <td>${feedback.title}</td>
            <td>${createBadge(feedback.status)}</td>
            <td>${feedback.response ? feedback.response : '-'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteFeedback('${feedback.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function deleteFeedback(feedbackId) {
    if (confirm('Are you sure you want to delete this feedback?')) {
        let feedbacks = getData('feedback') || [];
        feedbacks = feedbacks.filter(f => f.id !== feedbackId);
        saveData('feedback', feedbacks);
        showAlert('Feedback deleted successfully!', 'success');
        loadFeedbackHistory();
    }
}

document.addEventListener('DOMContentLoaded', initFeedbackPage);

