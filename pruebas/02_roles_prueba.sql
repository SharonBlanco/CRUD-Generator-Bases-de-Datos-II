-- =====================================================================
-- Tres roles con distintos niveles de acceso, para la prueba de
-- privilegios que pide el enunciado.
--
-- Importante: a estos roles NO se les da ningún permiso sobre las
-- tablas. Lo único que van a poder hacer es lo que la aplicación les
-- conceda con GRANT EXECUTE sobre los procedimientos generados.
--
-- Uso (desde la carpeta del proyecto):
--   PowerShell:
--     Get-Content pruebas\02_roles_prueba.sql | docker exec -i crud_generator_db psql -U postgres -d crud_test
--
-- Matriz sugerida para la demo (se marca en la pantalla de privilegios):
--   Rol            Insertar  Consultar  Actualizar  Eliminar
--   vendedor          ✓         ✓          ✗          ✗
--   supervisor        ✓         ✓          ✓          ✗
--   administrador     ✓         ✓          ✓          ✓
-- =====================================================================

DO $$
DECLARE
    v_rol text;
BEGIN
    FOREACH v_rol IN ARRAY ARRAY['vendedor', 'supervisor', 'administrador'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol) THEN
            -- La contraseña es igual al nombre (solo para pruebas).
            EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', v_rol, v_rol);
        END IF;
    END LOOP;
END
$$;

-- Para llamar a un procedimiento de un esquema hace falta USAGE sobre
-- el esquema (no da acceso a las tablas, solo permite "ver" el esquema).
GRANT USAGE ON SCHEMA tienda TO vendedor, supervisor, administrador;
GRANT USAGE ON SCHEMA public TO vendedor, supervisor, administrador;
