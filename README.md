# Pepe Demo - Bot de Discord con Panel de Control

Bot de Discord simplificado con panel web para gestionar bienvenidas, embeds y autoroles. Versión demo. 

[Preview Demo](https://youtu.be/geo0uuh1tZU)

## 📋 Características

### 🤖 Funcionalidades del Bot

- **Mensajes de Bienvenida**: Configuración de mensajes personalizados cuando nuevos miembros se unen al servidor
- **Autoroles**: Asignación automática de roles a nuevos miembros
- **Embeds Personalizados**: Constructor visual para crear y enviar embeds a canales

### 🌐 Panel Web

- **Dashboard**: Vista de todos tus servidores de Discord
- **Autenticación OAuth2**: Login seguro mediante Discord
- **Configuración de Bienvenidas**: Interfaz intuitiva para configurar mensajes y roles
- **Constructor de Embeds**: Editor visual con vista previa en tiempo real

## 🚀 Instalación

### Requisitos Previos

- Node.js v16 o superior
- npm o yarn
- Bot de Discord configurado en [Discord Developer Portal](https://discord.com/developers/applications)

### Pasos de Instalación

1. **Clonar o descargar el proyecto**

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Configurar en el archivo .ENV todas las variables de entorno necesarias. 

### Cómo obtener las credenciales de Discord

1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crea una nueva aplicación o selecciona una existente
3. En la sección "Bot", crea un bot y copia el token
4. En la sección "OAuth2", configura:
   - Redirect URI: `http://localhost:3000/auth/discord/callback`
   - Scopes: `bot`, `identify`, `email`, `guilds`
5. Copia el Client ID y Client Secret

## 🎯 Uso

### Iniciar el Bot y el Servidor

```bash
npm run inicio
```

### Acceder al Panel

1. Abre tu navegador en `http://localhost:3000`
2. Haz clic en "Continuar con Discord" para autenticarte
3. Selecciona un servidor para configurar

## 📝 Licencia: MIT License

## 👤 Autor: Emanuel Duarte

Desarrollado con:
- [Discord.js](https://discord.js.org/) - Librería de Discord API
- [Express](https://expressjs.com/) - Framework web
- [Passport.js](https://www.passportjs.org/) - Autenticación
- [EJS](https://ejs.co/) - Motor de plantillas


### Premium Code Bot

https://github.com/em4nu3i69dll/pepe-discord-bot-panel
