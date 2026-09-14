import { apiVerificarExtension, apiInstalarExtension, apiActualizarExtension } from '../api.js';
import { crearResultado } from '../components/resultado.js';

const html = `
<div class="contenedor">
    <h1 class="titulo">Extensión crud_generator</h1>
    <p class="subtitulo">Verificación de la extensión en la base de datos</p>

    <div class="resultado" id="resultado"></div>

    <button class="btn-conectar" id="btnInstalar" style="display:none;">Instalar extensión</button>
    <button class="btn-conectar" id="btnActualizar" style="display:none;">Actualizar extensión</button>
    <button class="btn-conectar" id="btnContinuar" style="display:none;">Continuar</button>
</div>
`;

function montar(contenedor) {
    const resultado = crearResultado(contenedor);
    const btnInstalar = contenedor.querySelector('#btnInstalar');
    const btnActualizar = contenedor.querySelector('#btnActualizar');
    const btnContinuar = contenedor.querySelector('#btnContinuar');

    async function verificar() {
        btnInstalar.style.display = 'none';
        btnActualizar.style.display = 'none';
        btnContinuar.style.display = 'none';
        resultado.mostrar('Verificando extensión...', true);

        try {
            const json = await apiVerificarExtension();

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            if (json.instalada) {
                resultado.mostrar(`✓ Extensión instalada (versión ${json.version}).`, true);
                btnActualizar.style.display = '';
                btnContinuar.style.display = '';
            } else {
                resultado.mostrar('✗ La extensión crud_generator no está instalada.', false);
                btnInstalar.style.display = '';
            }
        } catch {
            resultado.mostrar(
                '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
                false
            );
        }
    }

    btnInstalar.addEventListener('click', async () => {
        btnInstalar.disabled = true;
        btnInstalar.textContent = 'Instalando...';

        try {
            const json = await apiInstalarExtension();
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
            btnInstalar.disabled = false;
            btnInstalar.textContent = 'Instalar extensión';
        }
    });

    btnActualizar.addEventListener('click', async () => {
        btnActualizar.disabled = true;
        btnActualizar.textContent = 'Actualizando...';

        try {
            const json = await apiActualizarExtension();
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
            btnActualizar.disabled = false;
            btnActualizar.textContent = 'Actualizar extensión';
        }
    });

    btnContinuar.addEventListener('click', () => {
        // Cuando exista la vista de tablas: navegar('tablas');
    });

    verificar();
}

export default { html, montar };
