<template>
    <!-- HERO -->
    <UPageHero
        title="SAGYM"
        headline="Gestiona tu gimnasio"
        description="Tu gimnasio. Bajo control."
    >
    </UPageHero>

    <USeparator />

    <!-- CTA -->
    <UPageCTA
        title="Tu gimnasio. Bajo control."
        description="Únete a Sagym"
        :links="links"
    />
</template>

<script setup>
    const links = ref([
    {
        label: 'Contáctanos',
        to: '/contacto',
        icon: 'i-lucide-mail-plus',
        size: 'xl'
    },
    {
        label: 'Iniciar sesión',
        to: '/login',
        variant: 'subtle',
        icon: 'i-lucide-log-in'
    }
    ])
</script>