const axios = require('axios');
const { autorizarServidor, rolAutomaticoSeguro } = require('../middleware/seguridad');
const { estaAutenticado } = require('../middleware/autenticacion');

async function obtenerServidoresConRetry(accessToken, maxIntentos = 3) {
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            const response = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
                timeout: 10000,
                maxRedirects: 0,
                maxContentLength: 2 * 1024 * 1024,
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data || [];
        } catch (error) {
            if (error.response?.status === 429 && intento < maxIntentos) {
                const retryAfter = Math.min(5, Math.max(0, Number(error.response.data?.retry_after) || 1));
                await new Promise(resolve => setTimeout(resolve, (retryAfter * 1000) + 100));
                continue;
            }
            throw error;
        }
    }
    return [];
}

module.exports = function(app, passport, baseDatos, bot) {
    const gestionarServidor = autorizarServidor(bot);
    app.get('/', (req, res) => {
        if (req.isAuthenticated()) {
            return res.redirect('/dashboard');
        }
        res.redirect('/login');
    });

    app.get('/login', (req, res) => {
        if (req.isAuthenticated()) {
            return res.redirect('/dashboard');
        }

        baseDatos.get(
            'SELECT total_servidores, total_usuarios, total_canales FROM estadisticas WHERE id = 1',
            [],
            (err, stats) => {
                const metrics = stats || { total_servidores: 0, total_usuarios: 0, total_canales: 0 };

                res.render('login/login', {
                    avatares: [],
                    metrics: {
                        servidores: metrics.total_servidores || 0,
                        usuarios: metrics.total_usuarios || 0,
                        canales: metrics.total_canales || 0
                    }
                });
            }
        );
    });

    app.get('/auth/discord', passport.authenticate('discord'));

    app.get('/auth/discord/callback', passport.authenticate('discord', {
        failureRedirect: '/login?error=autenticacion'
    }), (req, res) => res.redirect('/dashboard'));

    app.get('/dashboard', estaAutenticado, async (req, res) => {
        if (!req.user) {
            return res.redirect('/login');
        }

        if (!req.user.accessToken) {
            return res.redirect('/login');
        }

        try {
            const servidores = await obtenerServidoresConRetry(req.user.accessToken);

            const servidoresConPermisos = servidores.filter(servidor => {
                const permisos = BigInt(servidor.permissions || 0);
                const esAdmin = (permisos & BigInt(0x8)) === BigInt(0x8);
                const puedeGestionar = (permisos & BigInt(0x20)) === BigInt(0x20);
                return servidor.owner || esAdmin || puedeGestionar;
            });

            const clientId = process.env.DISCORD_CLIENT_ID;
            const servidoresConInfo = servidoresConPermisos.map(servidor => {
                const tieneBot = bot.cliente.guilds.cache.has(servidor.id);
                return {
                    ...servidor,
                    tieneBot: tieneBot
                };
            });

            res.render('dashboard/dashboard', {
                usuario: req.user,
                servidores: servidoresConInfo,
                clientId: clientId
            });
        } catch (error) {
            if (error.response?.status === 401) {
                return res.redirect('/login?error=token_expirado');
            }

            res.render('dashboard/dashboard', {
                usuario: req.user,
                servidores: [],
                clientId: process.env.DISCORD_CLIENT_ID
            });
        }
    });

    app.get('/bienvenida/:guildId', estaAutenticado, gestionarServidor, async (req, res) => {
        const guildId = req.params.guildId;

        try {
            const servidor = bot.cliente.guilds.cache.get(guildId);
            if (!servidor) {
                return res.redirect('/dashboard?error=servidor_no_encontrado');
            }

            const canales = servidor.channels.cache
                .filter(c => c.type === 0)
                .map(c => ({ id: c.id, name: c.name }));

            const miembroBot = servidor.members.cache.get(bot.cliente.user.id);

            const roles = servidor.roles.cache
                .filter(r => r.id !== servidor.id && !r.managed)
                .sort((a, b) => b.position - a.position)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    color: r.color,
                    position: r.position,
                    puedeAsignar: rolAutomaticoSeguro(r, servidor, miembroBot, req.miembroAutorizado)
                }));

            const servidorData = {
                id: servidor.id,
                name: servidor.name,
                icon: servidor.icon
            };

            baseDatos.get(
                'SELECT * FROM mensajes_bienvenida WHERE guild_id = ?',
                [guildId],
                (err, config) => {
                    if (err) {
                        return res.render('bienvenida/bienvenida', {
                            usuario: req.user,
                            servidor: servidorData,
                            canales: canales,
                            roles: roles,
                            config: null
                        });
                    }

                    let configProcesada = config ? { ...config } : {};

                    if (config && config.embed_bienvenida) {
                        try {
                            const embed = typeof config.embed_bienvenida === 'string'
                                ? JSON.parse(config.embed_bienvenida)
                                : config.embed_bienvenida;
                            configProcesada.embed_bienvenida = {
                                titulo: embed.title || embed.titulo || '',
                                descripcion: embed.description || embed.descripcion || '',
                                color: embed.color || '#5865F2',
                                imagen: embed.image ? (embed.image.url || embed.image) : (embed.imagen ? (embed.imagen.url || embed.imagen) : null),
                                thumbnail: embed.thumbnail ? (embed.thumbnail.url || embed.thumbnail) : null,
                                footer: embed.footer ? (embed.footer.text || embed.footer) : null
                            };
                        } catch (e) {
                            configProcesada.embed_bienvenida = {};
                        }
                    }

                    if (config && config.roles_auto) {
                        try {
                            const rolesParsed = typeof config.roles_auto === 'string'
                                ? JSON.parse(config.roles_auto)
                                : config.roles_auto;
                            configProcesada.roles_auto = Array.isArray(rolesParsed)
                                ? rolesParsed.map(r => String(r))
                                : [];
                        } catch (e) {
                            configProcesada.roles_auto = [];
                        }
                    } else {
                        configProcesada.roles_auto = [];
                    }

                    res.render('bienvenida/bienvenida', {
                        usuario: req.user,
                        servidor: servidorData,
                        canales: canales,
                        roles: roles,
                        config: configProcesada || null
                    });
                }
            );
        } catch (error) {
            res.redirect('/dashboard?error=servidor_no_encontrado');
        }
    });

    app.post('/bienvenida/:guildId', estaAutenticado, gestionarServidor, async (req, res) => {
        const guildId = req.params.guildId;
        const {
            bienvenida_habilitada,
            canal_bienvenida_id,
            embed_titulo,
            embed_descripcion,
            embed_color,
            embed_thumbnail,
            embed_imagen,
            embed_footer,
            autorol_habilitado,
            roles_auto
        } = req.body;

        try {
            const servidor = bot.cliente.guilds.cache.get(guildId);
            if (!servidor) {
                return res.redirect('/dashboard?error=servidor_no_encontrado');
            }

            const miembroBot = servidor.members.cache.get(bot.cliente.user.id);

            let rolesSeleccionados = roles_auto ? (Array.isArray(roles_auto) ? roles_auto : [roles_auto]) : [];
            rolesSeleccionados = rolesSeleccionados
                .map(r => String(r))
                .filter(roleId => {
                    const rol = servidor.roles.cache.get(roleId);
                    return rolAutomaticoSeguro(rol, servidor, miembroBot, req.miembroAutorizado);
                });

            if (canal_bienvenida_id) {
                const canal = await servidor.channels.fetch(canal_bienvenida_id).catch(() => null);
                if (!canal || canal.guildId !== servidor.id || canal.type !== 0) {
                    return res.status(400).json({ error: 'Canal de bienvenida inválido' });
                }
            }

            const embedBienvenida = {
                titulo: embed_titulo || null,
                descripcion: embed_descripcion || null,
                color: embed_color || '#5865F2',
                thumbnail: embed_thumbnail ? { url: embed_thumbnail } : null,
                imagen: embed_imagen ? { url: embed_imagen } : null,
                footer: embed_footer ? { text: embed_footer } : null
            };

            baseDatos.run(
                `INSERT INTO mensajes_bienvenida
                 (guild_id, bienvenida_habilitada, canal_bienvenida_id, embed_bienvenida, autorol_habilitado, roles_auto)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(guild_id) DO UPDATE SET
                   bienvenida_habilitada=excluded.bienvenida_habilitada,
                   canal_bienvenida_id=excluded.canal_bienvenida_id,
                   embed_bienvenida=excluded.embed_bienvenida,
                   autorol_habilitado=excluded.autorol_habilitado,
                   roles_auto=excluded.roles_auto`,
                [
                    guildId,
                    bienvenida_habilitada === 'on' ? 1 : 0,
                    canal_bienvenida_id || null,
                    JSON.stringify(embedBienvenida),
                    autorol_habilitado === 'on' ? 1 : 0,
                    rolesSeleccionados.length > 0 ? JSON.stringify(rolesSeleccionados) : null
                ],
                (err) => {
                    if (err) {
                        return res.redirect(`/bienvenida/${guildId}?error=error_guardar`);
                    }
                    res.redirect(`/bienvenida/${guildId}?exito=configuracion_guardada`);
                }
            );
        } catch (error) {
            res.redirect(`/bienvenida/${guildId}?error=error_guardar`);
        }
    });

    app.get('/embeds/:guildId', estaAutenticado, gestionarServidor, async (req, res) => {
        const guildId = req.params.guildId;

        try {
            const servidor = bot.cliente.guilds.cache.get(guildId);
            if (!servidor) {
                return res.redirect('/dashboard?error=servidor_no_encontrado');
            }

            const canales = servidor.channels.cache
                .filter(c => c.type === 0)
                .map(c => ({ id: c.id, name: c.name }));

            const servidorData = {
                id: servidor.id,
                name: servidor.name,
                icon: servidor.icon
            };

            baseDatos.all(
                'SELECT * FROM historial_embeds WHERE guild_id = ? ORDER BY enviado_en DESC LIMIT 50',
                [guildId],
                (err, historial) => {
                    res.render('embeds/embeds', {
                        usuario: req.user,
                        servidor: servidorData,
                        canales: canales,
                        historial: historial || []
                    });
                }
            );
        } catch (error) {
            res.redirect('/dashboard?error=servidor_no_encontrado');
        }
    });

    app.post('/embeds/:guildId/enviar', estaAutenticado, gestionarServidor, async (req, res) => {
        const guildId = req.params.guildId;
        const { canal_id, datos_embed } = req.body;

        try {
            const servidor = bot.cliente.guilds.cache.get(guildId);
            if (!servidor) {
                return res.status(404).json({ error: 'Servidor no encontrado' });
            }

            const canal = await servidor.channels.fetch(canal_id).catch(() => null);
            if (!canal || canal.guildId !== servidor.id || canal.type !== 0) {
                return res.status(404).json({ error: 'Canal no encontrado' });
            }

            let embed;
            try {
                embed = JSON.parse(datos_embed);
                if (!embed || typeof embed !== 'object' || Array.isArray(embed)) throw new Error();
                for (const [campo, limite] of Object.entries({ titulo: 256, descripcion: 4096, footer: 2048, imagen: 2048, thumbnail: 2048, color: 7 })) {
                    if (embed[campo] != null && (typeof embed[campo] !== 'string' || embed[campo].length > limite)) throw new Error();
                }
                if (embed.color && !/^#[a-f0-9]{6}$/i.test(embed.color)) throw new Error();
                for (const campo of ['imagen', 'thumbnail']) {
                    if (embed[campo] && !['http:', 'https:'].includes(new URL(embed[campo]).protocol)) throw new Error();
                }
            } catch {
                return res.status(400).json({ error: 'Datos del embed inválidos' });
            }
            const { EmbedBuilder } = require('discord.js');
            const embedDiscord = new EmbedBuilder();

            if (embed.titulo) embedDiscord.setTitle(embed.titulo);
            if (embed.descripcion) embedDiscord.setDescription(embed.descripcion);
            if (embed.color) embedDiscord.setColor(embed.color);
            if (embed.imagen) embedDiscord.setImage(embed.imagen);
            if (embed.thumbnail) embedDiscord.setThumbnail(embed.thumbnail);
            if (embed.footer) embedDiscord.setFooter({ text: embed.footer });

            const mensaje = await canal.send({ embeds: [embedDiscord], allowedMentions: { parse: [] } });

            baseDatos.run(
                'INSERT INTO historial_embeds (guild_id, canal_id, datos_embed) VALUES (?, ?, ?)',
                [guildId, canal_id, datos_embed],
                () => {}
            );

            res.json({ exito: true, mensaje_id: mensaje.id });
        } catch (error) {
            res.status(500).json({ error: 'Error enviando embed' });
        }
    });
};

