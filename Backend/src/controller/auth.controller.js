import { supabase } from '../config/supabase.js'
import {
    clearAuthCookies,
    getAuthCookies,
    setAuthCookies
} from '../utils/auth-cookies.js'

export const login = async (req, res) => {
    try {
        const { email, password } = req.body ?? {}

        if (
            typeof email !== 'string' ||
            !email.trim() ||
            email.length > 320 ||
            typeof password !== 'string' ||
            !password ||
            password.length > 1024
        ) {
            return res.status(400).json({
                message: 'Email y contraseña válidos son obligatorios'
            })
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
        })

        if (error) {
            if (error.status >= 500) {
                console.error('Error de Supabase al iniciar sesión:', error.message)
                return res.status(500).json({
                    message: 'No se pudo iniciar sesión'
                })
            }

            return res.status(401).json({
                message: 'Credenciales inválidas'
            })
        }

        if (!data.session) {
            return res.status(401).json({
                message: 'No se pudo iniciar sesión. Verifica tus credenciales y confirma tu correo.'
            })
        }

        setAuthCookies(res, data.session)

        return res.json({
            message: 'Inicio de sesión exitoso',
        })
    } catch (err) {
        console.error('Error inesperado al iniciar sesión:', err)

        return res.status(500).json({
            message: 'Error interno del servidor'
        })
    }
}

export const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = getAuthCookies(req)

        if (!refreshToken) {
            return res.status(401).json({
                message: 'No hay una sesión que renovar'
            })
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken
        })

        if (error || !data.session) {
            clearAuthCookies(res)

            if (error?.status >= 500) {
                console.error('Error de Supabase al renovar sesión:', error.message)
                return res.status(500).json({
                    message: 'No se pudo renovar la sesión'
                })
            }

            return res.status(401).json({
                message: 'La sesión expiró. Inicia sesión nuevamente.'
            })
        }

        setAuthCookies(res, data.session)

        return res.json({
            message: 'Sesión renovada',
        })
    } catch (err) {
        console.error('Error inesperado al renovar sesión:', err)

        return res.status(500).json({
            message: 'Error interno del servidor'
        })
    }
}

export const me = async (req,res) =>{
        try {            

        const user_id = req.user.id

        const { data: profile, error } = await supabase
            .from('perfiles')
            .select(`
                id,
                gimnasio_id,
                nombre_completo,
                rol,
                is_active
                `)
            .eq('id', user_id)
            .single()

        if (!profile){
            return res.status(404).json({
                message: 'Perfil del usuario no encontrado'
            })
        }

        if (error) {
            console.error( 'Error de Supabase al obtener el perfil:', error.message )
            return res.status(500).json({
                message: 'No se pudo obtener la información del usuario'
            })
        }

        return res.status(200).json({
                message: "Perfil del usuario encontrado",
                user: profile
            })
        } catch (err) {
        console.error('Error inesperado al obtener el usuario:', err)
        return res.status(500).json({
            message: 'Error inesperado al obtener el usuario'
        })
    }
}


export const logout = async (req, res) => {
    clearAuthCookies(res)

    return res.status(200).json({
        message: 'Sesión cerrada'
    })
}