import { registrarRuta, iniciarRouter } from './router.js';
import vistaConexion from './views/conexion.js';
import vistaExtension from './views/extension.js';

registrarRuta('conexion', vistaConexion, { porDefecto: true });
registrarRuta('extension', vistaExtension);

// Futuras vistas:
// import vistaTablas from './views/tablas.js';
// registrarRuta('tablas', vistaTablas);

iniciarRouter();
