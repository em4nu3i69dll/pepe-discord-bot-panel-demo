const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { autorizarServidor, rolAutomaticoSeguro, protegerFormularios, configurarSesion } = require('../src/middleware/seguridad')

function respuesta() {
    return { locals: {}, codigo: 200, status(codigo) { this.codigo = codigo; return this }, json(cuerpo) { this.cuerpo = cuerpo; return this } }
}

function servidorCon(miembro) {
    return { id: '111111111111111111', ownerId: '222222222222222222', members: {
        async fetch(opciones) {
            assert.equal(opciones.force, true)
            assert.equal(opciones.user, '333333333333333333')
            if (!miembro) throw new Error('No pertenece al servidor')
            return miembro
        }
    } }
}

for (const [nombre, bits, esperado] of [['miembro común', 0n, 403], ['gestor', 32n, 200], ['administrador', 8n, 200]]) {
    test(`Acceso por servidor para ${nombre}`, async () => {
        const servidor = servidorCon({ id: '333333333333333333', permissions: { bitfield: bits } })
        const bot = { cliente: { guilds: { cache: new Map([[servidor.id, servidor]]) } } }
        const res = respuesta()
        let llamadas = 0
        await autorizarServidor(bot)({ params: { guildId: servidor.id }, user: { id: '333333333333333333' } }, res, () => llamadas++)
        assert.equal(res.codigo, esperado)
        assert.equal(llamadas, esperado === 200 ? 1 : 0)
    })
}

test('No permite acceder a otro servidor aunque el bot esté instalado', async () => {
    const servidor = servidorCon(null)
    const bot = { cliente: { guilds: { cache: new Map([[servidor.id, servidor]]) } } }
    const res = respuesta()
    await autorizarServidor(bot)({ params: { guildId: servidor.id }, user: { id: '333333333333333333' } }, res, () => assert.fail('Acceso indebido'))
    assert.equal(res.codigo, 403)
})

for (const [metodo, ruta] of [['get', '/bienvenida/:guildId'], ['post', '/bienvenida/:guildId'], ['get', '/embeds/:guildId'], ['post', '/embeds/:guildId/enviar']]) {
    test(`La ruta ${metodo.toUpperCase()} ${ruta} impide acceder a otro servidor`, async () => {
        const rutas = new Map()
        const app = Object.fromEntries(['get', 'post'].map(verbo => [verbo, (url, ...controles) => rutas.set(verbo + url, controles)]))
        const archivo = path.join(__dirname, '../src/rutas/principal.js')
        const modulo = { exports: {} }
        vm.runInNewContext(fs.readFileSync(archivo, 'utf8'), {
            module: modulo,
            require(nombre) {
                if (nombre === 'axios') return {}
                if (nombre.startsWith('../middleware/')) return require(path.join(__dirname, '../src/rutas', nombre))
                throw new Error('Módulo inesperado')
            }
        }, { filename: archivo, timeout: 1000 })
        const servidor = servidorCon(null)
        const baseDatos = new Proxy({}, { get() { assert.fail('Se intentó acceder a la base de otro servidor') } })
        modulo.exports(app, { authenticate() { return () => {} } }, baseDatos, { cliente: { guilds: { cache: new Map([[servidor.id, servidor]]) } } })
        const res = respuesta()
        const req = { params: { guildId: servidor.id }, user: { id: '333333333333333333' }, isAuthenticated: () => true, body: {} }
        const controles = rutas.get(metodo + ruta)
        assert.equal(controles.length, 3)
        let indice = 0
        const siguiente = () => controles[indice++]?.(req, res, siguiente)
        await siguiente()
        assert.equal(res.codigo, 403)
        assert.equal(indice, 2)
    })
}

test('Rechaza identificadores malformados antes de consultar Discord', async () => {
    const res = respuesta()
    await autorizarServidor({})({ params: { guildId: '../otro' } }, res, () => assert.fail())
    assert.equal(res.codigo, 400)
})

test('Revalida permisos revocados en la siguiente solicitud', async () => {
    const miembro = { id: '333333333333333333', permissions: { bitfield: 32n } }
    const servidor = servidorCon(miembro)
    const control = autorizarServidor({ cliente: { guilds: { cache: new Map([[servidor.id, servidor]]) } } })
    const req = { params: { guildId: servidor.id }, user: { id: miembro.id } }
    await control(req, respuesta(), () => {})
    miembro.permissions.bitfield = 0n
    const res = respuesta()
    await control(req, res, () => assert.fail())
    assert.equal(res.codigo, 403)
})

test('CSRF exige el token de la sesión tanto para JSON como para formularios', () => {
    const session = {}
    protegerFormularios({ session, method: 'GET' }, respuesta(), () => {})
    assert.match(session.csrf, /^[a-f0-9]{64}$/)
    for (const token of [undefined, '0'.repeat(64), [], session.csrf]) {
        const res = respuesta()
        let aceptado = false
        protegerFormularios({ session, method: 'POST', get: () => token, body: {} }, res, () => { aceptado = true })
        assert.equal(aceptado, token === session.csrf)
    }
    protegerFormularios({ session, method: 'POST', get: () => undefined, body: { _csrf: session.csrf } }, respuesta(), () => {})
})

test('Requiere secreto propio y cookies seguras en producción', () => {
    assert.throws(() => configurarSesion({}), /SESSION_SECRET/)
    const entorno = { SESSION_SECRET: 'secreto-ficticio-solo-para-pruebas-'.repeat(2), NODE_ENV: 'production' }
    assert.throws(() => configurarSesion(entorno), /HTTPS/)
    const config = configurarSesion({ ...entorno, DISCORD_CALLBACK_URL: 'https://ejemplo.invalid/auth/discord/callback' })
    assert.equal(config.cookie.secure, true)
    assert.equal(config.cookie.httpOnly, true)
    assert.equal(config.cookie.sameSite, 'lax')
    assert.equal(config.resave, false)
})

test('Autoroles bloquea roles administrados, privilegios y jerarquías superiores', () => {
    const servidor = { id: 'servidor', ownerId: 'propietario' }
    const bot = { permissions: { bitfield: 268435456n }, roles: { highest: { position: 10 } } }
    const gestor = { id: 'gestor', permissions: { bitfield: 268435456n }, roles: { highest: { position: 6 } } }
    const rol = { id: 'rol', managed: false, position: 3, permissions: { bitfield: 0n }, comparePositionTo(otro) { return this.position - otro.position } }
    assert.equal(rolAutomaticoSeguro(rol, servidor, bot, gestor), true)
    assert.equal(rolAutomaticoSeguro({ ...rol, id: servidor.id }, servidor, bot, gestor), false)
    assert.equal(rolAutomaticoSeguro({ ...rol, managed: true }, servidor, bot, gestor), false)
    assert.equal(rolAutomaticoSeguro({ ...rol, permissions: { bitfield: 8n } }, servidor, bot, gestor), false)
    assert.equal(rolAutomaticoSeguro({ ...rol, position: 7 }, servidor, bot, gestor), false)
    assert.equal(rolAutomaticoSeguro(rol, servidor, bot, { ...gestor, permissions: { bitfield: 32n } }), false)
})
