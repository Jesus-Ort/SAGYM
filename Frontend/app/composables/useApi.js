export const useApi = () => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.data = data
    }
  }

  const request = async (method, path, options = {}) => {
    const url = `${baseURL}${path}`
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    const fetchOptions = {
      method,
      headers,
      credentials: 'include',
      ...options,
    }

    if (options.body && typeof options.body === 'object') {
      fetchOptions.body = JSON.stringify(options.body)
    }

    try {
      const response = await fetch(url, fetchOptions)

      if (!response.ok) {
        let errorData = null
        try {
          errorData = await response.json()
        } catch {
          errorData = await response.text()
        }

        const message = errorData?.message || errorData || `Error ${response.status}`
        throw new ApiError(message, response.status, errorData)
      }

      if (response.status === 204) {
        return null
      }

      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        return await response.json()
      }

      return await response.text()
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError(error.message || 'Error de red', 0, null)
    }
  }

  return {
    get: (path, options = {}) => request('GET', path, options),
    post: (path, body, options = {}) => request('POST', path, { ...options, body }),
    put: (path, body, options = {}) => request('PUT', path, { ...options, body }),
    patch: (path, body, options = {}) => request('PATCH', path, { ...options, body }),
    delete: (path, options = {}) => request('DELETE', path, options),
    ApiError,
  }
}