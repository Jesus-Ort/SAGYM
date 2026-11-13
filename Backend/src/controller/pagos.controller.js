import { z } from 'zod'

const METODOS_PAGO = [
    'efectivo',
    'transferencia',
    'pago_movil',
    'zelle',
    'tarjeta',
    'otro'
]

const PAGO_FIELDS = `
    id,
    gimnasio_id,
    cliente_id,
    mensualidad_id,
    monto,
    fecha_pago,
    metodo_pago,
    banco,
    referencia,
    observaciones,
    registrado_por,
    is_active,
    created_at,
    updated_at
`

const getProfile = async (req) => {
    const { data: profile, error } = await req.supabase
        .from('perfiles')
        .select('gimnasio_id, rol')
        .eq('id', req.user.id)
        .maybeSingle()

    if (error) {
        console.error('Error de Supabase al obtener el perfil:', error.message)
        return { ok: false, status: 500, message: 'No se pudo obtener la información del usuario' }
    }

    if (!profile) {
        return { ok: false, status: 404, message: 'Perfil del usuario no encontrado' }
    }

    return { ok: true, profile }
}

const getPagination = (query) => {
    const pageNum = Number(query?.page)
    const limitNum = Number(query?.limit)

    const page = Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1
    const limit = Number.isInteger(limitNum) && limitNum >= 1 && limitNum <= 100 ? limitNum : 20

    return {
        page,
        limit,
        from: (page - 1) * limit,
        to: page * limit - 1
    }
}

const cleanSearch = (value) => {
    if (typeof value !== 'string') return ''
    return value.trim().replace(/[(),%\\]/g, '')
}

const sendDbError = (res, error, context, fallbackMessage = 'Error interno del servidor') => {
    const code = error?.code

    if (code === '23505') {
        return res.status(409).json({ message: 'Ya existe un registro con esos datos' })
    }

    if (code === '23503') {
        return res.status(400).json({ message: 'El recurso relacionado no existe o no pertenece a este gimnasio' })
    }

    if (code === '42501') {
        return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' })
    }

    if (code === '23514') {
        return res.status(422).json({ message: error.message || 'Los datos no cumplen las reglas del sistema' })
    }

    if (code === 'P0001') {
        return res.status(422).json({ message: error.message || 'La operación no es válida' })
    }

    console.error(`Error de Supabase al ${context}:`, error?.message)
    return res.status(500).json({ message: fallbackMessage })
}

const emptyPageResponse = (res, page, limit, message) => res.status(200).json({
    message,
    data: [],
    pagination: {
        page,
        limit,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: page > 1
    }
})

// Venezuela no aplica horario de verano: el dia de negocio es UTC-4.
const startOfDay = (date) => `${date}T00:00:00.000-04:00`
const endOfDay = (date) => `${date}T23:59:59.999-04:00`

const getClientesMap = async (req, ids) => {
    if (ids.length === 0) {
        return { map: new Map() }
    }

    const { data, error } = await req.supabase
        .from('clientes')
        .select('id, nombres, apellidos, cedula, telefono')
        .in('id', ids)

    if (error) {
        return { error }
    }

    return {
        map: new Map((data ?? []).map((cliente) => [cliente.id, cliente]))
    }
}

const getMensualidadesMap = async (req, ids) => {
    if (ids.length === 0) {
        return { map: new Map() }
    }

    const { data, error } = await req.supabase
        .from('mensualidades')
        .select('id, fecha_inicio, fecha_fin, monto, estado, cortesia')
        .in('id', ids)

    if (error) {
        return { error }
    }

    return {
        map: new Map((data ?? []).map((mensualidad) => [mensualidad.id, mensualidad]))
    }
}

export const listPagos = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const { page, limit, from, to } = getPagination(req.query)

        let query = req.supabase
            .from('pagos')
            .select(PAGO_FIELDS, { count: 'exact' })
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)

        if (req.query?.cliente_id !== undefined) {
            const clienteId = z.uuid().safeParse(req.query.cliente_id)

            if (!clienteId.success) {
                return res.status(400).json({ message: 'ID de cliente inválido' })
            }

            query = query.eq('cliente_id', clienteId.data)
        }

        if (req.query?.mensualidad_id !== undefined) {
            const mensualidadId = z.uuid().safeParse(req.query.mensualidad_id)

            if (!mensualidadId.success) {
                return res.status(400).json({ message: 'ID de mensualidad inválido' })
            }

            query = query.eq('mensualidad_id', mensualidadId.data)
        }

        if (req.query?.metodo_pago !== undefined) {
            if (!METODOS_PAGO.includes(req.query.metodo_pago)) {
                return res.status(400).json({ message: 'Método de pago inválido' })
            }

            query = query.eq('metodo_pago', req.query.metodo_pago)
        }

        if (req.query?.desde !== undefined) {
            const desde = z.iso.date().safeParse(req.query.desde)

            if (!desde.success) {
                return res.status(400).json({ message: 'La fecha desde debe ser YYYY-MM-DD' })
            }

            query = query.gte('fecha_pago', startOfDay(desde.data))
        }

        if (req.query?.hasta !== undefined) {
            const hasta = z.iso.date().safeParse(req.query.hasta)

            if (!hasta.success) {
                return res.status(400).json({ message: 'La fecha hasta debe ser YYYY-MM-DD' })
            }

            query = query.lte('fecha_pago', endOfDay(hasta.data))
        }

        const search = cleanSearch(req.query?.search)

        if (search) {
            const term = `%${search}%`

            const { data: clientes, error: clientesError } = await req.supabase
                .from('clientes')
                .select('id')
                .eq('gimnasio_id', gimnasio_id)
                .eq('is_active', true)
                .or(`nombres.ilike.${term},apellidos.ilike.${term},cedula.ilike.${term}`)
                .limit(500)

            if (clientesError) {
                return sendDbError(res, clientesError, 'buscar clientes')
            }

            if (!clientes || clientes.length === 0) {
                return emptyPageResponse(res, page, limit, 'No se encontraron pagos')
            }

            query = query.in('cliente_id', clientes.map((cliente) => cliente.id))
        }

        const { data, error, count } = await query
            .order('fecha_pago', { ascending: false })
            .range(from, to)

        if (error) {
            return sendDbError(res, error, 'listar pagos', 'No se pudieron obtener los pagos')
        }

        const rows = data ?? []
        const clienteIds = [...new Set(rows.map((row) => row.cliente_id).filter(Boolean))]
        const mensualidadIds = [...new Set(rows.map((row) => row.mensualidad_id).filter(Boolean))]

        const { map: clientesMap, error: clientesError } = await getClientesMap(req, clienteIds)
        if (clientesError) {
            return sendDbError(res, clientesError, 'adjuntar clientes')
        }

        const { map: mensualidadesMap, error: mensualidadesError } = await getMensualidadesMap(req, mensualidadIds)
        if (mensualidadesError) {
            return sendDbError(res, mensualidadesError, 'adjuntar mensualidades')
        }

        const total = count ?? 0
        const totalPages = Math.ceil(total / limit) || 1

        return res.status(200).json({
            message: 'Pagos obtenidos correctamente',
            data: rows.map((row) => ({
                ...row,
                cliente: clientesMap.get(row.cliente_id) ?? null,
                mensualidad: mensualidadesMap.get(row.mensualidad_id) ?? null
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        })
    } catch (err) {
        console.error('Error inesperado al listar pagos:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const getPagoById = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de pago inválido' })
        }

        const { data: pago, error } = await req.supabase
            .from('pagos')
            .select(PAGO_FIELDS)
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'obtener el pago', 'No se pudo obtener el pago')
        }

        if (!pago) {
            return res.status(404).json({ message: 'Pago no encontrado' })
        }

        const { map: clientesMap, error: clientesError } = await getClientesMap(req, [pago.cliente_id])
        if (clientesError) {
            return sendDbError(res, clientesError, 'adjuntar cliente')
        }

        const { map: mensualidadesMap, error: mensualidadesError } = await getMensualidadesMap(req, [pago.mensualidad_id])
        if (mensualidadesError) {
            return sendDbError(res, mensualidadesError, 'adjuntar mensualidad')
        }

        return res.status(200).json({
            message: 'Pago obtenido correctamente',
            data: {
                ...pago,
                cliente: clientesMap.get(pago.cliente_id) ?? null,
                mensualidad: mensualidadesMap.get(pago.mensualidad_id) ?? null
            }
        })
    } catch (err) {
        console.error('Error inesperado al obtener el pago:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const voidPago = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de pago inválido' })
        }

        const { data: existing, error: existError } = await req.supabase
            .from('pagos')
            .select('id, is_active')
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .maybeSingle()

        if (existError) {
            return sendDbError(res, existError, 'verificar el pago')
        }

        if (!existing || existing.is_active === false) {
            return res.status(404).json({ message: 'Pago no encontrado' })
        }

        const { data: anulado, error } = await req.supabase
            .from('pagos')
            .update({
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: req.user.id
            })
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .select('id')
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'anular el pago', 'No se pudo anular el pago')
        }

        if (!anulado) {
            return res.status(404).json({ message: 'Pago no encontrado' })
        }

        return res.status(200).json({
            message: 'Pago anulado correctamente'
        })
    } catch (err) {
        console.error('Error inesperado al anular el pago:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}
