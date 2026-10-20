// Counselor Feedback Script

function initFeedbackPage() {
    initPage();
    loadFeedback();
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
        message: formData.get('feedbackMessage'),
        anonymous: document.getElementById('anonymousFeedback').checked,
        submittedBy: document.getElementById('anonymousFeedback').checked ? 'Anonymous' : user.email,
        date: new Date().toISOString(),
        status: 'received'
    };

    let feedbacks = getData('counselorFeedback') || [];
    feedbacks.push(feedback);
    saveData('counselorFeedback', feedbacks);

    showAlert('Feedback submitted successfully! Thank you for your input.', 'success');
    document.getElementById('feedbackForm').reset();
    loadFeedback();
}

function loadFeedback() {
    const feedbacks = getData('counselorFeedback') || [];
    const user = getCurrentUser();
    const userFeedbacks = feedbacks.filter(f => f.submittedBy === user.email || f.submittedBy === 'Anonymous');
    const tbody = document.getElementById('feedbackTableBody');

    if (userFeedbacks.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="5" style="text-align: center; padding: 30px; color: #999;">No feedback submitted yet</td>
        </tr>`;
        return;
    }

    tbody.innerHTML = userFeedbacks.reverse().map(feedback => `
        <tr>
            <td>${formatDate(feedback.date)}</td>
            <td>${feedback.type}</td>
            <td>${feedback.title}</td>
            <td>${createBadge(feedback.status)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteFeedback('${feedback.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function deleteFeedback(feedbackId) {
    if (confirm('Are you sure you want to delete this feedback?')) {
        let feedbacks = getData('counselorFeedback') || [];
        feedbacks = feedbacks.filter(f => f.id !== feedbackId);
        saveData('counselorFeedback', feedbacks);
        showAlert('Feedback deleted!', 'success');
        loadFeedback();
    }
}

document.addEventListener('DOMContentLoaded', initFeedbackPage);

