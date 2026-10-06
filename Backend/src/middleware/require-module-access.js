const moduleAccess = {
    clientes: ['propietario', 'administrador', 'personal'],
    mensualidades: ['propietario', 'administrador', 'personal'],
    pagos: ['propietario', 'administrador', 'personal'],
    entradas: ['propietario', 'administrador', 'personal'],
    usuarios: ['propietario', 'administrador'],
    configuracion: ['propietario', 'administrador']
}

export const requireModuleAccess = (module) => async (req, res, next) => {
    try {
        const { data: profile, error } = await req.supabase
            .from('perfiles')
            .select('rol')
            .eq('id', req.user.id)
            .maybeSingle()

        if (error) {
            console.error('Error de Supabase al consultar el perfil:', error.message)
            return res.status(500).json({
                message: 'No se pudo validar el rol del usuario'
            })
        }

        if (!profile || !moduleAccess[module]?.includes(profile.rol)) {
            return res.status(403).json({
                message: 'No tienes permisos para acceder a este módulo'
            })
        }

        req.profile = profile
        return next()
    } catch (err) {
        console.error('Error inesperado al validar el rol del usuario:', err)
        return res.status(500).json({
            message: 'No se pudo validar el rol del usuario'
        })
    }
}
