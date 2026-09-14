# CRUD Generator — Bases de Datos II

Generador automático de procedimientos CRUD para PostgreSQL.

## Estructura

```
crud-generator/
├── backend/                  # API Flask
│   ├── app.py                # Rutas
│   ├── db.py                 # Conexión a PostgreSQL
│   ├── extension.py          # Verificar extensión
│   ├── esquemas.py           # Listar esquemas y tablas
│   ├── generador.py          # Generar procedimientos CRUD
│   └── privilegios.py        # GRANT/REVOKE
├── frontend/                 # Interfaz web
│   ├── index.html
│   ├── css/estilos.css
│   └── js/
│       ├── api.js            # Llamadas al backend
│       ├── ui.js             # Manipulación del DOM
│       └── app.js            # Orquestación
├── extension/                # Extensión PostgreSQL
│   ├── crud_generator.control
│   └── crud_generator--1.0.sql
├── requirements.txt
└── README.md
```

## Instalación

```bash
pip install -r requirements.txt
```

## Ejecución

Backend:
```bash
cd backend
python app.py
```

Frontend:
```bash
cd frontend
python -m http.server 8080
```

Abrir `http://localhost:8080` en el navegador.
