<template>
    <div class="min-h-screen bg-default flex flex-col">
        <UHeader
        title="SAGYM"
        to="/"
        :toggle="false"
        class="border-b border-default"
        >
        <template #left>
            <div class="flex items-center gap-2">
            <NuxtLink
                to="/"
                class="flex items-center gap-2 font-bold text-lg"
            >
                <div
                class="flex size-8 items-center justify-center rounded-lg bg-primary text-white"
                >
                S
                </div>

                <span class="hidden sm:inline">
                SAGYM
                </span>
            </NuxtLink>
            </div>
        </template>

        <template #default>
            <UNavigationMenu
            :items="navigation"
            orientation="horizontal"
            class="hidden lg:flex"
            />
        </template>

        <template #right>
            <UButton
                icon="i-lucide-log-out"
                color="error"
                variant="ghost"
                label="Cerrar sesión"
                to="/"
            />
        </template>
        </UHeader>

        <UMain class="flex-1">
        <slot />
        </UMain>

        <UFooter class="border-t border-default">
        <template #left>
            <p class="text-muted text-sm">
            © {{ new Date().getFullYear() }} SAGYM
            </p>
        </template>

        <template #right>
            <p class="text-muted text-sm">
            Gestión inteligente para gimnasios
            </p>
        </template>
        </UFooter>
    </div>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const navigation: NavigationMenuItem[] = [
    {
        label: 'Inicio',
        icon: 'i-lucide-layout-dashboard',
        to: '/home'
    },
    {
        label: 'Clientes',
        icon: 'i-lucide-users',
        to: '/clientes'
    },
    {
        label: 'Mensualidades',
        icon: 'i-lucide-calendar-check',
        to: '/mensualidades'
    },
    {
        label: 'Pagos',
        icon: 'i-lucide-credit-card',
        to: '/pagos'
    },
    {
        label: 'Entradas',
        icon: 'i-lucide-log-in',
        to: '/entradas'
    },
    {
        label: 'Usuarios',
        icon: 'i-lucide-user-cog',
        to: '/usuarios'
    },
    {
        label: 'Configuración',
        icon: 'i-lucide-settings',
        to: '/settings'
    }
]

</script>