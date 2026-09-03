import { aplicarCambios } from './aplicar-cambios';

describe('aplicarCambios', () => {
  it('copia los valores presentes', () => {
    const entidad = { a: 1, b: 2 };

    aplicarCambios(entidad, { b: 9 });

    expect(entidad).toEqual({ a: 1, b: 9 });
  });

  it('ignora las claves con valor undefined', () => {
    // Es todo el punto: Object.assign las copiaria y borraria el valor real.
    const entidad = { estado: 'EN_RUTA', capacidad: 12000 };

    aplicarCambios(entidad, { estado: undefined, capacidad: 15000 });

    expect(entidad.estado).toBe('EN_RUTA');
    expect(entidad.capacidad).toBe(15000);
  });

  it('si copia un null explicito, que es un valor', () => {
    const entidad: { resueltaEn: Date | null } = { resueltaEn: new Date() };

    aplicarCambios(entidad, { resueltaEn: null });

    expect(entidad.resueltaEn).toBeNull();
  });

  it('deja la entidad intacta si no hay cambios', () => {
    const entidad = { a: 1 };

    aplicarCambios(entidad, {});

    expect(entidad).toEqual({ a: 1 });
  });

  it('devuelve la misma instancia, no una copia', () => {
    const entidad = { a: 1 };

    expect(aplicarCambios(entidad, { a: 2 })).toBe(entidad);
  });

  it('reproduce el caso que lo motivo: un PATCH parcial sobre un camion', () => {
    // El DTO llega con `estado: undefined` porque la propiedad esta declarada
    // en la clase, aunque el body solo traiga la capacidad.
    const camion = { patente: 'AB123CD', capacidadLitros: 12000, estado: 'EN_RUTA' };

    aplicarCambios(camion, { capacidadLitros: 15000, estado: undefined });

    expect(camion.estado).toBe('EN_RUTA');
  });
});
