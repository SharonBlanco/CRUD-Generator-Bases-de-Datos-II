-- Se ejecuta automáticamente al crear el contenedor por primera vez
-- (docker-entrypoint-initdb.d), instalando la extensión crud_generator
-- en la base de datos por defecto (crud_test).
CREATE EXTENSION IF NOT EXISTS crud_generator;
