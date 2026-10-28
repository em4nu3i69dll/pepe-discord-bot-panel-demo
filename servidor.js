const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
require('dotenv').config();

const { configurarSesion, protegerFormularios } = require('./src/middleware/seguridad');
const opcionesSesion = configurarSesion(process.env);
const bot = require('./bot');

const rutaBaseDatos = path.join(__dirname, 'base-datos');
if (!fs.existsSync(rutaBaseDatos)) {
    fs.mkdirSync(rutaBaseDatos, { recursive: true });
}

const archivoBaseDatos = path.join(rutaBaseDatos, 'base-datos.db');
const baseDatos = new sqlite3.Database(archivoBaseDatos, (err) => {
    if (err) {
        return;
    }

    const rutaEsquema = path.join(__dirname, 'src', 'base-datos', 'esquema.sql');
    if (fs.existsSync(rutaEsquema)) {
        const esquema = fs.readFileSync(rutaEsquema, 'utf8');
        baseDatos.exec(esquema, (err) => {
            if (err && !err.message.includes('already exists')) {
            }
        });
    }
});

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));

app.disable('x-powered-by');
if (process.env.PROXY_CONFIABLE) app.set('trust proxy', process.env.PROXY_CONFIABLE.split(',').map(valor => valor.trim()));
app.use((req, res, siguiente) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    siguiente();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));
app.use(session(opcionesSesion));
app.use(protegerFormularios);
app.use((req, res, siguiente) => {
    if (req.session.passport) res.setHeader('Cache-Control', 'no-store');
    siguiente();
});

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((usuario, hecho) => {
    hecho(null, {
        id: usuario.id,
        username: usuario.username,
        avatar: usuario.avatar,
        discriminator: usuario.discriminator,
        email: usuario.email,
        accessToken: usuario.accessToken
    });
});

passport.deserializeUser((obj, hecho) => {
    hecho(null, obj);
});

const urlCallback = process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback';

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: urlCallback,
    scope: ['identify', 'email', 'guilds'],
    state: true
}, async (accessToken, refreshToken, perfil, hecho) => {
    try {
        perfil.accessToken = accessToken;
        
        baseDatos.run(
            `INSERT INTO usuarios_oauth (discord_id, username, avatar, discriminator, email, actualizado_en)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(discord_id) DO UPDATE SET
               username=excluded.username,
               avatar=excluded.avatar,
               discriminator=excluded.discriminator,
               email=COALESCE(excluded.email, usuarios_oauth.email),
               actualizado_en=CURRENT_TIMESTAMP`,
            [perfil.id, perfil.username, perfil.avatar, perfil.discriminator, perfil.email],
            (err) => {
            }
        );
        return hecho(null, perfil);
    } catch (e) {
        return hecho(e, null);
    }
}));

app.use('/js', express.static(path.join(__dirname, 'vistas', 'js')));
app.use('/css', express.static(path.join(__dirname, 'vistas', 'css')));
app.use('/publico', express.static(path.join(__dirname, 'publico')));

app.post('/logout', (req, res, siguiente) => {
    req.logout((err) => {
        if (err) return siguiente(err);
        req.session.destroy((error) => {
            if (error) return siguiente(error);
            res.clearCookie('pepe.sid', { httpOnly: true, sameSite: 'lax', secure: opcionesSesion.cookie.secure });
            res.redirect('/login');
        });
    });
});

const rutas = require('./src/rutas/principal');
rutas(app, passport, baseDatos, bot);

app.use((error, req, res, siguiente) => {
    const estado = error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(estado).json({ error: estado === 413 ? 'Solicitud demasiado grande' : estado === 400 ? 'Solicitud inválida' : 'Error interno' });
});

const puerto = process.env.PUERTO || 3000;
app.listen(puerto, () => {
});

