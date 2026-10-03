import { apiVerificarExtension, apiInstalarExtension, apiActualizarExtension } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';

/**
 * Verificación de la extensión. El backend le pregunta todo al servidor y
 * responde uno de estos estados:
 *   instalada | no_instalada | no_disponible | sin_acceso | error
 * Además devuelve "pasos": la lista de revisiones hechas, que se muestra
 * como lista de chequeo.
 */
const html = `
<div class="contenedor">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Extensión crud_generator</h1>
    <p class="subtitulo">Verificación de la extensión en el servidor</p>

    <div class="resultado" id="resultado"></div>
    <ul class="lista-chequeo" id="pasos"></ul>

    <button class="btn-conectar" id="btnInstalar" style="display:none;">Instalar extensión</button>
    <button class="btn-conectar" id="btnActualizar" style="display:none;">Actualizar extensión</button>
    <button class="btn-conectar" id="btnContinuar" style="display:none;">Continuar</button>
    <button class="btn-recargar boton-ancho" id="btnReintentar" style="display:none;">⟳ Verificar de nuevo</button>
</div>
`;

const TITULOS = {
    instalada: '✓ Extensión instalada y disponible',
    no_instalada: '✗ Extensión no instalada',
    no_disponible: '✗ Extensión no disponible en el servidor',
    sin_acceso: '⚠ Extensión instalada, pero no disponible para este usuario',
    error: '✗ Error al consultar la extensión'
};

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function montar(contenedor) {
    const resultado = crearResultado(contenedor);
    const listaPasos = contenedor.querySelector('#pasos');
    const btnInstalar = contenedor.querySelector('#btnInstalar');
    const btnActualizar = contenedor.querySelector('#btnActualizar');
    const btnContinuar = contenedor.querySelector('#btnContinuar');
    const btnReintentar = contenedor.querySelector('#btnReintentar');

    function ocultarBotones() {
        [btnInstalar, btnActualizar, btnContinuar, btnReintentar]
            .forEach((b) => { b.style.display = 'none'; });
    }

    function mostrarEstado(json) {
        const estado = json.estado || (json.exito ? (json.instalada ? 'instalada' : 'no_instalada') : 'error');
        let detalle = json.mensaje || '';

        if (estado === 'instalada') {
            detalle = `Versión ${json.version}.`;
            if (json.actualizacion_disponible) {
                detalle += ` Hay una versión más nueva en el servidor (${json.version_disponible}).`;
            }
        }

        resultado.mostrar(`${TITULOS[estado]}. ${detalle}`, estado === 'instalada');

        listaPasos.innerHTML = (json.pasos || []).map((p) =>
            `<li class="${p.ok ? 'paso-ok' : 'paso-falla'}">${p.ok ? '✓' : '✗'} ${escapar(p.texto)}</li>`
        ).join('');

        ocultarBotones();
        if (estado === 'instalada') {
            btnContinuar.style.display = '';
            // Siempre visible: en Docker los parches nuevos de la carpeta
            // extension/ todavía no están en el servidor hasta que este botón
            // los copie, así que el servidor aún no "sabe" que hay versión nueva.
            btnActualizar.style.display = '';
            btnActualizar.textContent = json.actualizacion_disponible
                ? `Actualizar a la versión ${json.version_disponible}`
                : 'Actualizar extensión';
        } else if (estado === 'no_instalada') {
            if (json.puede_instalar) btnInstalar.style.display = '';
            btnReintentar.style.display = '';
        } else {
            // no_disponible, sin_acceso, error: no se puede seguir desde aquí.
            btnReintentar.style.display = '';
            if (estado === 'error' && json.instalada) btnActualizar.style.display = '';
        }
    }

    async function verificar() {
        ocultarBotones();
        listaPasos.innerHTML = '';
        resultado.mostrar('Verificando extensión...', true);

        try {
            mostrarEstado(await apiVerificarExtension());
        } catch {
            resultado.mostrar(
                '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
                false
            );
            btnReintentar.style.display = '';
        }
    }

    async function accion(boton, textoEspera, llamada) {
        const textoOriginal = boton.textContent;
        boton.disabled = true;
        boton.textContent = textoEspera;
        try {
            const json = await llamada();
            if (json.exito) {
                await verificar();
            } else {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
            }
        } catch {
            resultado.mostrar(
                '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
                false
            );
        } finally {
            boton.disabled = false;
            boton.textContent = textoOriginal;
        }
    }

    btnInstalar.addEventListener('click', () => accion(btnInstalar, 'Instalando...', apiInstalarExtension));
    btnActualizar.addEventListener('click', () => accion(btnActualizar, 'Actualizando...', apiActualizarExtension));
    btnReintentar.addEventListener('click', verificar);

    btnContinuar.addEventListener('click', () => {
        navegar('esquemas');
    });

    contenedor.querySelector('#btnCambiarConexion').addEventListener('click', () => {
        navegar('conexion');
    });

    verificar();
}

export default { html, montar };
