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

cliente.once('ready', () => {
    console.log(`Bot iniciado correctamente como ${cliente.user.tag}`);
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

function reemplazarVariables(texto, miembro, servidor) {
    if (!texto) return texto;
    
    let propietario = null;
    try {
        propietario = servidor.members.cache.get(servidor.ownerId);
    } catch (error) {}

    const fechaLocal = new Date().toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return texto
        .replace(/{mention}/g, miembro.user.toString())
        .replace(/{usuario}/g, miembro.user.toString())
        .replace(/{user}/g, miembro.user.username)
        .replace(/{user\.name}/g, miembro.user.username)
        .replace(/{user\.tag}/g, miembro.user.tag)
        .replace(/{user\.id}/g, miembro.user.id)
        .replace(/{nombre}/g, miembro.user.username)
        .replace(/{server}/g, servidor.name)
        .replace(/{server\.name}/g, servidor.name)
        .replace(/{server\.id}/g, servidor.id)
        .replace(/{server\.member_count}/g, servidor.memberCount.toString())
        .replace(/{servidor}/g, servidor.name)
        .replace(/{miembros}/g, servidor.memberCount.toString())
        .replace(/{owner\.mention}/g, propietario ? propietario.user.toString() : 'Desconocido')
        .replace(/{date}/g, fechaLocal)
        .replace(/{user_avatar}/g, miembro.user.displayAvatarURL({ dynamic: true, size: 256 }));
}

cliente.on('guildMemberAdd', async (miembro) => {
    try {
        baseDatos.get(
            'SELECT * FROM mensajes_bienvenida WHERE guild_id = ?',
            [miembro.guild.id],
            async (err, config) => {
                if (err) {
                    return;
                }

                if (!config) {
                    return;
                }

                if ((config.bienvenida_habilitada === 1 || config.bienvenida_habilitada === true) && config.canal_bienvenida_id) {
                    const canal = await miembro.guild.channels.fetch(config.canal_bienvenida_id).catch(() => null);
                    if (canal) {
                        if (config.embed_bienvenida) {
                            try {
                                const datosEmbed = typeof config.embed_bienvenida === 'string' 
                                    ? JSON.parse(config.embed_bienvenida) 
                                    : config.embed_bienvenida;
                                const embed = new EmbedBuilder();

                                if (datosEmbed.title || datosEmbed.titulo) {
                                    const titulo = datosEmbed.title || datosEmbed.titulo;
                                    embed.setTitle(reemplazarVariables(titulo, miembro, miembro.guild));
                                }
                                if (datosEmbed.description || datosEmbed.descripcion) {
                                    const descripcion = datosEmbed.description || datosEmbed.descripcion;
                                    embed.setDescription(reemplazarVariables(descripcion, miembro, miembro.guild));
                                }
                                if (datosEmbed.color) {
                                    const color = typeof datosEmbed.color === 'string' && datosEmbed.color.startsWith('#')
                                        ? parseInt(datosEmbed.color.replace('#', ''), 16)
                                        : datosEmbed.color;
                                    embed.setColor(color);
                                }
                                if (datosEmbed.image || datosEmbed.imagen) {
                                    let imageUrl = null;
                                    if (datosEmbed.image) {
                                        imageUrl = typeof datosEmbed.image === 'string' ? datosEmbed.image : (datosEmbed.image.url || datosEmbed.image);
                                    } else if (datosEmbed.imagen) {
                                        imageUrl = typeof datosEmbed.imagen === 'string' ? datosEmbed.imagen : (datosEmbed.imagen.url || datosEmbed.imagen);
                                    }
                                    if (imageUrl) {
                                        embed.setImage(reemplazarVariables(imageUrl, miembro, miembro.guild));
                                    }
                                }
                                if (datosEmbed.thumbnail) {
                                    let thumbnailUrl = null;
                                    if (typeof datosEmbed.thumbnail === 'string') {
                                        thumbnailUrl = datosEmbed.thumbnail;
                                    } else if (datosEmbed.thumbnail.url) {
                                        thumbnailUrl = datosEmbed.thumbnail.url;
                                    } else {
                                        thumbnailUrl = datosEmbed.thumbnail;
                                    }
                                    if (thumbnailUrl) {
                                        if (thumbnailUrl === '{user_avatar}' || thumbnailUrl.includes('{user_avatar}')) {
                                            thumbnailUrl = miembro.user.displayAvatarURL({ dynamic: true, size: 256 });
                                        }
                                        embed.setThumbnail(reemplazarVariables(thumbnailUrl, miembro, miembro.guild));
                                    }
                                }
                                if (datosEmbed.footer) {
                                    const footerText = typeof datosEmbed.footer === 'string' 
                                        ? datosEmbed.footer 
                                        : (datosEmbed.footer.text || datosEmbed.footer);
                                    if (footerText) {
                                        embed.setFooter({ text: reemplazarVariables(footerText, miembro, miembro.guild) });
                                    }
                                }

                                await canal.send({ embeds: [embed] });
                            } catch (error) {}
                        }
                    }
                }

                if ((config.autorol_habilitado === 1 || config.autorol_habilitado === true) && config.roles_auto) {
                    try {
                        const roles = typeof config.roles_auto === 'string' ? JSON.parse(config.roles_auto) : config.roles_auto;
                        if (Array.isArray(roles)) {
                            for (const rolId of roles) {
                                const rol = await miembro.guild.roles.fetch(rolId).catch(() => null);
                                if (rol && miembro.guild.members.me.roles.highest.position > rol.position) {
                                    await miembro.roles.add(rol).catch(() => {});
                                }
                            }
                        }
                    } catch (error) {}
                }
            }
        );
    } catch (error) {}
});

cliente.login(process.env.DISCORD_BOT_TOKEN);

module.exports = { cliente, actualizarEstadisticas };

