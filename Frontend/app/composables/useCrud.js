export const useCrud = (endpoint, options = {}) => {
  const api = useApi()

  const idKey = options.idKey || 'id'
  const service = options.service || {}

  const items = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const removing = ref(false)
  const error = ref(null)

  const normalizeError = (err) =>
    err instanceof api.ApiError
      ? err.message
      : 'No se pudo conectar con el servidor. Inténtalo nuevamente.'

  const withQuery = (path, params) => {
    if (!params) return path

    const entries = Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )

    if (!entries.length) return path

    return `${path}?${new URLSearchParams(entries).toString()}`
  }

  const extractList = (response) => {
    if (Array.isArray(response)) return response
    if (Array.isArray(response?.data)) return response.data
    if (Array.isArray(response?.items)) return response.items
    if (Array.isArray(response?.results)) return response.results
    return []
  }

  const list = async (params) => {
    loading.value = true
    error.value = null

    try {
      const response = service.list
        ? await service.list(params)
        : await api.get(withQuery(endpoint, params))

      items.value = extractList(response)
      return items.value
    } catch (err) {
      error.value = normalizeError(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const create = async (payload) => {
    saving.value = true
    error.value = null

    try {
      const response = service.create
        ? await service.create(payload)
        : await api.post(endpoint, payload)

      return response
    } catch (err) {
      error.value = normalizeError(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  const update = async (id, payload) => {
    saving.value = true
    error.value = null

    try {
      const path = `${endpoint}/${encodeURIComponent(id)}`

      const response = service.update
        ? await service.update(id, payload)
        : await api.patch(path, payload)

      return response
    } catch (err) {
      error.value = normalizeError(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  const remove = async (id) => {
    removing.value = true
    error.value = null

    try {
      const path = `${endpoint}/${encodeURIComponent(id)}`

      const response = service.remove
        ? await service.remove(id)
        : await api.delete(path)

      return response
    } catch (err) {
      error.value = normalizeError(err)
      throw err
    } finally {
      removing.value = false
    }
  }

  return {
    items,
    loading,
    saving,
    removing,
    error,
    list,
    create,
    update,
    remove,
  }
}
