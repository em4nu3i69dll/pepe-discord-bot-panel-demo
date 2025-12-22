const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const cliente = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

const rutaBaseDatos = path.join(__dirname, 'base-datos');
if (!fs.existsSync(rutaBaseDatos)) {
    fs.mkdirSync(rutaBaseDatos, { recursive: true });
}

const archivoBaseDatos = path.join(rutaBaseDatos, 'base-datos.db');
const baseDatos = new sqlite3.Database(archivoBaseDatos);

let ultimaActualizacion = 0;
const INTERVALO_ACTUALIZACION = 60000;

function actualizarEstadisticas(forzar = false) {
    const ahora = Date.now();
    if (!forzar && (ahora - ultimaActualizacion) < INTERVALO_ACTUALIZACION) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const guilds = cliente.guilds.cache;
        let totalServidores = guilds.size;
        let totalUsuarios = 0;
        let totalCanales = 0;

        const promesas = [];
        let procesados = 0;
        const total = guilds.size;

        if (total === 0) {
            baseDatos.run(
                `UPDATE estadisticas SET 
                    total_servidores = 0,
                    total_usuarios = 0,
                    total_canales = 0,
                    actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = 1`,
                [],
                (err) => {
                    if (err) {
                        console.error('[BOT] Error actualizando estadísticas:', err.message);
                        reject(err);
                    } else {
                        ultimaActualizacion = ahora;
                        resolve({ totalServidores: 0, totalUsuarios: 0, totalCanales: 0 });
                    }
                }
            );
            return;
        }

        guilds.forEach(guild => {
            promesas.push(
                guild.members.fetch({ limit: 0 }).then(members => {
                    totalUsuarios += members.size;
                    procesados++;
                }).catch(() => {
                    totalUsuarios += guild.memberCount || 0;
                    procesados++;
                })
            );
            
            promesas.push(
                guild.channels.fetch().then(channels => {
                    totalCanales += channels.size;
                }).catch(() => {
                    totalCanales += guild.channels.cache.size || 0;
                })
            );
        });

        Promise.all(promesas).then(() => {
            baseDatos.run(
                `UPDATE estadisticas SET 
                    total_servidores = ?,
                    total_usuarios = ?,
                    total_canales = ?,
                    actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = 1`,
                [totalServidores, totalUsuarios, totalCanales],
                (err) => {
                    if (err) {
                        console.error('[BOT] Error actualizando estadísticas:', err.message);
                        reject(err);
                    } else {
                        ultimaActualizacion = ahora;
                        resolve({ totalServidores, totalUsuarios, totalCanales });
                    }
                }
            );
        }).catch(reject);
    });
}

cliente.once('clientReady', async () => {
    console.log(`[BOT] ${cliente.user.tag} está en línea`);
    setTimeout(() => {
        actualizarEstadisticas(true).catch(() => {});
    }, 5000);
});

cliente.on('guildCreate', async (guild) => {
    setTimeout(() => {
        actualizarEstadisticas(true).catch(() => {});
    }, 2000);
});

cliente.on('guildDelete', async (guild) => {
    setTimeout(() => {
        actualizarEstadisticas(true).catch(() => {});
    }, 2000);
});

cliente.on('guildMemberAdd', async (miembro) => {
    try {
        baseDatos.get(
            'SELECT * FROM mensajes_bienvenida WHERE guild_id = ? AND bienvenida_habilitada = 1',
            [miembro.guild.id],
            async (err, config) => {
                if (err) {
                    console.error('[BOT] Error obteniendo configuración:', err.message);
                    return;
                }

                if (!config || !config.canal_bienvenida_id) return;

                const canal = await miembro.guild.channels.fetch(config.canal_bienvenida_id).catch(() => null);
                if (!canal) return;

                let mensaje = config.mensaje_bienvenida || `¡Bienvenido ${miembro.user.username} al servidor!`;

                mensaje = mensaje
                    .replace(/{usuario}/g, miembro.user.toString())
                    .replace(/{nombre}/g, miembro.user.username)
                    .replace(/{servidor}/g, miembro.guild.name)
                    .replace(/{miembros}/g, miembro.guild.memberCount);

                if (config.embed_bienvenida) {
                    try {
                        const datosEmbed = typeof config.embed_bienvenida === 'string' 
                            ? JSON.parse(config.embed_bienvenida) 
                            : config.embed_bienvenida;
                        const embed = new EmbedBuilder();

                        if (datosEmbed.titulo) embed.setTitle(datosEmbed.titulo);
                        if (datosEmbed.descripcion) embed.setDescription(datosEmbed.descripcion);
                        if (datosEmbed.color) {
                            const color = typeof datosEmbed.color === 'string' && datosEmbed.color.startsWith('#')
                                ? parseInt(datosEmbed.color.replace('#', ''), 16)
                                : datosEmbed.color;
                            embed.setColor(color);
                        }
                        if (datosEmbed.imagen) embed.setImage(datosEmbed.imagen);
                        if (datosEmbed.thumbnail) embed.setThumbnail(datosEmbed.thumbnail);
                        if (datosEmbed.footer) embed.setFooter({ text: datosEmbed.footer });

                        await canal.send({ content: mensaje, embeds: [embed] });
                    } catch (e) {
                        await canal.send(mensaje);
                    }
                } else {
                    await canal.send(mensaje);
                }

                if (config.autorol_habilitado && config.roles_auto) {
                    try {
                        const roles = JSON.parse(config.roles_auto);
                        for (const rolId of roles) {
                            const rol = await miembro.guild.roles.fetch(rolId).catch(() => null);
                            if (rol && miembro.guild.members.me.roles.highest.position > rol.position) {
                                await miembro.roles.add(rol).catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.error('[BOT] Error asignando roles:', e.message);
                    }
                }
            }
        );
    } catch (error) {
        console.error('[BOT] Error en guildMemberAdd:', error.message);
    }
});

cliente.login(process.env.DISCORD_BOT_TOKEN);

module.exports = { cliente, actualizarEstadisticas };

