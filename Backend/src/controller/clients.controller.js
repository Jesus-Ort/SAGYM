import { z } from 'zod'

const isValidUuid = (v) => {
    try {
        z.uuid().parse(v)
        return true
    } catch {
        return false
    }
}

const emptyToNull = (v) => (v === '' ? null : v)

const createClientSchema = z.object({
    nombres: z
        .string()
        .trim()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(100, 'El nombre no puede exceder 100 caracteres'),
    apellidos: z
        .string()
        .trim()
        .min(2, 'El apellido debe tener al menos 2 caracteres')
        .max(100, 'El apellido no puede exceder 100 caracteres'),
    cedula: z
        .string()
        .trim()
        .min(3, 'La cédula debe tener al menos 3 caracteres')
        .max(30, 'La cédula no puede exceder 30 caracteres'),
    telefono: z
        .string()
        .trim()
        .max(30, 'El teléfono no puede exceder 30 caracteres')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
    correo: z
        .email('El correo electrónico no es válido')
        .max(255, 'El correo no puede exceder 255 caracteres')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
    fecha_nacimiento: z
        .iso.date('La fecha de nacimiento debe ser YYYY-MM-DD')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
    foto_url: z
        .url('La URL de la foto no es válida')
        .max(2048, 'La URL de la foto no puede exceder 2048 caracteres')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
})

const updateClientSchema = z.object({
    nombres: z
        .string()
        .trim()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(100, 'El nombre no puede exceder 100 caracteres')
        .optional(),
    apellidos: z
        .string()
        .trim()
        .min(2, 'El apellido debe tener al menos 2 caracteres')
        .max(100, 'El apellido no puede exceder 100 caracteres')
        .optional(),
    cedula: z
        .string()
        .trim()
        .min(3, 'La cédula debe tener al menos 3 caracteres')
        .max(30, 'La cédula no puede exceder 30 caracteres')
        .optional(),
    telefono: z
        .string()
        .trim()
        .max(30, 'El teléfono no puede exceder 30 caracteres')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
    correo: z
        .email('El correo electrónico no es válido')
        .max(255, 'El correo no puede exceder 255 caracteres')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
    fecha_nacimiento: z
        .iso.date('La fecha de nacimiento debe ser YYYY-MM-DD')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
    foto_url: z
        .url('La URL de la foto no es válida')
        .max(2048, 'La URL de la foto no puede exceder 2048 caracteres')
        .optional()
        .transform(emptyToNull)
        .or(z.null()),
})

const getProfileGymId = async (req) => {
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

    return { ok: true, gimnasio_id: profile.gimnasio_id }
}

const isUniqueViolation = (error) => {
    if (!error) return false
    const code = error.code || error?.details?.code
    if (code === '23505') return true
    if (error.message?.includes('duplicate key') || error.message?.includes('violates unique constraint')) {
        return true
    }
    return false
}

export const listClients = async (req, res) => {
    try {
        const profileRes = await getProfileGymId(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }
        const { gimnasio_id } = profileRes

        const { search, page, limit, order } = req.query ?? {}

        let query = req.supabase
            .from('clientes')
            .select(
                `
                id,
                gimnasio_id,
                nombres,
                apellidos,
                cedula,
                telefono,
                correo,
                fecha_nacimiento,
                token_qr,
                foto_url,
                is_active,
                created_at,
                updated_at
                `,
                { count: 'exact' }
            )
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .is('deleted_at', null)

        if (search && typeof search === 'string' && search.trim()) {
            const term = `%${search.trim()}%`
            query = query.or(
                `nombres.ilike.${term},apellidos.ilike.${term},cedula.ilike.${term},correo.ilike.${term},telefono.ilike.${term}`
            )
        }

        const pageNum = Number(page)
        const limitNum = Number(limit)

        const safePage = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1
        const safeLimit = Number.isFinite(limitNum) && limitNum >= 1 && limitNum <= 100 ? Math.floor(limitNum) : 20

        const from = (safePage - 1) * safeLimit
        const to = from + safeLimit - 1

        if (order === 'asc') {
            query = query.order('created_at', { ascending: true })
        } else if (order === 'name_asc') {
            query = query.order('nombres', { ascending: true }).order('apellidos', { ascending: true })
        } else if (order === 'name_desc') {
            query = query.order('nombres', { ascending: false }).order('apellidos', { ascending: false })
        } else {
            query = query.order('created_at', { ascending: false })
        }

        const { data, error, count } = await query.range(from, to)

        if (error) {
            console.error('Error de Supabase al listar clientes:', error.message)
            return res.status(500).json({ message: 'No se pudieron obtener los clientes' })
        }

        const total = count ?? 0
        const totalPages = Math.ceil(total / safeLimit) || 1

        return res.status(200).json({
            message: 'Clientes obtenidos correctamente',
            data: data ?? [],
            pagination: {
                page: safePage,
                limit: safeLimit,
                total,
                totalPages,
                hasNext: safePage < totalPages,
                hasPrev: safePage > 1,
            },
        })
    } catch (err) {
        console.error('Error inesperado al listar clientes:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const getClientById = async (req, res) => {
    try {
        const profileRes = await getProfileGymId(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }
        const { gimnasio_id } = profileRes

        const { id } = req.params ?? {}

        if (!id || !isValidUuid(id)) {
            return res.status(400).json({ message: 'ID de cliente inválido' })
        }

        const { data: client, error } = await req.supabase
            .from('clientes')
            .select(
                `
                id,
                gimnasio_id,
                nombres,
                apellidos,
                cedula,
                telefono,
                correo,
                fecha_nacimiento,
                token_qr,
                foto_url,
                is_active,
                created_at,
                updated_at
                `
            )
            .eq('id', id)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .is('deleted_at', null)
            .maybeSingle()

        if (error) {
            console.error('Error de Supabase al obtener el cliente:', error.message)
            return res.status(500).json({ message: 'No se pudo obtener el cliente' })
        }

        if (!client) {
            return res.status(404).json({ message: 'Cliente no encontrado' })
        }

        return res.status(200).json({
            message: 'Cliente obtenido correctamente',
            data: client,
        })
    } catch (err) {
        console.error('Error inesperado al obtener el cliente:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const createClient = async (req, res) => {
    try {
        const profileRes = await getProfileGymId(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }
        const { gimnasio_id } = profileRes

        const parsed = createClientSchema.safeParse(req.body ?? {})
        if (!parsed.success) {
            const firstError = parsed.error.issues?.[0]?.message || 'Datos inválidos'
            return res.status(400).json({ message: firstError })
        }

        const payload = {
            ...parsed.data,
            gimnasio_id,
            is_active: true,
        }

        const { data: client, error } = await req.supabase
            .from('clientes')
            .insert(payload)
            .select(
                `
                id,
                gimnasio_id,
                nombres,
                apellidos,
                cedula,
                telefono,
                correo,
                fecha_nacimiento,
                token_qr,
                foto_url,
                is_active,
                created_at,
                updated_at
                `
            )
            .single()

        if (error) {
            if (isUniqueViolation(error)) {
                return res.status(409).json({
                    message: 'Ya existe un cliente activo con esa cédula en este gimnasio',
                })
            }
            console.error('Error de Supabase al crear el cliente:', error.message)
            return res.status(500).json({ message: 'No se pudo crear el cliente' })
        }

        return res.status(201).json({
            message: 'Cliente creado correctamente',
            data: client,
        })
    } catch (err) {
        console.error('Error inesperado al crear el cliente:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const updateClient = async (req, res) => {
    try {
        const profileRes = await getProfileGymId(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }
        const { gimnasio_id } = profileRes

        const { id } = req.params ?? {}

        if (!id || !isValidUuid(id)) {
            return res.status(400).json({ message: 'ID de cliente inválido' })
        }

        const parsed = updateClientSchema.safeParse(req.body ?? {})
        if (!parsed.success) {
            const firstError = parsed.error.issues?.[0]?.message || 'Datos inválidos'
            return res.status(400).json({ message: firstError })
        }

        const updates = parsed.data
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No se enviaron campos para actualizar' })
        }

        const { data: existing, error: existErr } = await req.supabase
            .from('clientes')
            .select('id')
            .eq('id', id)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .is('deleted_at', null)
            .maybeSingle()

        if (existErr) {
            console.error('Error de Supabase al verificar el cliente:', existErr.message)
            return res.status(500).json({ message: 'No se pudo verificar el cliente' })
        }

        if (!existing) {
            return res.status(404).json({ message: 'Cliente no encontrado' })
        }

        const { data: updated, error: updateErr } = await req.supabase
            .from('clientes')
            .update(updates)
            .eq('id', id)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .is('deleted_at', null)
            .select(
                `
                id,
                gimnasio_id,
                nombres,
                apellidos,
                cedula,
                telefono,
                correo,
                fecha_nacimiento,
                token_qr,
                foto_url,
                is_active,
                created_at,
                updated_at
                `
            )
            .single()

        if (updateErr) {
            if (isUniqueViolation(updateErr)) {
                return res.status(409).json({
                    message: 'Ya existe un cliente activo con esa cédula en este gimnasio',
                })
            }
            console.error('Error de Supabase al actualizar el cliente:', updateErr.message)
            return res.status(500).json({ message: 'No se pudo actualizar el cliente' })
        }

        return res.status(200).json({
            message: 'Cliente actualizado correctamente',
            data: updated,
        })
    } catch (err) {
        console.error('Error inesperado al actualizar el cliente:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}

export const deleteClient = async (req, res) => {
    try {
        const profileRes = await getProfileGymId(req)
        if (!profileRes.ok) {
            return res.status(profileRes.status).json({ message: profileRes.message })
        }
        const { gimnasio_id } = profileRes

        const { id } = req.params ?? {}

        if (!id || !isValidUuid(id)) {
            return res.status(400).json({ message: 'ID de cliente inválido' })
        }

        const { data: existing, error: existErr } = await req.supabase
            .from('clientes')
            .select('id, is_active, deleted_at')
            .eq('id', id)
            .eq('gimnasio_id', gimnasio_id)
            .maybeSingle()

        if (existErr) {
            console.error('Error de Supabase al verificar el cliente:', existErr.message)
            return res.status(500).json({ message: 'No se pudo verificar el cliente' })
        }

        if (!existing || existing.is_active === false || existing.deleted_at) {
            return res.status(404).json({ message: 'Cliente no encontrado' })
        }

        const { error: delErr } = await req.supabase
            .from('clientes')
            .update({
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: req.user.id,
            })
            .eq('id', id)
            .eq('gimnasio_id', gimnasio_id)
            .eq('is_active', true)
            .is('deleted_at', null)

        if (delErr) {
            console.error('Error de Supabase al eliminar el cliente:', delErr.message)
            return res.status(500).json({ message: 'No se pudo eliminar el cliente' })
        }

        return res.status(200).json({
            message: 'Cliente eliminado correctamente',
        })
    } catch (err) {
        console.error('Error inesperado al eliminar el cliente:', err)
        return res.status(500).json({ message: 'Error interno del servidor' })
    }
}