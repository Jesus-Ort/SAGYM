<template>
  <div class="flex flex-col gap-4">
    <div v-if="searchable || $slots.toolbar" class="flex flex-wrap items-center gap-2">
      <UInput
        v-if="searchable"
        v-model="search"
        icon="i-lucide-search"
        :placeholder="searchPlaceholder"
        class="w-full max-w-sm"
      />

      <div class="ml-auto flex items-center gap-2">
        <slot name="toolbar" />
      </div>
    </div>

    <UTable
      :data="pagedRows"
      :columns="tableColumns"
      :loading="loading"
      :empty="emptyText"
    >
      <template
        v-for="col in columns"
        :key="`header-${col.key}`"
        #[`${col.key}-header`]="scope"
      >
        <slot :name="`${col.key}-header`" v-bind="scope">
          <UButton
            v-if="col.sortable !== false"
            color="neutral"
            variant="ghost"
            size="xs"
            class="-mx-2.5"
            :label="col.label"
            :icon="sortIcon(col.key)"
            @click="toggleSort(col.key)"
          />

          <span v-else>{{ col.label }}</span>
        </slot>
      </template>

      <template
        v-for="col in columns"
        :key="`cell-${col.key}`"
        #[`${col.key}-cell`]="scope"
      >
        <slot :name="`${col.key}-cell`" v-bind="scope">
          {{ formatCell(col, scope) }}
        </slot>
      </template>

      <template v-if="showActions" #actions-cell="scope">
        <slot
          name="row-actions"
          :row="scope.row.original"
          :edit="() => emit('edit', scope.row.original)"
          :remove="() => emit('delete', scope.row.original)"
        >
          <div class="flex justify-end gap-1">
            <UButton
              v-if="canEdit"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Editar"
              @click="emit('edit', scope.row.original)"
            />

            <UButton
              v-if="canDelete"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Eliminar"
              @click="emit('delete', scope.row.original)"
            />
          </div>
        </slot>
      </template>

      <template #empty>
        <slot name="empty">
          <div class="py-8 text-center text-sm text-muted">
            {{ emptyText }}
          </div>
        </slot>
      </template>

      <template v-if="loading" #loading>
        <slot name="loading" />
      </template>
    </UTable>

    <div v-if="total > pageSize" class="flex justify-end">
      <UPagination
        v-model:page="page"
        :items-per-page="pageSize"
        :total="total"
        :sibling-count="1"
        show-edges
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, useSlots } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  searchable: { type: Boolean, default: true },
  pageSize: { type: Number, default: 10 },
  emptyText: { type: String, default: 'No hay registros para mostrar.' },
  searchPlaceholder: { type: String, default: 'Buscar…' },
  searchKeys: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: true },
  canDelete: { type: Boolean, default: true },
})

const emit = defineEmits(['edit', 'delete'])

const slots = useSlots()

const search = ref('')
const page = ref(1)
const sortKey = ref(null)
const sortDir = ref('asc')

const searchKeys = computed(() =>
  props.searchKeys.length ? props.searchKeys : props.columns.map((col) => col.key)
)

const showActions = computed(
  () => props.canEdit || props.canDelete || !!slots['row-actions']
)

const alignClass = (col) => {
  if (col.align === 'right') return 'text-right'
  if (col.align === 'center') return 'text-center'
  return 'text-left'
}

const tableColumns = computed(() => {
  const cols = props.columns.map((col) => ({
    accessorKey: col.key,
    id: col.key,
    header: col.label,
    enableSorting: false,
    meta: {
      class: {
        th: [alignClass(col), col.headerClass],
        td: [alignClass(col), col.cellClass],
      },
    },
  }))

  if (showActions.value) {
    cols.push({
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { class: { th: 'w-0 text-right', td: 'w-0 text-right' } },
    })
  }

  return cols
})

const processedRows = computed(() => {
  let rows = Array.isArray(props.data) ? [...props.data] : []

  const query = search.value.trim().toLowerCase()
  if (query) {
    rows = rows.filter((row) =>
      searchKeys.value.some((key) =>
        String(row?.[key] ?? '').toLowerCase().includes(query)
      )
    )
  }

  if (sortKey.value) {
    const key = sortKey.value
    const direction = sortDir.value === 'asc' ? 1 : -1

    rows.sort((a, b) => {
      const left = a?.[key]
      const right = b?.[key]

      if (left === right) return 0
      if (left === null || left === undefined) return 1
      if (right === null || right === undefined) return -1

      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction
      }

      return String(left).localeCompare(String(right), 'es', {
        numeric: true,
        sensitivity: 'base',
      }) * direction
    })
  }

  return rows
})

const total = computed(() => processedRows.value.length)

const pagedRows = computed(() => {
  const start = (page.value - 1) * props.pageSize
  return processedRows.value.slice(start, start + props.pageSize)
})

watch(search, () => {
  page.value = 1
})

watch(
  () => props.data,
  () => {
    const maxPage = Math.max(1, Math.ceil(total.value / props.pageSize))
    if (page.value > maxPage) page.value = maxPage
  }
)

const toggleSort = (key) => {
  if (sortKey.value === key) {
    if (sortDir.value === 'asc') {
      sortDir.value = 'desc'
    } else {
      sortKey.value = null
      sortDir.value = 'asc'
    }
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }

  page.value = 1
}

const sortIcon = (key) => {
  if (sortKey.value !== key) return 'i-lucide-arrow-up-down'
  return sortDir.value === 'asc'
    ? 'i-lucide-arrow-up-narrow-wide'
    : 'i-lucide-arrow-down-wide-narrow'
}

const formatCell = (col, scope) => {
  const value = scope?.getValue ? scope.getValue() : scope?.row?.original?.[col.key]
  const display = typeof col.format === 'function'
    ? col.format(value, scope?.row?.original)
    : value

  if (display === null || display === undefined || display === '') return '—'

  return display
}
</script>
