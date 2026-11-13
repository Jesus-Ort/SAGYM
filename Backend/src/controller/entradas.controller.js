import { z } from 'zod'

const ENTRADA_FIELDS = `
    id,
    gimnasio_id,
    cliente_id,
    entrada_en,
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

const validateQrSchema = z.object({
    token_qr: z.uuid('El token QR no es válido')
})

const registerEntradaSchema = z.object({
    cliente_id: z.uuid('ID de cliente inválido').optional(),
    token_qr: z.uuid('El token QR no es válido').optional()
}).superRefine((data, ctx) => {
    if (!data.cliente_id && !data.token_qr) {
        ctx.addIssue({
            code: 'custom',
            path: ['cliente_id'],
            message: 'Debes enviar cliente_id o token_qr'
        })
    }

    if (data.cliente_id && data.token_qr) {
        ctx.addIssue({
            code: 'custom',
            path: ['token_qr'],
            message: 'Envía solo cliente_id o token_qr, no ambos'
        })
    }
})

const firstIssueMessage = (error) => error.issues?.[0]?.message || 'Datos inválidos'

export const listEntradas = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const { page, limit, from, to } = getPagination(req.query)
        const hoy = req.query?.hoy === 'true' || req.query?.hoy === '1'
        const search = cleanSearch(req.query?.search)
        const term = `%${search}%`

        if (req.query?.cliente_id !== undefined) {
            const clienteId = z.uuid().safeParse(req.query.cliente_id)

            if (!clienteId.success) {
                return res.status(400).json({ message: 'ID de cliente inválido' })
            }
        }

        if (req.query?.desde !== undefined && !z.iso.date().safeParse(req.query.desde).success) {
            return res.status(400).json({ message: 'La fecha desde debe ser YYYY-MM-DD' })
        }

        if (req.query?.hasta !== undefined && !z.iso.date().safeParse(req.query.hasta).success) {
            return res.status(400).json({ message: 'La fecha hasta debe ser YYYY-MM-DD' })
        }

        if (hoy) {
            let query = req.supabase
                .from('v_entradas_hoy')
                .select('*', { count: 'exact' })
                .eq('gimnasio_id', gimnasio_id)

            if (req.query?.cliente_id !== undefined) {
                query = query.eq('cliente_id', req.query.cliente_id)
            }

            if (search) {
                query = query.or(`nombres.ilike.${term},apellidos.ilike.${term},cedula.ilike.${term}`)
            }

            const { data, error, count } = await query
                .order('entrada_en', { ascending: false })
                .range(from, to)

            if (error) {
                return sendDbError(res, error, 'listar las entradas del día', 'No se pudieron obtener las entradas')
            }

            const total = count ?? 0
            const totalPages = Math.ceil(total / limit) || 1

            return res.status(200).json({
                message: 'Entradas del día obtenidas correctamente',
                data: data ?? [],
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            })
        }

        let query = req.supabase
            .from('entradas')
            .select(ENTRADA_FIELDS, { count: 'exact' })
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)

        if (req.query?.cliente_id !== undefined) {
            query = query.eq('cliente_id', req.query.cliente_id)
        }

        if (req.query?.desde !== undefined) {
            query = query.gte('entrada_en', startOfDay(req.query.desde))
        }

        if (req.query?.hasta !== undefined) {
            query = query.lte('entrada_en', endOfDay(req.query.hasta))
        }

        if (search) {
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
                return emptyPageResponse(res, page, limit, 'No se encontraron entradas')
            }

            query = query.in('cliente_id', clientes.map((cliente) => cliente.id))
        }

        const { data, error, count } = await query
            .order('entrada_en', { ascending: false })
            .range(from, to)

        if (error) {
            return sendDbError(res, error, 'listar entradas', 'No se pudieron obtener las entradas')
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
            message: 'Entradas obtenidas correctamente',
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
        console.error('Error inesperado al listar entradas:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const getEntradaById = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de entrada inválido' })
        }

        const { data: entrada, error } = await req.supabase
            .from('entradas')
            .select(ENTRADA_FIELDS)
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'obtener la entrada', 'No se pudo obtener la entrada')
        }

        if (!entrada) {
            return res.status(404).json({ message: 'Entrada no encontrada' })
        }

        const { map: clientesMap, error: clientesError } = await getClientesMap(req, [entrada.cliente_id])

        if (clientesError) {
            return sendDbError(res, clientesError, 'adjuntar cliente')
        }

        return res.status(200).json({
            message: 'Entrada obtenida correctamente',
            data: {
                ...entrada,
                cliente: clientesMap.get(entrada.cliente_id) ?? null
            }
        })
    } catch (err) {
        console.error('Error inesperado al obtener la entrada:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const validateQr = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const parsed = validateQrSchema.safeParse(req.body ?? {})

        if (!parsed.success) {
            return res.status(400).json({ message: firstIssueMessage(parsed.error) })
        }

        const { data, error } = await req.supabase.rpc('validar_cliente_qr', {
            p_token_qr: parsed.data.token_qr,
            p_gimnasio_id: profileRes.profile.gimnasio_id
        })

        if (error) {
            return sendDbError(res, error, 'validar el QR', 'No se pudo validar el QR')
        }

        const resultado = Array.isArray(data) ? data[0] : data

        if (!resultado) {
            return res.status(404).json({
                message: 'El QR no corresponde a ningún cliente de este gimnasio'
            })
        }

        return res.status(200).json({
            message: resultado.puede_entrar
                ? 'El cliente tiene acceso'
                : 'El cliente no tiene acceso',
            data: resultado
        })
    } catch (err) {
        console.error('Error inesperado al validar el QR:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const registerEntrada = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const parsed = registerEntradaSchema.safeParse(req.body ?? {})

        if (!parsed.success) {
            return res.status(400).json({ message: firstIssueMessage(parsed.error) })
        }

        let clienteId = parsed.data.cliente_id

        if (parsed.data.token_qr) {
            const { data, error } = await req.supabase.rpc('validar_cliente_qr', {
                p_token_qr: parsed.data.token_qr,
                p_gimnasio_id: gimnasio_id
            })

            if (error) {
                return sendDbError(res, error, 'validar el QR', 'No se pudo validar el QR')
            }

            const resultado = Array.isArray(data) ? data[0] : data

            if (!resultado) {
                return res.status(404).json({
                    message: 'El QR no corresponde a ningún cliente de este gimnasio'
                })
            }

            if (!resultado.puede_entrar) {
                return res.status(403).json({
                    message: `El cliente no tiene acceso vigente: ${resultado.motivo}`,
                    data: resultado
                })
            }

            clienteId = resultado.cliente_id
        }

        const { data: cliente, error: clienteError } = await req.supabase
            .from('clientes')
            .select('id, nombres, apellidos, cedula, is_active')
            .eq('id', clienteId)
            .eq('gimnasio_id', gimnasio_id)
            .maybeSingle()

        if (clienteError) {
            return sendDbError(res, clienteError, 'verificar el cliente')
        }

        if (!cliente) {
            return res.status(404).json({ message: 'Cliente no encontrado' })
        }

        if (!cliente.is_active) {
            return res.status(403).json({ message: 'El cliente está dado de baja' })
        }

        const { data: acceso, error: accesoError } = await req.supabase.rpc('evaluar_acceso', {
            p_cliente_id: clienteId,
            p_gimnasio_id: gimnasio_id
        })

        if (accesoError) {
            return sendDbError(res, accesoError, 'evaluar el acceso del cliente')
        }

        const evaluacion = Array.isArray(acceso) ? acceso[0] : acceso

        if (!evaluacion?.puede_entrar) {
            return res.status(403).json({
                message: `El cliente no tiene acceso vigente: ${evaluacion?.motivo ?? 'sin_acceso'}`
            })
        }

        const { data: entrada, error } = await req.supabase
            .from('entradas')
            .insert({
                gimnasio_id,
                cliente_id: clienteId,
                registrado_por: req.user.id
            })
            .select(ENTRADA_FIELDS)
            .single()

        if (error) {
            if (error.code === '23514') {
                return res.status(403).json({
                    message: error.message || 'El cliente no tiene acceso vigente'
                })
            }

            return sendDbError(res, error, 'registrar la entrada', 'No se pudo registrar la entrada')
        }

        return res.status(201).json({
            message: 'Entrada registrada correctamente',
            data: {
                ...entrada,
                cliente
            }
        })
    } catch (err) {
        console.error('Error inesperado al registrar la entrada:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const invalidateEntrada = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id, rol } = profileRes.profile

        if (rol !== 'propietario' && rol !== 'administrador') {
            return res.status(403).json({
                message: 'Solo un propietario o administrador puede invalidar una entrada'
            })
        }

        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de entrada inválido' })
        }

        const { data: existing, error: existError } = await req.supabase
            .from('entradas')
            .select('id, is_active')
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .maybeSingle()

        if (existError) {
            return sendDbError(res, existError, 'verificar la entrada')
        }

        if (!existing || existing.is_active === false) {
            return res.status(404).json({ message: 'Entrada no encontrada' })
        }

        const { data: invalidada, error } = await req.supabase
            .from('entradas')
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
            return sendDbError(res, error, 'invalidar la entrada', 'No se pudo invalidar la entrada')
        }

        if (!invalidada) {
            return res.status(404).json({ message: 'Entrada no encontrada' })
        }

        return res.status(200).json({
            message: 'Entrada invalidada correctamente'
        })
    } catch (err) {
        console.error('Error inesperado al invalidar la entrada:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}
