<template>
    <UCard class="w-5/6 justify-center text-center m-auto mt-10">
        <AutoForm
            :schema="schema"
            :config="{ submit: { props: { label: 'Iniciar Sesión' } } }"
        />
    </UCard>
</template>

<script setup lang="ts">
import * as z from 'zod'

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
</script>