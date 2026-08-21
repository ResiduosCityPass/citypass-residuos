import { describe, it, expect } from 'vitest';
import { fieldErrors, generalMessage } from './errors.js';
import { ApiError } from '../api/client.js';

const validation = (...lines) =>
  new ApiError({ code: 'HTTP_400', status: 400, message: lines.join('. '), details: lines });

describe('fieldErrors', () => {
  it('parte cada linea en campo y mensaje', () => {
    const error = validation('zonaId must be a UUID', 'capacidadLitros must not be less than 1');

    expect(fieldErrors(error)).toEqual({
      zonaId: 'must be a UUID',
      capacidadLitros: 'must not be less than 1',
    });
  });

  it('se queda con la primera validacion de un campo que falla varias', () => {
    // Arreglada esa, el backend devuelve la siguiente si todavia hay problema.
    const error = validation('lat must be a number', 'lat must be a latitude');

    expect(fieldErrors(error).lat).toBe('must be a number');
  });

  it('devuelve vacio si el error no es de validacion', () => {
    const conflict = new ApiError({ code: 'ZONA_NOMBRE_DUPLICADO', status: 409, message: 'Ya existe' });

    expect(fieldErrors(conflict)).toEqual({});
    expect(fieldErrors(null)).toEqual({});
  });
});

describe('generalMessage', () => {
  it('ante un 401 dice el comando exacto para generar el token', () => {
    const error = new ApiError({ code: 'HTTP_401', status: 401, message: 'Unauthorized' });

    // No hay login todavia: mandar a alguien a buscar el comando a la
    // documentacion, cuando es la unica forma de entrar, es cruel.
    expect(generalMessage(error)).toMatch(/npm run token:dev/);
  });

  it('no repite los errores de validacion arriba del formulario', () => {
    // Ya se muestran campo por campo; repetirlos duplica ruido sin informacion.
    expect(generalMessage(validation('nombre must be longer'))).toBeNull();
  });

  it('para el resto muestra el mensaje del backend tal cual', () => {
    const error = new ApiError({
      code: 'ZONA_CON_CONTENEDORES',
      status: 409,
      message: 'La zona "Centro" todavia tiene 7 contenedores asignados',
    });

    // El mensaje dice cuantos quedan, y eso es lo accionable.
    expect(generalMessage(error)).toContain('7 contenedores');
  });

  it('el 403 suma que roles se aceptan', () => {
    const error = new ApiError({ code: 'HTTP_403', status: 403, message: 'Se requiere ADMINISTRADOR' });

    expect(generalMessage(error)).toContain('ADMINISTRADOR');
  });
});
