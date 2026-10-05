import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import express from 'express';
import authRoutes from './routes/auth.routes.js'

const app = express();

const PORT = process.env.PORT || 3001

app.set('trust proxy', process.env.TRUST_PROXY === 'true')

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

const corsOptions = {
    origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
            return callback(null, true)
        }
        return callback(null, false)
    }
}

app.use(helmet())
app.use(cors({
    ...corsOptions,
    credentials: true
}))
app.use(express.json())

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Inténtalo más tarde.' }
})

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX) || 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas peticiones. Inténtalo más tarde.' }
})


app.use('/api', apiLimiter)
app.use('/api/auth', authLimiter, authRoutes)
app.get('/api/', (req, res) => {
    res.send('Hello World!')
})

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});