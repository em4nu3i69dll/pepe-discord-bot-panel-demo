const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
require('dotenv').config();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'pepe_demo_secret',
    resave: true,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 86400000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((usuario, hecho) => {
    hecho(null, {
        id: usuario.id,
        username: usuario.username,
        avatar: usuario.avatar,
        discriminator: usuario.discriminator,
        email: usuario.email,
        accessToken: usuario.accessToken,
        refreshToken: usuario.refreshToken
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
    scope: ['identify', 'email', 'guilds']
}, async (accessToken, refreshToken, perfil, hecho) => {
    try {
        perfil.accessToken = accessToken;
        perfil.refreshToken = refreshToken;
        
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

app.use('/css', express.static(path.join(__dirname, 'vistas', 'css')));
app.use('/publico', express.static(path.join(__dirname, 'publico')));

app.get('/logout', (req, res) => {
    req.logout((err) => {
        res.redirect('/login');
    });
});

const rutas = require('./src/rutas/principal');
rutas(app, passport, baseDatos, bot);

const puerto = process.env.PUERTO || 3000;
app.listen(puerto, () => {
});

