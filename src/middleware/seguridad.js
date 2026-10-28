const { randomBytes, timingSafeEqual } = require('node:crypto')

const permisos = {
    administrador: 8n,
    gestionarServidor: 32n,
    gestionarRoles: 268435456n
}

function tienePermiso(miembro, permiso) {
    const valor = BigInt(miembro?.permissions?.bitfield ?? 0)
    return (valor & permisos.administrador) !== 0n || (valor & permiso) === permiso
}

function autorizarServidor(bot) {
    return async (req, res, siguiente) => {
        if (!/^\d{17,20}$/.test(req.params.guildId || '')) {
            return res.status(400).json({ error: 'Identificador de servidor inválido' })
        }
        const servidor = bot.cliente.guilds.cache.get(req.params.guildId)
        if (!servidor) return res.status(404).json({ error: 'Servidor no disponible' })
        try {
            const miembro = await servidor.members.fetch({ user: req.user.id, force: true })
            if (miembro.id !== req.user.id ||
                (miembro.id !== servidor.ownerId && !tienePermiso(miembro, permisos.gestionarServidor))) {
                return res.status(403).json({ error: 'No tenés permisos para gestionar este servidor' })
            }
            req.servidorAutorizado = servidor
            req.miembroAutorizado = miembro
            return siguiente()
        } catch {
            return res.status(403).json({ error: 'No se pudo verificar tu acceso al servidor' })
        }
    }
}

function rolAutomaticoSeguro(rol, servidor, miembroBot, miembro) {
    if (!rol || rol.id === servidor.id || rol.managed || !miembroBot ||
        !tienePermiso(miembroBot, permisos.gestionarRoles) ||
        rol.comparePositionTo(miembroBot.roles.highest) >= 0) return false
    const permisosSensibles = 8n | 32n | 16n | 2n | 4n | 128n | 8192n | 131072n | 268435456n | 536870912n | 1099511627776n
    if ((BigInt(rol.permissions.bitfield) & permisosSensibles) !== 0n) return false
    if (!miembro) return true
    return miembro.id === servidor.ownerId ||
        (tienePermiso(miembro, permisos.gestionarRoles) &&
            rol.comparePositionTo(miembro.roles.highest) < 0)
}

function protegerFormularios(req, res, siguiente) {
    if (!req.session.csrf) req.session.csrf = randomBytes(32).toString('hex')
    res.locals.csrf = req.session.csrf
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return siguiente()
    const recibido = req.get('x-csrf-token') || req.body?._csrf
    if (typeof recibido !== 'string' || !/^[a-f0-9]{64}$/.test(recibido) ||
        !timingSafeEqual(Buffer.from(recibido), Buffer.from(req.session.csrf))) {
        return res.status(403).json({ error: 'Formulario vencido o solicitud inválida. Recargá la página' })
    }
    return siguiente()
}

function configurarSesion(entorno) {
    if (!entorno.SESSION_SECRET || Buffer.byteLength(entorno.SESSION_SECRET) < 32) {
        throw new Error('SESSION_SECRET debe contener al menos 32 bytes aleatorios')
    }
    const produccion = entorno.NODE_ENV === 'production'
    if (produccion && !entorno.DISCORD_CALLBACK_URL?.startsWith('https://')) {
        throw new Error('DISCORD_CALLBACK_URL debe usar HTTPS en producción')
    }
    return {
        name: 'pepe.sid',
        secret: entorno.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: produccion, httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
    }
}

module.exports = { autorizarServidor, rolAutomaticoSeguro, protegerFormularios, configurarSesion }
