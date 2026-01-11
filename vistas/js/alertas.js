(function() {
    let contenedorAlertas = null;

    function crearContenedor() {
        if (!contenedorAlertas) {
            contenedorAlertas = document.createElement('div');
            contenedorAlertas.className = 'contenedor-alertas';
            contenedorAlertas.id = 'contenedor-alertas';
            document.body.appendChild(contenedorAlertas);
        }
        return contenedorAlertas;
    }

    function obtenerIcono(tipo) {
        const iconos = {
            exito: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            advertencia: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };
        return iconos[tipo] || iconos.info;
    }

    function mostrarAlerta(mensaje, tipo = 'info', duracion = 5000) {
        const contenedor = crearContenedor();
        const alerta = document.createElement('div');
        alerta.className = `alerta ${tipo}`;

        const titulo = tipo === 'exito' ? 'Éxito' : 
                      tipo === 'error' ? 'Error' : 
                      tipo === 'advertencia' ? 'Advertencia' : 'Información';

        alerta.innerHTML = `
            <div class="alerta-icono">${obtenerIcono(tipo)}</div>
            <div class="alerta-contenido">
                <div class="alerta-titulo">${titulo}</div>
                <div class="alerta-mensaje">${mensaje}</div>
            </div>
            <button class="alerta-cerrar" aria-label="Cerrar">
                <i class="fas fa-times"></i>
            </button>
        `;

        const botonCerrar = alerta.querySelector('.alerta-cerrar');
        const cerrar = () => {
            alerta.classList.add('saliendo');
            setTimeout(() => {
                if (alerta.parentNode) {
                    alerta.parentNode.removeChild(alerta);
                }
            }, 300);
        };

        botonCerrar.addEventListener('click', cerrar);

        if (duracion > 0) {
            setTimeout(cerrar, duracion);
        }

        contenedor.appendChild(alerta);

        setTimeout(() => {
            alerta.style.opacity = '1';
        }, 10);

        return alerta;
    }

    window.mostrarAlerta = mostrarAlerta;
    window.mostrarAlertaExito = (mensaje, duracion) => mostrarAlerta(mensaje, 'exito', duracion);
    window.mostrarAlertaError = (mensaje, duracion) => mostrarAlerta(mensaje, 'error', duracion);
    window.mostrarAlertaAdvertencia = (mensaje, duracion) => mostrarAlerta(mensaje, 'advertencia', duracion);
    window.mostrarAlertaInfo = (mensaje, duracion) => mostrarAlerta(mensaje, 'info', duracion);
})();
