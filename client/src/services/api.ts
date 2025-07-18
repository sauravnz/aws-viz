import axios from 'axios';
import { AwsCredentials, ScanRequest, ScanResponse } from '../../../shared/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes timeout for AWS scans
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error);
    
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || error.response.statusText;
      throw new Error(`Server error (${error.response.status}): ${message}`);
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('No response from server. Please check your connection.');
    } else {
      // Something else happened
      throw new Error(`Request failed: ${error.message}`);
    }
  }
);

export const scanAwsInfrastructure = async (credentials: AwsCredentials): Promise<ScanResponse> => {
  try {
    const scanRequest: ScanRequest = { credentials };
    const response = await apiClient.post<ScanResponse>('/scan', scanRequest);
    return response.data;
  } catch (error) {
    console.error('Failed to scan AWS infrastructure:', error);
    throw error;
  }
};

export const getAvailableRegions = async (): Promise<{ regions: Array<{ code: string; name: string }> }> => {
  try {
    const response = await apiClient.get('/regions');
    return response.data;
  } catch (error) {
    console.error('Failed to get available regions:', error);
    throw error;
  }
};

export const healthCheck = async (): Promise<{ status: string; timestamp: string; version: string }> => {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
}; 