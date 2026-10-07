<template>
    <h1>Hi! - home </h1>
    <div>
        <UButton @click="user" :loading="loading">
        Probar GET /me
        </UButton>

        <div v-if="data">
            <p>ID: {{ data.user.id }}</p>
            <p>Nombre: {{ data.user.nombre_completo }}</p>
            <p>Gimnasio: {{ data.user.gimnasio_id }}</p>
            <p>Rol: {{ data.user.rol }}</p>
        </div>
        
    </div>
</template>
<script setup>
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'

const api = useApi()
const data = ref('')
const loading = ref(false)
const error = ref(null)

const user = async () => {
    loading.value = true
    error.value = null
    
    try {
        const respuesta = await api.get('/auth/me')
        data.value = respuesta
    } catch (err) {
        if (err instanceof api.ApiError) {
        error.value = `Error ${err.status}: ${err.message}`
        } else {
        error.value = err.message
        }
    } finally {
        loading.value = false
    }
}
</script>