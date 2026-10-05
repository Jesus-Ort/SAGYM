import { supabase } from '../config/supabase.js'
import { getAuthCookies } from '../utils/auth-cookies.js'

export const requireAuth = async (req, res, next) => {
    const { accessToken } = getAuthCookies(req)

    if (!accessToken) {
        return res.status(401).json({
            message: 'Autenticación requerida'
        })
    }

    try {
        const { data, error } = await supabase.auth.getUser(accessToken)

        if (error || !data.user) {
            if (error?.status >= 500) {
                console.error('Error de Supabase al validar sesión:', error.message)
                return res.status(500).json({
                    message: 'No se pudo validar la sesión'
                })
            }

            return res.status(401).json({
                message: 'La sesión no es válida o expiró'
            })
        }

        req.user = data.user
        return next()
    } catch (err) {
        console.error('Error inesperado al validar sesión:', err)

        return res.status(500).json({
            message: 'Error interno del servidor'
        })
    }
}
