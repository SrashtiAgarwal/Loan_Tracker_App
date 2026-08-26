/**
 * Centralized Axios API Service
 * All API calls go through this service for consistent auth & error handling.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';

// Create a typed Axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Automatically attaches the Bearer token to every outgoing request.
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ─────────────────────────────────────────────────────
// Unwraps data and converts known error shapes into readable messages.
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    if (status === 401) {
      // Token expired — callers should redirect to login
      return Promise.reject(new Error('Session expired. Please login again.'));
    }
    if (status === 403) {
      return Promise.reject(new Error('You do not have permission to perform this action.'));
    }
    if (status === 404) {
      return Promise.reject(new Error(detail || 'Resource not found.'));
    }
    if (status === 429) {
      return Promise.reject(new Error('Too many attempts. Please wait and try again.'));
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Request timed out. Check your connection.'));
    }
    if (error.message === 'Network Error') {
      return Promise.reject(
        new Error('Cannot connect to server. Make sure the backend is running and both devices are on the same WiFi.')
      );
    }

    return Promise.reject(new Error(detail || error.message || 'An unexpected error occurred.'));
  }
);

// ─── Auth Endpoints ───────────────────────────────────────────────────────────
export const authAPI = {
  sendOTP: (phone_number: string) =>
    apiClient.post('/auth/send-otp', { phone_number }),

  verifyOTP: (phone_number: string, otp: string, name?: string, role?: string) =>
    apiClient.post('/auth/verify-otp', { phone_number, otp, name, role }),

  getMe: () => apiClient.get('/auth/me'),
};

// ─── Stats Endpoints ──────────────────────────────────────────────────────────
export const statsAPI = {
  getDashboard: () => apiClient.get('/stats/dashboard'),
};

// ─── Loans Endpoints ──────────────────────────────────────────────────────────
export const loansAPI = {
  list: (params?: { beneficiary_id?: string; status?: string }) =>
    apiClient.get('/loans', { params }),

  getOne: (loanId: string) => apiClient.get(`/loans/${loanId}`),

  create: (payload: {
    beneficiary_id: string;
    loan_id: string;
    purpose: string;
    amount: number;
    tenure_months: number;
    interest_rate?: number;
    status?: string;
    estimated_item_cost?: number;
  }) => apiClient.post('/loans', payload),

  updateStatus: (loanId: string, status: string) =>
    apiClient.put(`/loans/${loanId}/status`, null, { params: { status } }),
};

// ─── Beneficiaries Endpoints ──────────────────────────────────────────────────
export const beneficiariesAPI = {
  list: () => apiClient.get('/beneficiaries'),

  getOne: (beneficiaryId: string) => apiClient.get(`/beneficiaries/${beneficiaryId}`),

  create: (payload: {
    name: string;
    phone_number: string;
    address: string;
    aadhaar?: string;
    email?: string;
  }) => apiClient.post('/beneficiaries', payload),

  update: (beneficiaryId: string, payload: any) =>
    apiClient.put(`/beneficiaries/${beneficiaryId}`, payload),
};

// ─── Media Endpoints ──────────────────────────────────────────────────────────
export const mediaAPI = {
  upload: (payload: {
    loan_id: string;
    media_type: string;
    description?: string;
    media_base64: string;
    gps_coordinates: { latitude: number; longitude: number; accuracy?: number | null };
    device_info?: { device_model?: string; os_version?: string; app_version?: string };
    utensil_name?: string;
  }) => apiClient.post('/media/upload', payload),

  list: (params?: { beneficiary_id?: string; loan_id?: string; uploaded_by?: string }) =>
    apiClient.get('/media', { params }),

  getPendingReview: () => apiClient.get('/media/pending-review'),

  getMyLoans: () => apiClient.get('/media/my-loans'),

  getAIResult: (mediaId: string) => apiClient.get(`/ai-results/${mediaId}`),
};

// ─── Approvals Endpoints ──────────────────────────────────────────────────────
export const approvalsAPI = {
  create: (payload: {
    media_id: string;
    status: 'approved' | 'rejected' | 'reupload_requested';
    comments?: string;
  }) => apiClient.post('/approvals', payload),

  list: (params?: { media_id?: string; status?: string }) =>
    apiClient.get('/approvals', { params }),
};

// ─── Audit Endpoints ──────────────────────────────────────────────────────────
export const auditAPI = {
  list: (params?: { entity_type?: string; entity_id?: string; user_id?: string; limit?: number }) =>
    apiClient.get('/audit', { params }),
};

export default apiClient;
