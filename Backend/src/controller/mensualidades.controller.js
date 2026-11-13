import { z } from 'zod'

const METODOS_PAGO = [
    'efectivo',
    'transferencia',
    'pago_movil',
    'zelle',
    'tarjeta',
    'otro'
]

const BANCOS = [
    'cien_por_ciento_banco',
    'bancamiga',
    'banco_activo',
    'banco_agricola_de_venezuela',
    'banco_digital_de_los_trabajadores',
    'banco_caroni',
    'banfanb',
    'bangente',
    'banco_de_venezuela',
    'bancaribe',
    'banco_del_tesoro',
    'banco_exterior',
    'banco_internacional_de_desarrollo',
    'banco_nacional_de_credito',
    'banco_plaza',
    'banco_provincial',
    'banco_sofitasa',
    'bancrecer',
    'banesco',
    'banplus',
    'bfc',
    'del_sur',
    'mercantil',
    'r4_banco',
    'venezolano_de_credito'
]

const MENSUALIDAD_FIELDS = `
    id,
    gimnasio_id,
    cliente_id,
    fecha_inicio,
    fecha_fin,
    monto,
    estado,
    cancelada_motivo,
    cortesia,
    cortesia_motivo,
    cortesia_otorgada_por,
    creado_por,
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

const createMensualidadSchema = z.object({
    cliente_id: z.uuid('ID de cliente inválido'),
    fecha_inicio: z.iso.date('La fecha de inicio debe ser YYYY-MM-DD'),
    fecha_fin: z.iso.date('La fecha de fin debe ser YYYY-MM-DD'),
    monto: z.coerce
        .number('El monto debe ser un número')
        .positive('El monto debe ser mayor a cero')
        .max(9999999999.99, 'El monto excede el máximo permitido'),
    metodo_pago: z
        .string()
        .refine((value) => METODOS_PAGO.includes(value), 'Método de pago inválido')
        .optional(),
    banco: z
        .string()
        .refine((value) => BANCOS.includes(value), 'Banco inválido')
        .optional(),
    referencia: z.string().trim().max(150, 'La referencia no puede exceder 150 caracteres').optional(),
    observaciones: z.string().trim().max(1000, 'Las observaciones no pueden exceder 1000 caracteres').optional(),
    cortesia: z.boolean().optional().default(false),
    cortesia_motivo: z.string().trim().max(500, 'El motivo no puede exceder 500 caracteres').optional()
}).superRefine((data, ctx) => {
    if (data.fecha_fin < data.fecha_inicio) {
        ctx.addIssue({
            code: 'custom',
            path: ['fecha_fin'],
            message: 'La fecha de fin no puede ser anterior a la fecha de inicio'
        })
    }

    if (data.cortesia) {
        if (!data.cortesia_motivo) {
            ctx.addIssue({
                code: 'custom',
                path: ['cortesia_motivo'],
                message: 'Una cortesía necesita el motivo por el que se concede'
            })
        }
        return
    }

    if (!data.metodo_pago) {
        ctx.addIssue({
            code: 'custom',
            path: ['metodo_pago'],
            message: 'El método de pago es obligatorio salvo que sea cortesía'
        })
        return
    }

    if (data.metodo_pago === 'efectivo') {
        if (data.banco) {
            ctx.addIssue({
                code: 'custom',
                path: ['banco'],
                message: 'El efectivo no admite banco'
            })
        }

        if (data.referencia) {
            ctx.addIssue({
                code: 'custom',
                path: ['referencia'],
                message: 'El efectivo no admite referencia'
            })
        }

        return
    }

    if (!data.referencia) {
        ctx.addIssue({
            code: 'custom',
            path: ['referencia'],
            message: 'La referencia es obligatoria para este método de pago'
        })
    }

    const requiereBanco = ['transferencia', 'pago_movil', 'tarjeta'].includes(data.metodo_pago)

    if (requiereBanco && !data.banco) {
        ctx.addIssue({
            code: 'custom',
            path: ['banco'],
            message: 'El banco es obligatorio para este método de pago'
        })
    }

    if (!requiereBanco && data.banco) {
        ctx.addIssue({
            code: 'custom',
            path: ['banco'],
            message: 'Este método de pago no admite banco'
        })
    }
})

const cancelMensualidadSchema = z.object({
    cancelada_motivo: z
        .string()
        .trim()
        .min(1, 'El motivo de cancelación es obligatorio')
        .max(1000, 'El motivo no puede exceder 1000 caracteres')
})

const firstIssueMessage = (error) => error.issues?.[0]?.message || 'Datos inválidos'

export const listMensualidades = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const { page, limit, from, to } = getPagination(req.query)

        let query = req.supabase
            .from('mensualidades')
            .select(MENSUALIDAD_FIELDS, { count: 'exact' })
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)

        const estado = req.query?.estado

        if (estado !== undefined) {
            if (estado !== 'activa' && estado !== 'cancelada') {
                return res.status(400).json({ message: 'El estado debe ser activa o cancelada' })
            }

            query = query.eq('estado', estado)
        }

        if (req.query?.cliente_id !== undefined) {
            const clienteId = z.uuid().safeParse(req.query.cliente_id)

            if (!clienteId.success) {
                return res.status(400).json({ message: 'ID de cliente inválido' })
            }

            query = query.eq('cliente_id', clienteId.data)
        }

        const vigentes = req.query?.vigentes === 'true' || req.query?.vigentes === '1'

        if (vigentes) {
            const { data: hoy, error: hoyError } = await req.supabase.rpc('hoy')

            if (hoyError) {
                return sendDbError(res, hoyError, 'obtener la fecha del sistema')
            }

            query = query
                .eq('estado', 'activa')
                .lte('fecha_inicio', hoy)
                .gte('fecha_fin', hoy)
        }

        if (req.query?.desde !== undefined) {
            const desde = z.iso.date().safeParse(req.query.desde)

            if (!desde.success) {
                return res.status(400).json({ message: 'La fecha desde debe ser YYYY-MM-DD' })
            }

            query = query.gte('fecha_fin', desde.data)
        }

        if (req.query?.hasta !== undefined) {
            const hasta = z.iso.date().safeParse(req.query.hasta)

            if (!hasta.success) {
                return res.status(400).json({ message: 'La fecha hasta debe ser YYYY-MM-DD' })
            }

            query = query.lte('fecha_inicio', hasta.data)
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
                return emptyPageResponse(res, page, limit, 'No se encontraron mensualidades')
            }

            query = query.in('cliente_id', clientes.map((cliente) => cliente.id))
        }

        const { data, error, count } = await query
            .order('fecha_inicio', { ascending: false })
            .range(from, to)

        if (error) {
            return sendDbError(res, error, 'listar mensualidades', 'No se pudieron obtener las mensualidades')
        }

        const rows = data ?? []
        const clienteIds = [...new Set(rows.map((row) => row.cliente_id).filter(Boolean))]
        const { map: clientesMap, error: clientesError } = await getClientesMap(req, clienteIds)

        if (clientesError) {
            return sendDbError(res, clientesError, 'adjuntar clientes')
        }

        const total = count ?? 0
        const totalPages = Math.ceil(total / limit) || 1

        return res.status(200).json({
            message: 'Mensualidades obtenidas correctamente',
            data: rows.map((row) => ({
                ...row,
                cliente: clientesMap.get(row.cliente_id) ?? null
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
        console.error('Error inesperado al listar mensualidades:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const getMensualidadById = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de mensualidad inválido' })
        }

        const { data: mensualidad, error } = await req.supabase
            .from('mensualidades')
            .select(MENSUALIDAD_FIELDS)
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'obtener la mensualidad', 'No se pudo obtener la mensualidad')
        }

        if (!mensualidad) {
            return res.status(404).json({ message: 'Mensualidad no encontrada' })
        }

        const { map: clientesMap, error: clientesError } = await getClientesMap(req, [mensualidad.cliente_id])

        if (clientesError) {
            return sendDbError(res, clientesError, 'adjuntar cliente')
        }

        const { data: pago, error: pagoError } = await req.supabase
            .from('pagos')
            .select('id, monto, fecha_pago, metodo_pago, banco, referencia, observaciones, is_active')
            .eq('mensualidad_id', mensualidad.id)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .maybeSingle()

        if (pagoError) {
            return sendDbError(res, pagoError, 'obtener el pago de la mensualidad')
        }

        return res.status(200).json({
            message: 'Mensualidad obtenida correctamente',
            data: {
                ...mensualidad,
                cliente: clientesMap.get(mensualidad.cliente_id) ?? null,
                pago: pago ?? null
            }
        })
    } catch (err) {
        console.error('Error inesperado al obtener la mensualidad:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const createMensualidad = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const parsed = createMensualidadSchema.safeParse(req.body ?? {})

        if (!parsed.success) {
            return res.status(400).json({ message: firstIssueMessage(parsed.error) })
        }

        const {
            cliente_id,
            fecha_inicio,
            fecha_fin,
            monto,
            metodo_pago,
            banco,
            referencia,
            observaciones,
            cortesia,
            cortesia_motivo
        } = parsed.data

        const { data: mensualidadId, error } = await req.supabase.rpc('registrar_mensualidad', {
            p_cliente_id: cliente_id,
            p_fecha_inicio: fecha_inicio,
            p_fecha_fin: fecha_fin,
            p_monto: monto,
            p_metodo_pago: cortesia ? null : metodo_pago,
            p_banco: cortesia ? null : (banco ?? null),
            p_referencia: cortesia ? null : (referencia || null),
            p_observaciones: observaciones || null,
            p_cortesia: cortesia,
            p_cortesia_motivo: cortesia ? cortesia_motivo : null
        })

        if (error) {
            return sendDbError(res, error, 'registrar la mensualidad', 'No se pudo registrar la mensualidad')
        }

        const { data: mensualidad, error: fetchError } = await req.supabase
            .from('mensualidades')
            .select(MENSUALIDAD_FIELDS)
            .eq('id', mensualidadId)
            .eq('gimnasio_id', profileRes.profile.gimnasio_id)
            .single()

        if (fetchError) {
            console.error('Mensualidad creada pero no se pudo recuperar:', fetchError.message)

            return res.status(201).json({
                message: 'Mensualidad registrada correctamente',
                data: { id: mensualidadId }
            })
        }

        return res.status(201).json({
            message: 'Mensualidad registrada correctamente',
            data: mensualidad
        })
    } catch (err) {
        console.error('Error inesperado al registrar la mensualidad:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const cancelMensualidad = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de mensualidad inválido' })
        }

        const parsed = cancelMensualidadSchema.safeParse(req.body ?? {})

        if (!parsed.success) {
            return res.status(400).json({ message: firstIssueMessage(parsed.error) })
        }

        const { data: existing, error: existError } = await req.supabase
            .from('mensualidades')
            .select('id, estado, is_active')
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .maybeSingle()

        if (existError) {
            return sendDbError(res, existError, 'verificar la mensualidad')
        }

        if (!existing || existing.is_active === false) {
            return res.status(404).json({ message: 'Mensualidad no encontrada' })
        }

        if (existing.estado !== 'activa') {
            return res.status(409).json({ message: 'La mensualidad ya está cancelada' })
        }

        const { data: mensualidad, error } = await req.supabase
            .from('mensualidades')
            .update({
                estado: 'cancelada',
                cancelada_motivo: parsed.data.cancelada_motivo
            })
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .select(MENSUALIDAD_FIELDS)
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'cancelar la mensualidad', 'No se pudo cancelar la mensualidad')
        }

        if (!mensualidad) {
            return res.status(404).json({ message: 'Mensualidad no encontrada' })
        }

        return res.status(200).json({
            message: 'Mensualidad cancelada correctamente',
            data: mensualidad
        })
    } catch (err) {
        console.error('Error inesperado al cancelar la mensualidad:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}
