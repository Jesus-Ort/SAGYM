import { z } from 'zod'

const GIMNASIO_FIELDS = `
    id,
    nombre,
    telefono,
    correo,
    direccion,
    logo_url,
    is_active,
    created_at,
    updated_at
`

const CONFIG_FIELDS = `
    gimnasio_id,
    dias_gracia,
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

const updateConfiguracionSchema = z.object({
    nombre: z
        .string()
        .trim()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(150, 'El nombre no puede exceder 150 caracteres')
        .optional(),
    telefono: z
        .union([
            z.string().trim().max(30, 'El teléfono no puede exceder 30 caracteres'),
            z.literal(''),
            z.null()
        ])
        .optional(),
    correo: z
        .union([
            z.email('El correo electrónico no es válido').max(255, 'El correo no puede exceder 255 caracteres'),
            z.literal(''),
            z.null()
        ])
        .optional(),
    direccion: z
        .union([
            z.string().trim().max(500, 'La dirección no puede exceder 500 caracteres'),
            z.literal(''),
            z.null()
        ])
        .optional(),
    logo_url: z
        .union([
            z.url('La URL del logo no es válida').max(2048, 'La URL no puede exceder 2048 caracteres'),
            z.literal(''),
            z.null()
        ])
        .optional(),
    dias_gracia: z.coerce
        .number('Los días de gracia deben ser un número')
        .int('Los días de gracia deben ser un entero')
        .min(0, 'Los días de gracia no pueden ser negativos')
        .max(31, 'Los días de gracia no pueden exceder 31')
        .optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'No se enviaron campos para actualizar'
})

const firstIssueMessage = (error) => error.issues?.[0]?.message || 'Datos inválidos'

const getConfiguracionActual = async (req, gimnasioId) => {
    const { data: gimnasio, error: gimnasioError } = await req.supabase
        .from('gimnasios')
        .select(GIMNASIO_FIELDS)
        .eq('id', gimnasioId)
        .maybeSingle()

    if (gimnasioError) {
        return { error: gimnasioError }
    }

    if (!gimnasio) {
        return { notFound: true }
    }

    const { data: config, error: configError } = await req.supabase
        .from('gimnasio_config')
        .select(CONFIG_FIELDS)
        .eq('gimnasio_id', gimnasioId)
        .maybeSingle()

    if (configError) {
        return { error: configError }
    }

    return {
        data: {
            ...gimnasio,
            dias_gracia: config?.dias_gracia ?? 0
        }
    }
}

export const getConfiguracion = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { data, error, notFound } = await getConfiguracionActual(req, profileRes.profile.gimnasio_id)

        if (error) {
            return sendDbError(res, error, 'obtener la configuración', 'No se pudo obtener la configuración')
        }

        if (notFound) {
            return res.status(404).json({ message: 'Gimnasio no encontrado' })
        }

        return res.status(200).json({
            message: 'Configuración obtenida correctamente',
            data
        })
    } catch (err) {
        console.error('Error inesperado al obtener la configuración:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const updateConfiguracion = async (req, res) => {
    try {
        const profileRes = await getProfile(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }

        const { gimnasio_id, rol } = profileRes.profile

        if (rol !== 'propietario') {
            return res.status(403).json({
                message: 'Solo el propietario puede modificar la configuración del gimnasio'
            })
        }

        const parsed = updateConfiguracionSchema.safeParse(req.body ?? {})

        if (!parsed.success) {
            return res.status(400).json({ message: firstIssueMessage(parsed.error) })
        }

        const { dias_gracia, ...gimnasioFields } = parsed.data
        const gymUpdates = {}

        for (const key of ['nombre', 'telefono', 'correo', 'direccion', 'logo_url']) {
            if (gimnasioFields[key] !== undefined) {
                gymUpdates[key] = gimnasioFields[key] === '' ? null : gimnasioFields[key]
            }
        }

        if (Object.keys(gymUpdates).length > 0) {
            const { data: gimnasio, error } = await req.supabase
                .from('gimnasios')
                .update(gymUpdates)
                .eq('id', gimnasio_id)
                .select('id')
                .maybeSingle()

            if (error) {
                return sendDbError(res, error, 'actualizar los datos del gimnasio', 'No se pudo actualizar la configuración')
            }

            if (!gimnasio) {
                return res.status(404).json({ message: 'Gimnasio no encontrado' })
            }
        }

        if (dias_gracia !== undefined) {
            const { error } = await req.supabase
                .from('gimnasio_config')
                .upsert(
                    {
                        gimnasio_id,
                        dias_gracia
                    },
                    { onConflict: 'gimnasio_id' }
                )
                .select('gimnasio_id')
                .single()

            if (error) {
                return sendDbError(res, error, 'actualizar los días de gracia', 'No se pudo actualizar la configuración')
            }
        }

        const { data, error, notFound } = await getConfiguracionActual(req, gimnasio_id)

        if (error) {
            return sendDbError(res, error, 'recuperar la configuración actualizada')
        }

        if (notFound) {
            return res.status(404).json({ message: 'Gimnasio no encontrado' })
        }

        return res.status(200).json({
            message: 'Configuración actualizada correctamente',
            data
        })
    } catch (err) {
        console.error('Error inesperado al actualizar la configuración:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}
