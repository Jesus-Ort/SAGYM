<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <h2 v-if="title" class="text-lg font-semibold text-highlighted">
        {{ title }}
      </h2>

      <div class="ml-auto flex items-center gap-2">
        <slot name="actions" />

        <UButton
          v-if="canCreate"
          icon="i-lucide-plus"
          color="primary"
          :label="createLabel"
          @click="openCreate"
        />
      </div>
    </div>

    <CrudTable
      :data="items"
      :columns="columns"
      :loading="loading"
      :searchable="searchable"
      :page-size="pageSize"
      :can-edit="canEdit"
      :can-delete="canDelete"
      :empty-text="emptyText"
      :search-placeholder="searchPlaceholder"
      @edit="openEdit"
      @delete="askDelete"
    >
      <template
        v-for="name in forwardedSlotNames"
        :key="name"
        #[name]="slotProps"
      >
        <slot :name="name" v-bind="slotProps || {}" />
      </template>
    </CrudTable>

    <CrudForm
      :key="formKey"
      v-model:open="formOpen"
      :schema="schema"
      :initial-state="formInitialState"
      :title="formTitle"
      :loading="saving"
      :config="formConfig"
      :submit-label="editing ? 'Actualizar' : 'Guardar'"
      @submit="handleSubmit"
    >
      <!-- Reenvía #form solo si el consumidor lo definió, para no perder el AutoForm por defecto. -->
      <template
        v-for="name in formSlotNames"
        :key="name"
        #[name]="slotProps"
      >
        <slot :name="name" v-bind="slotProps || {}" />
      </template>
    </CrudForm>

    <UModal v-model:open="confirmOpen" title="Confirmar eliminación">
      <template #body>
        <p class="text-muted">
          {{ deleteMessage }}
        </p>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Cancelar"
            :disabled="removing"
            @click="confirmOpen = false"
          />

          <UButton
            color="error"
            label="Eliminar"
            :loading="removing"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, useSlots } from 'vue'
import { useCrud } from '~/composables/useCrud'

const props = defineProps({
  endpoint: { type: String, required: true },
  columns: { type: Array, default: () => [] },
  schema: { type: Object, default: () => ({}) },
  idKey: { type: String, default: 'id' },
  title: { type: String, default: '' },
  searchable: { type: Boolean, default: true },
  pageSize: { type: Number, default: 10 },
  canCreate: { type: Boolean, default: true },
  canEdit: { type: Boolean, default: true },
  canDelete: { type: Boolean, default: true },
  service: { type: Object, default: undefined },
  formConfig: { type: Object, default: () => ({}) },
  createLabel: { type: String, default: 'Nuevo' },
  createTitle: { type: String, default: 'Nuevo registro' },
  editTitle: { type: String, default: 'Editar registro' },
  emptyText: { type: String, default: 'No hay registros todavía.' },
  searchPlaceholder: { type: String, default: 'Buscar…' },
  deleteMessage: {
    type: String,
    default: 'Esta acción desactivará el registro. ¿Deseas continuar?',
  },
})

const emit = defineEmits(['created', 'updated', 'deleted', 'error'])

const toast = useToast()
const slots = useSlots()

const { items, loading, saving, removing, error, list, create, update, remove } =
  useCrud(props.endpoint, { idKey: props.idKey, service: props.service })

const formOpen = ref(false)
const confirmOpen = ref(false)
const editing = ref(null)
const pendingDelete = ref(null)
const formKey = ref(0)

const formInitialState = computed(() =>
  editing.value ? { ...editing.value } : {}
)

const formTitle = computed(() =>
  editing.value ? props.editTitle : props.createTitle
)

const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter(
    (name) =>
      /-(cell|header)$/.test(name) ||
      ['empty', 'loading', 'row-actions', 'toolbar'].includes(name)
  )
)

const formSlotNames = computed(() => (slots.form ? ['form'] : []))

const showError = (apiError) => {
  const message = apiError?.message || 'Ocurrió un error inesperado.'
  error.value = message
  emit('error', apiError)
  toast.add({ title: 'Error', description: message, color: 'error' })
}

const refresh = async () => {
  try {
    await list()
  } catch (apiError) {
    showError(apiError)
  }
}

onMounted(refresh)

const openCreate = () => {
  editing.value = null
  formKey.value += 1
  formOpen.value = true
}

const openEdit = (row) => {
  editing.value = row
  formKey.value += 1
  formOpen.value = true
}

const askDelete = (row) => {
  pendingDelete.value = row
  confirmOpen.value = true
}

const handleSubmit = async (payload) => {
  try {
    if (editing.value) {
      await update(editing.value[props.idKey], payload)
      toast.add({
        title: 'Registro actualizado',
        description: 'Los cambios se guardaron correctamente.',
        color: 'success',
      })
      emit('updated', payload)
    } else {
      await create(payload)
      toast.add({
        title: 'Registro creado',
        description: 'El registro se creó correctamente.',
        color: 'success',
      })
      emit('created', payload)
    }

    formOpen.value = false
    await refresh()
  } catch (apiError) {
    showError(apiError)
  }
}

const confirmDelete = async () => {
  if (!pendingDelete.value) return

  try {
    await remove(pendingDelete.value[props.idKey])
    toast.add({
      title: 'Registro eliminado',
      description: 'El registro se desactivó correctamente.',
      color: 'success',
    })
    emit('deleted', pendingDelete.value)

    confirmOpen.value = false
    pendingDelete.value = null

    await refresh()
  } catch (apiError) {
    showError(apiError)
  }
}

// Permite que el consumidor (vía ref) recargue datos o abra el modal de creación.
defineExpose({ refresh, openCreate })
</script>
