# Catálogo común de barrios y sugerencias climáticas

Residuos comparte los 48 códigos, nombres y puntos de referencia de Espacios Públicos. El catálogo se tomó de `weatherLocations.ts` de la rama `featuresDidi`, commit `38c32b5a48d2279daad9943ca5fd28584783daae` del [repositorio productor](https://github.com/DappianoLuciano/DESAPPS2EspaciosPublicos/blob/38c32b5a48d2279daad9943ca5fd28584783daae/espacios-publicos-backend/src/domain/catalogs/weatherLocations.ts).

Su fuente es el [dataset de barrios del GCBA](https://cdn.buenosaires.gob.ar/datosabiertos/datasets/barrios/barrios.geojson), licencia CC-BY-2.5-AR. Las coordenadas son WGS84 y representan puntos derivados de centroides, no los límites ni un área de riesgo. No se incorporan polígonos ni se deduce el barrio de una zona por cercanía o por su nombre.

## Configuración y compatibilidad

- `GET /api/v1/barrios` devuelve `{ id, nombre, localidad, lat, lng }[]`. Usa la misma autenticación y los roles ADMINISTRADOR/OPERADOR de la consulta de zonas. No requiere red hacia Espacios Públicos en tiempo de ejecución.
- `zona.barrioIds` guarda una lista de códigos como `AR-CABA-SAN-NICOLAS`. Una zona puede cubrir varios barrios y varias zonas pueden compartir un barrio.
- La migración agrega una columna JSONB con default `[]`. Conserva IDs, nombres, umbrales, contenedores, rutas, bloqueos y restricciones previas. No crea automáticamente 48 zonas ni asigna barrios a zonas existentes.
- Un administrador vincula barrios desde **Zonas y umbrales → Editar → Barrios vinculados → Guardar cambios**. También se pueden seleccionar al crear una zona. Ejemplo de ensayo: asignar `SAN NICOLAS` a la zona sintética de Centro que se vaya a usar, tras verificarlo como operador.
- POST/PATCH de zonas aceptan `barrioIds` opcional. Se rechazan valores desconocidos, repetidos, null y formatos distintos de una lista. Omitir el campo en PATCH conserva los vínculos; `[]` los quita. Un OPERADOR puede revisar las sugerencias climáticas, pero no editar los vínculos de una zona.

## Revisión de alertas

1. Se conserva el payload de EDA, incluyendo `barrios`, y la decisión queda pendiente como hasta ahora.
2. Alertas cruza los barrios informados con el catálogo y los vínculos de las zonas. Reconoce códigos exactos y nombres con diferencias de mayúsculas, tildes, ñ, espacios y separadores, además de los alias explícitos La Boca, La Paternal y Villa General Mitre. No usa coincidencias aproximadas.
3. Las zonas coincidentes aparecen marcadas. El operador puede sumar o quitar cualquiera, dejar su fundamento y **Confirmar suspensión del servicio**, o registrar sin afectación.
4. Refrescar no pisa una selección editada por el operador ni su fundamento. **Usar zonas sugeridas** vuelve explícitamente a la propuesta actual. Si llegan primero el cierre y después la confirmación, se calculan las sugerencias cuando aparecen los barrios.
5. Sin barrios, con barrios desconocidos, sin vínculos o ante una falla del catálogo se mantiene la revisión manual. Los mensajes aclaran qué falta; un problema del catálogo no bloquea el resto de la revisión ni borra vínculos al editar los umbrales.

Las sugerencias solo afectan los checkboxes de una revisión pendiente. No ejecutan suspensión, no levantan bloqueos ni alteran la recuperación. El backend sigue exigiendo la acción explícita, el motivo y las zonas seleccionadas. La publicación de eventos hacia EDA conserva su contrato.

## Prueba de aceptación

1. Aplicar migraciones en una base de pruebas. Leer zonas existentes y comprobar que `barrioIds=[]` y sus datos previos se conservan.
2. Vincular SAN NICOLAS a una zona y PALERMO a otra; incluir una zona sin vínculo. Refrescar para comprobar persistencia.
3. Recibir una alerta con `barrios: ["San Nicolás"]`. Verificar que solo se propone la primera zona y que no hay suspensión ni publicaciones por recibirla o verla.
4. Cambiar la selección y actualizar la lista: conservar la edición. Volver a las sugerencias, escribir el motivo y confirmar; la suspensión y la recuperación continúan por el flujo existente.
5. Probar un barrio desconocido, un barrio conocido sin zonas vinculadas, una alerta anterior sin `barrios` y una falla/reintento del catálogo. Verificar selección manual en todos esos casos.

Para actualizar el catálogo, acordar la versión con Espacios Públicos y copiar sus IDs y puntos sin regenerarlos. Comparar los 48 registros con la fuente y ejecutar los tests. No cambiar códigos existentes mientras haya zonas que los referencien.
