<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
  >
    <template #body>
      <!-- Con #form el consumidor reemplaza el formulario y se encarga de sus propios botones. -->
      <slot
        name="form"
        :submit="onSubmit"
        :close="close"
        :loading="loading"
        :initial-state="initialState"
      >
        <AutoForm
          ref="autoForm"
          :schema="schema"
          :initial-state="initialState"
          :config="formConfig"
          @submit="onSubmit"
        />
      </slot>
    </template>

    <template v-if="!hasCustomForm" #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="cancelLabel"
          :disabled="loading"
          @click="open = false"
        />

        <UButton
          color="primary"
          :label="submitLabel"
          :loading="loading"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { computed, ref, useSlots } from 'vue'

const open = defineModel('open', { type: Boolean, default: false })

const props = defineProps({
  schema: { type: Object, default: () => ({}) },
  initialState: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Guardar' },
  cancelLabel: { type: String, default: 'Cancelar' },
  config: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['submit'])

const slots = useSlots()
const autoForm = ref(null)

const hasCustomForm = computed(() => !!slots.form)

// El botón de envío lo controla el footer del modal, así que
// desactivamos el botón interno de AutoForm salvo que se indique lo contrario.
const formConfig = computed(() => ({ submit: false, ...props.config }))

const close = () => {
  open.value = false
}

const submit = () => {
  autoForm.value?.submit()
}

const onSubmit = (data) => {
  emit('submit', data)
}
</script>
