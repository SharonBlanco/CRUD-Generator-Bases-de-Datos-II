# CRUD Generator — Bases de Datos II

Generador automático de procedimientos CRUD para PostgreSQL.

## Estructura

```
Proyecto/
├── backend/                  # API Flask (también sirve el frontend)
│   ├── app.py                # Rutas
│   ├── db.py                 # Conexión a PostgreSQL
│   ├── extension.py          # Verificar / instalar / actualizar la extensión
│   ├── esquemas.py           # Listar esquemas, tablas y columnas
│   ├── generador.py          # Generar procedimientos CRUD (pendiente)
│   └── privilegios.py        # GRANT/REVOKE (pendiente)
├── frontend/                 # Interfaz web (SPA sin framework)
│   ├── index.html            # Shell: solo <div id="app">
│   ├── css/estilos.css
│   └── js/
│       ├── main.js           # Registra las vistas y arranca el router
│       ├── router.js         # Router por hash (#conexion, #extension, #tablas)
│       ├── state.js          # Estado compartido entre vistas
│       ├── api.js            # Llamadas al backend
│       ├── components/       # Piezas reutilizables
│       └── views/            # Una pantalla por archivo
├── extension/                # Extensión PostgreSQL
│   ├── crud_generator.control
│   ├── crud_generator--1.0.sql
│   └── crud_generator--X--Y.sql   # Parches de versión
├── Dockerfile                # Imagen de Postgres con la extensión incluida
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## Requisitos

- Python 3.12+
- Docker + Docker Compose

## Instalación

```bash
python3 -m venv venv
source venv/bin/activate      # en Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Ejecución

**1. Levantar PostgreSQL** (el `--build` es necesario: la imagen incluye la extensión):

```bash
docker compose up -d --build
```

**2. Levantar la aplicación** (el backend sirve también el frontend):

```bash
python3 backend/app.py
```

**3. Abrir** `http://localhost:5000` en el navegador y conectar con:

| Campo          | Valor        |
|----------------|--------------|
| Servidor       | `localhost`  |
| Puerto         | `5434`       |
| Base de datos  | `crud_test`  |
| Usuario        | `postgres`   |
| Contraseña     | `postgres`   |

> El puerto es **5434**, no 5432: así lo mapea `docker-compose.yml` para no chocar con un Postgres instalado localmente.

## Actualizar la extensión a una versión nueva

1. Subir `default_version` en `extension/crud_generator.control` (ej. a `'1.2'`).
2. Crear el parche `extension/crud_generator--1.1--1.2.sql` (nombre exacto:
   `crud_generator--VERSION_ANTERIOR--VERSION_NUEVA.sql`) con **solo** los
   cambios nuevos, sin repetir lo de la versión anterior.
3. En la app, pantalla "Extensión crud_generator" → botón **Actualizar extensión**.
   El backend copia el archivo dentro del contenedor y aplica
   `ALTER EXTENSION ... UPDATE` automáticamente.
