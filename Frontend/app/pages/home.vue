<template>
    <h1>Hi! - home </h1>
    <div>
        <UButton @click="saludar" :loading="loading">
        Probar GET /
        </UButton>

        <div v-if="error" class="text-red-500 mt-2">{{ error }}</div>
        <div v-if="mensaje" class="text-green-500 mt-2">{{ mensaje }}</div>
    </div>
</template>
<script setup>
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'

const api = useApi()
const mensaje = ref('')
const loading = ref(false)
const error = ref(null)

const saludar = async () => {
    loading.value = true
    error.value = null
    
    try {
        const respuesta = await api.get('/')
        mensaje.value = respuesta
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