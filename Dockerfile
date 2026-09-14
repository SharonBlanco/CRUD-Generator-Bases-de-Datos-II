FROM postgres:16

# Copia los archivos de la extensión crud_generator al directorio de
# extensiones de Postgres. Se hace aquí (durante el build, como root)
# porque en tiempo de ejecución el proceso de Postgres corre como un
# usuario sin permiso de escritura en esa carpeta.
COPY extension/ /extension-custom/
RUN cp /extension-custom/crud_generator* /usr/share/postgresql/16/extension/
