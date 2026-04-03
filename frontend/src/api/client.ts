import axios, { AxiosError, AxiosResponse } from 'axios'

// In production, VITE_API_URL points to the Render backend URL.
// In development, Vite proxy handles /api → localhost:8000.
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
client.interceptors.request.use(
  (config) => {
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// Response interceptor
client.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status
      const data = error.response.data as { detail?: string }

      if (status === 404) {
        console.warn('Resource not found:', error.config?.url)
      } else if (status === 500) {
        console.error('Server error:', data?.detail || 'Internal server error')
      } else if (status === 422) {
        console.error('Validation error:', data)
      }
    } else if (error.request) {
      console.error('Network error — backend may be offline')
    }
    return Promise.reject(error)
  }
)

export default client
