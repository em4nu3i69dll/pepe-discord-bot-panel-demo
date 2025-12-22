CREATE TABLE IF NOT EXISTS mensajes_bienvenida (
    guild_id VARCHAR(255) PRIMARY KEY,
    bienvenida_habilitada BOOLEAN DEFAULT FALSE,
    canal_bienvenida_id VARCHAR(255),
    mensaje_bienvenida TEXT,
    embed_bienvenida JSON,
    autorol_habilitado BOOLEAN DEFAULT FALSE,
    roles_auto JSON
);

CREATE TABLE IF NOT EXISTS historial_embeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id VARCHAR(255) NOT NULL,
    canal_id VARCHAR(255) NOT NULL,
    datos_embed JSON NOT NULL,
    enviado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios_oauth (
    discord_id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255),
    avatar VARCHAR(255),
    discriminator VARCHAR(10),
    email VARCHAR(255),
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS estadisticas (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_servidores INTEGER DEFAULT 0,
    total_usuarios INTEGER DEFAULT 0,
    total_canales INTEGER DEFAULT 0,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO estadisticas (id, total_servidores, total_usuarios, total_canales) VALUES (1, 0, 0, 0);

