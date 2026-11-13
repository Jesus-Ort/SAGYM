import { z } from 'zod'

const USUARIO_FIELDS = `
    id,
    gimnasio_id,
    nombre_completo,
    rol,
    is_active,
    created_at,
    updated_at
`

const ROLES_ASIGNABLES = ['personal', 'administrador']

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

const updateUsuarioSchema = z.object({
    nombre_completo: z
        .string()
        .trim()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(150, 'El nombre no puede exceder 150 caracteres')
        .optional(),
    rol: z
        .string()
        .refine((value) => ROLES_ASIGNABLES.includes(value), 'El rol debe ser personal o administrador')
        .optional()
}).refine((data) => data.nombre_completo !== undefined || data.rol !== undefined, {
    message: 'No se enviaron campos para actualizar'
})

const firstIssueMessage = (error) => error.issues?.[0]?.message || 'Datos inválidos'

export const listUsuarios = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const { page, limit, from, to } = getPagination(req.query)

        let query = req.supabase
            .from('perfiles')
            .select(USUARIO_FIELDS, { count: 'exact' })
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)

        if (req.query?.rol !== undefined) {
            if (req.query.rol !== 'propietario' && req.query.rol !== 'administrador' && req.query.rol !== 'personal') {
                return res.status(400).json({ message: 'Rol inválido' })
            }

            query = query.eq('rol', req.query.rol)
        }

        const search = cleanSearch(req.query?.search)

        if (search) {
            query = query.ilike('nombre_completo', `%${search}%`)
        }

        const { data, error, count } = await query
            .order('nombre_completo', { ascending: true })
            .range(from, to)

        if (error) {
            return sendDbError(res, error, 'listar usuarios', 'No se pudieron obtener los usuarios')
        }

        const total = count ?? 0
        const totalPages = Math.ceil(total / limit) || 1

        return res.status(200).json({
            message: 'Usuarios obtenidos correctamente',
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
    } catch (err) {
        console.error('Error inesperado al listar usuarios:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const getUsuarioById = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de usuario inválido' })
        }

        const { data: usuario, error } = await req.supabase
            .from('perfiles')
            .select(USUARIO_FIELDS)
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'obtener el usuario', 'No se pudo obtener el usuario')
        }

        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado' })
        }

        return res.status(200).json({
            message: 'Usuario obtenido correctamente',
            data: usuario
        })
    } catch (err) {
        console.error('Error inesperado al obtener el usuario:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const updateUsuario = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id, rol: rolPropio } = profileRes.profile
        const id = z.uuid().safeParse(req.params?.id)

        if (!id.success) {
            return res.status(400).json({ message: 'ID de usuario inválido' })
        }

        const parsed = updateUsuarioSchema.safeParse(req.body ?? {})

        if (!parsed.success) {
            return res.status(400).json({ message: firstIssueMessage(parsed.error) })
        }

        const esPropioPerfil = id.data === req.user.id

        if (esPropioPerfil && parsed.data.rol !== undefined) {
            return res.status(403).json({ message: 'No puedes cambiar tu propio rol' })
        }

        if (!esPropioPerfil && rolPropio !== 'propietario' && rolPropio !== 'administrador') {
            return res.status(403).json({
                message: 'Solo un propietario o administrador puede editar a otros usuarios'
            })
        }

        const { data: target, error: targetError } = await req.supabase
            .from('perfiles')
            .select('id, rol')
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .maybeSingle()

        if (targetError) {
            return sendDbError(res, targetError, 'verificar el usuario')
        }

        if (!target) {
            return res.status(404).json({ message: 'Usuario no encontrado' })
        }

        if (!esPropioPerfil && target.rol === 'propietario') {
            return res.status(403).json({ message: 'No se puede editar a un propietario desde la sesión' })
        }

        const updates = {}

        if (parsed.data.nombre_completo !== undefined) {
            updates.nombre_completo = parsed.data.nombre_completo
        }

        if (parsed.data.rol !== undefined) {
            updates.rol = parsed.data.rol
        }

        const { data: usuario, error } = await req.supabase
            .from('perfiles')
            .update(updates)
            .eq('id', id.data)
            .eq('gimnasio_id', gimnasio_id)
            .select(USUARIO_FIELDS)
            .maybeSingle()

        if (error) {
            return sendDbError(res, error, 'actualizar el usuario', 'No se pudo actualizar el usuario')
        }

        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado' })
        }

        return res.status(200).json({
            message: 'Usuario actualizado correctamente',
            data: usuario
        })
    } catch (err) {
        console.error('Error inesperado al actualizar el usuario:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}
