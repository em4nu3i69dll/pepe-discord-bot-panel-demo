const axios = require('axios');
const { estaAutenticado } = require('../middleware/autenticacion');

async function obtenerServidoresConRetry(accessToken, maxIntentos = 3) {
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            const response = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data || [];
        } catch (error) {
            if (error.response?.status === 429 && intento < maxIntentos) {
                const retryAfter = error.response.data?.retry_after || 1;
                console.log(`[RUTAS] Rate limit, esperando ${retryAfter}s antes del intento ${intento + 1}`);
                await new Promise(resolve => setTimeout(resolve, (retryAfter * 1000) + 100));
                continue;
            }
            throw error;
        }
    }
    return [];
}

module.exports = function(app, passport, baseDatos, bot) {
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
                if (err) {
                    console.error('[RUTAS] Error obteniendo estadísticas:', err.message);
                }

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
    }), async (req, res) => {
        if (!req.user || !req.user.accessToken) {
            console.error('[RUTAS] Error: Usuario autenticado pero sin accessToken');
            return res.redirect('/login?error=sin_token');
        }
        
        console.log(`[RUTAS] Usuario ${req.user.id} autenticado correctamente`);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const servidores = await obtenerServidoresConRetry(req.user.accessToken);
            console.log(`[RUTAS] Obtenidos ${servidores.length} servidores en callback`);

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
            console.error('[RUTAS] Error obteniendo servidores en callback:', error.message);
            res.redirect('/dashboard');
        }
    });

    app.get('/dashboard', estaAutenticado, async (req, res) => {
        if (!req.user) {
            console.error('[RUTAS] Usuario no autenticado');
            return res.redirect('/login');
        }

        if (!req.user.accessToken) {
            console.error('[RUTAS] Usuario sin accessToken, redirigiendo a login');
            return res.redirect('/login');
        }

        console.log(`[RUTAS] Obteniendo servidores para usuario ${req.user.id} (${req.user.username})`);

        try {
            const servidores = await obtenerServidoresConRetry(req.user.accessToken);
            console.log(`[RUTAS] Obtenidos ${servidores.length} servidores para usuario ${req.user.id}`);
            
            const servidoresConPermisos = servidores.filter(servidor => {
                const permisos = BigInt(servidor.permissions || 0);
                const esAdmin = (permisos & BigInt(0x8)) === BigInt(0x8);
                const puedeGestionar = (permisos & BigInt(0x20)) === BigInt(0x20);
                return servidor.owner || esAdmin || puedeGestionar;
            });
            
            console.log(`[RUTAS] ${servidoresConPermisos.length} servidores con permisos de administrador o gestión`);

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
            console.error('[RUTAS] Error obteniendo servidores:');
            console.error('  Status:', error.response?.status);
            console.error('  Data:', error.response?.data);
            console.error('  Message:', error.message);
            
            if (error.response?.status === 401) {
                console.error('[RUTAS] Token expirado, redirigiendo a login');
                return res.redirect('/login?error=token_expirado');
            }
            
            res.render('dashboard/dashboard', {
                usuario: req.user,
                servidores: [],
                clientId: process.env.DISCORD_CLIENT_ID
            });
        }
    });

    app.get('/bienvenida/:guildId', estaAutenticado, (req, res) => {
        const guildId = req.params.guildId;

        axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
            }
        }).then(response => {
            const servidor = response.data;

            axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
                headers: {
                    'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
                }
            }).then(channelsResponse => {
                const canales = channelsResponse.data.filter(c => c.type === 0);

                axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
                    headers: {
                        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
                    }
                }).then(rolesResponse => {
                    const roles = rolesResponse.data.filter(r => !r.managed && r.name !== '@everyone');

                    baseDatos.get(
                        'SELECT * FROM mensajes_bienvenida WHERE guild_id = ?',
                        [guildId],
                        (err, config) => {
                            if (err) {
                                console.error('[RUTAS] Error obteniendo configuración:', err.message);
                                return res.render('bienvenida/bienvenida', {
                                    usuario: req.user,
                                    servidor: servidor,
                                    canales: canales,
                                    roles: roles,
                                    config: null
                                });
                            }

                            res.render('bienvenida/bienvenida', {
                                usuario: req.user,
                                servidor: servidor,
                                canales: canales,
                                roles: roles,
                                config: config || null
                            });
                        }
                    );
                }).catch(() => {
                    res.render('bienvenida/bienvenida', {
                        usuario: req.user,
                        servidor: servidor,
                        canales: canales,
                        roles: [],
                        config: null
                    });
                });
            }).catch(() => {
                res.render('bienvenida/bienvenida', {
                    usuario: req.user,
                    servidor: servidor,
                    canales: [],
                    roles: [],
                    config: null
                });
            });
        }).catch(() => {
            res.redirect('/dashboard?error=servidor_no_encontrado');
        });
    });

    app.post('/bienvenida/:guildId', estaAutenticado, (req, res) => {
        const guildId = req.params.guildId;
        const {
            bienvenida_habilitada,
            canal_bienvenida_id,
            mensaje_bienvenida,
            embed_bienvenida,
            autorol_habilitado,
            roles_auto
        } = req.body;

        const rolesSeleccionados = roles_auto ? (Array.isArray(roles_auto) ? roles_auto : [roles_auto]) : [];

        baseDatos.run(
            `INSERT INTO mensajes_bienvenida 
             (guild_id, bienvenida_habilitada, canal_bienvenida_id, mensaje_bienvenida, embed_bienvenida, autorol_habilitado, roles_auto)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(guild_id) DO UPDATE SET
               bienvenida_habilitada=excluded.bienvenida_habilitada,
               canal_bienvenida_id=excluded.canal_bienvenida_id,
               mensaje_bienvenida=excluded.mensaje_bienvenida,
               embed_bienvenida=excluded.embed_bienvenida,
               autorol_habilitado=excluded.autorol_habilitado,
               roles_auto=excluded.roles_auto`,
            [
                guildId,
                bienvenida_habilitada === 'on' ? 1 : 0,
                canal_bienvenida_id || null,
                mensaje_bienvenida || null,
                embed_bienvenida ? JSON.stringify(embed_bienvenida) : null,
                autorol_habilitado === 'on' ? 1 : 0,
                rolesSeleccionados.length > 0 ? JSON.stringify(rolesSeleccionados) : null
            ],
            (err) => {
                if (err) {
                    console.error('[RUTAS] Error guardando configuración:', err.message);
                    return res.redirect(`/bienvenida/${guildId}?error=error_guardar`);
                }
                res.redirect(`/bienvenida/${guildId}?exito=configuracion_guardada`);
            }
        );
    });

    app.get('/embeds/:guildId', estaAutenticado, (req, res) => {
        const guildId = req.params.guildId;

        axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
            }
        }).then(response => {
            const servidor = response.data;

            axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
                headers: {
                    'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
                }
            }).then(channelsResponse => {
                const canales = channelsResponse.data.filter(c => c.type === 0);

                baseDatos.all(
                    'SELECT * FROM historial_embeds WHERE guild_id = ? ORDER BY enviado_en DESC LIMIT 50',
                    [guildId],
                    (err, historial) => {
                        if (err) {
                            console.error('[RUTAS] Error obteniendo historial:', err.message);
                        }

                        res.render('embeds/embeds', {
                            usuario: req.user,
                            servidor: servidor,
                            canales: canales,
                            historial: historial || []
                        });
                    }
                );
            }).catch(() => {
                res.render('embeds/embeds', {
                    usuario: req.user,
                    servidor: servidor,
                    canales: [],
                    historial: []
                });
            });
        }).catch(() => {
            res.redirect('/dashboard?error=servidor_no_encontrado');
        });
    });

    app.post('/embeds/:guildId/enviar', estaAutenticado, async (req, res) => {
        const guildId = req.params.guildId;
        const { canal_id, datos_embed } = req.body;

        try {
            const servidor = bot.cliente.guilds.cache.get(guildId);
            if (!servidor) {
                return res.status(404).json({ error: 'Servidor no encontrado' });
            }

            const canal = await servidor.channels.fetch(canal_id).catch(() => null);
            if (!canal) {
                return res.status(404).json({ error: 'Canal no encontrado' });
            }

            const embed = JSON.parse(datos_embed);
            const { EmbedBuilder } = require('discord.js');
            const embedDiscord = new EmbedBuilder();

            if (embed.titulo) embedDiscord.setTitle(embed.titulo);
            if (embed.descripcion) embedDiscord.setDescription(embed.descripcion);
            if (embed.color) embedDiscord.setColor(embed.color);
            if (embed.imagen) embedDiscord.setImage(embed.imagen);
            if (embed.thumbnail) embedDiscord.setThumbnail(embed.thumbnail);
            if (embed.footer) embedDiscord.setFooter({ text: embed.footer });

            const mensaje = await canal.send({ embeds: [embedDiscord] });

            baseDatos.run(
                'INSERT INTO historial_embeds (guild_id, canal_id, datos_embed) VALUES (?, ?, ?)',
                [guildId, canal_id, datos_embed],
                () => {}
            );

            res.json({ exito: true, mensaje_id: mensaje.id });
        } catch (error) {
            console.error('[RUTAS] Error enviando embed:', error.message);
            res.status(500).json({ error: 'Error enviando embed' });
        }
    });
};

