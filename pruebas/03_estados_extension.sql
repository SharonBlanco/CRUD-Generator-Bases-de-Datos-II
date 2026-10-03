-- =====================================================================
-- Prepara bases de datos para mostrar los estados de la extensión
-- en la pantalla "Extensión crud_generator" (útil para el video).
--
-- Uso (desde la carpeta del proyecto):
--   PowerShell:
--     Get-Content pruebas\03_estados_extension.sql | docker exec -i crud_generator_db psql -U postgres -d postgres
--
-- Después, en la pantalla de conexión de la app:
--   Base crud_test,   usuario postgres / postgres -> INSTALADA
--   Base sin_ext,     usuario postgres / postgres -> NO INSTALADA (con botón Instalar)
--   Base restringida, usuario invitado / invitado -> INSTALADA PERO NO DISPONIBLE
--                                                    PARA EL USUARIO
--   Error al consultar: apagar la base mientras se usa la app
--   (docker compose stop) y darle "Verificar de nuevo".
-- =====================================================================

DROP DATABASE IF EXISTS sin_ext WITH (FORCE);   -- FORCE: desconecta a la app si estaba usándola
CREATE DATABASE sin_ext;

DROP DATABASE IF EXISTS restringida WITH (FORCE);
CREATE DATABASE restringida;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'invitado') THEN
        CREATE ROLE invitado LOGIN PASSWORD 'invitado';
    END IF;
END
$$;

\connect restringida

CREATE EXTENSION crud_generator;

-- Quitarle a todos (PUBLIC) el acceso que da PostgreSQL por defecto:
-- la extensión queda instalada, pero "invitado" no la puede usar.
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION crud_generar_codigo(name, name, text) FROM PUBLIC;
