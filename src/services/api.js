import axios from 'axios';

const translationClient = axios.create({
    baseURL: '/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

const historyClient = axios.create({
    baseURL: '/api',
    timeout: 60000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default {
    translate(params) {
        const formData = new FormData();
        for (const key in params) {
            if (params[key] !== null && params[key] !== undefined) {
                formData.append(key, params[key]);
            }
        }
        return translationClient.post('/translate', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        });
    },
    getStatus(taskId) {
        return translationClient.get(`/translate/${taskId}`);
    },
    cancelTranslation(taskId) {
        return translationClient.post(`/translate/${taskId}/stop`);
    },
    getConfig() {
        return translationClient.get('/config');
    },
    getHealth() {
        return translationClient.get('/status');
    },
    getVersion() {
        return translationClient.get('/version');
    },
    downloadTaskMono(taskId) {
        return translationClient.get(`/translate/${taskId}/download/mono`, { responseType: 'blob' });
    },
    downloadTaskDual(taskId) {
        return translationClient.get(`/translate/${taskId}/download/dual`, { responseType: 'blob' });
    },
    checkTaskExists(taskId) {
        return translationClient.get(`/translate/${taskId}`);
    },
    fetchJobs(params = {}) {
        return historyClient.get('/jobs', { params });
    },
    fetchJob(jobId) {
        return historyClient.get(`/jobs/${jobId}`);
    },
    fetchJobFiles(jobId) {
        return historyClient.get(`/jobs/${jobId}/files`);
    },
    renameJob(jobId, payload) {
        return historyClient.patch(`/jobs/${jobId}`, payload);
    },
    deleteJob(jobId, confirm = false) {
        return historyClient.delete(`/jobs/${jobId}`, { params: { confirm } });
    },
    deleteJobs(payload) {
        return historyClient.post('/jobs/delete', payload);
    },
    fetchFileText(fileId) {
        return historyClient.get(`/files/${fileId}`, { responseType: 'text' });
    },
};
