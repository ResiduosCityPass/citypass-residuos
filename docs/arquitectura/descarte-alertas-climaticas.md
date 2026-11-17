# Descartar alertas climáticas y reducir el scroll

Una alerta pendiente que se usó en un ensayo o no requiere actuación puede archivarse desde **Alertas → Descartar**. El diálogo exige un motivo de 10 a 300 caracteres y una confirmación explícita. No se descartan alertas automáticamente al vencer su fecha estimada ni al recibir el cierre.

## Comportamiento

- Se admite descartar una alerta con inicio, con inicio y finalización, o con solo la finalización. También se admiten identificadores textuales del contrato de Espacios Públicos, como `texto`.
- Se conserva la fila y sus mensajes originales. Se guardan `decision=DESCARTADA`, motivo, identidad de la sesión autenticada y fecha de revisión. Las reentregas y un inicio tardío conservan esa decisión.
- La alerta deja de contar como pendiente y pasa a **Alertas climáticas revisadas**. Allí pueden consultarse el motivo y la auditoría.
- Solo ADMINISTRADOR y OPERADOR pueden revisar. El descarte no admite zonas y no genera una contingencia ni mensajes de outbox.
- Una alerta ya revisada o asociada a una suspensión no puede descartarse. Las suspensiones activas o pendientes de recuperación deben seguir su flujo operativo; no se levantan restricciones mediante este botón.
- Cancelar no guarda nada. Si la API devuelve un error, el diálogo conserva el motivo y permite reintentar.

## API y persistencia

`PATCH /api/v1/contingencias/clima/{alertaId}/resolver`

```json
{ "accion": "DESCARTAR", "motivo": "Ensayo concluido, se conserva para auditoría" }
```

Se reutiliza el endpoint transaccional y el lock existente, de modo que dos decisiones concurrentes no se pisan. El motivo se recorta antes de validar; espacios solos no son un motivo válido. Un ID inexistente devuelve 404; una decisión ya tomada o con suspensión devuelve 409. La columna de decisión ya es varchar(25), por lo que el estado nuevo no requiere migración. No hay variables nuevas ni cambios en contratos de EDA.

## Vista compacta

En Alertas, cada tarjeta muestra fenómeno, estado, barrios/ID y el botón de descarte. Los puntos, las fechas, la selección de zonas y el fundamento operativo se despliegan desde **Ver detalle y revisión**. La lista muestra hasta cinco alertas por página. Cambiar de página o actualizar conserva una revisión manual en curso. Si se descarta la última alerta de una página, se muestra una página existente.

**Ir a las alertas de contenedores** permite saltar directamente a los filtros y alertas de los demás casos de uso. El historial empieza plegado.

## Verificación

- Unitarios: descarte auditado, cierre huérfano, ID textual, reentregas e inicio tardío, protección de suspensiones y rechazo de zonas.
- Integrales con PostgreSQL: persistencia del motivo y actor, validación, permisos, conservación del estado ante reentregas y ausencia de efectos operativos/outbox.
- Frontend: motivo obligatorio, cancelación, errores con reintento, paso al historial, actualización del contador, detalle plegado y paginación conservando la selección manual.

Este cambio agrega la herramienta de revisión; no ejecuta una limpieza masiva de los datos existentes de Render.
