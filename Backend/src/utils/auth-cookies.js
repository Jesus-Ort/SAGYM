const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
}

export const getAuthCookies = (req) => {
    const cookies = {}

    for (const item of (req.headers.cookie || '').split(';')) {
        const separatorIndex = item.indexOf('=')
        if (separatorIndex === -1) continue

        const name = item.slice(0, separatorIndex).trim()
        const value = item.slice(separatorIndex + 1).trim()
        if (name === 'access_token') cookies.accessToken = value
        if (name === 'refresh_token') cookies.refreshToken = value
    }

    return cookies
}

export const setAuthCookies = (res, session) => {
    res.cookie('access_token', session.access_token, {
        ...cookieOptions,
        maxAge: session.expires_in * 1000
    })
    res.cookie('refresh_token', session.refresh_token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000
    })
}

export const clearAuthCookies = (res) => {
    res.clearCookie('access_token', cookieOptions)
    res.clearCookie('refresh_token', cookieOptions)
}
