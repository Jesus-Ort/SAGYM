<template>
    <UCard class="w-5/6 justify-center text-center m-auto mt-10">
        <AutoForm
            :schema="schema"
            :config="{ submit: { props: { label: 'Iniciar Sesión', loading, disabled: loading } } }"
            @submit="login"
        />
    </UCard>
</template>

<script setup>
import * as z from 'zod'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'

const api = useApi()
const loading = ref(false)
const error = ref('')

const schema = z.object({
    email: z.email()
        .nonempty()
        .meta({
        title: 'Ingresa tu correo',
        required: true,
        input: {
            props: {
            placeholder: 'Correo',
            },
        },
        }),
    password: z.string()
        .nonempty()
        .meta({
        title: 'Ingresa tu Contraseña',
        required: true,
        input: {
            props: {
            placeholder: 'Contraseña',
            },
        },
        }),
        
})

const login = async (schema) => {
    loading.value = true
    error.value = ''

    try {
        await api.post('/auth/login', schema)
        await navigateTo('/home')
        useToast().add({ title: 'Exito', description: 'Logeado correctamente', color: 'success' })
    } catch (err) {
        error.value = err instanceof api.ApiError
        ? err.message
        : 'No se pudo conectar con el servidor. Inténtalo nuevamente.'
        useToast().add({ title: 'Error', description: error, color: 'error' })
    } finally {
        loading.value = false
    }
}
</script>