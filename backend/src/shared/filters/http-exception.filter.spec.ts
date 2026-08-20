import { ArgumentsHost, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/paradas/PD-0004/confirmar', method: 'PATCH' }),
      }),
    } as unknown as ArgumentsHost;

    // El filtro loguea los 5xx; silenciamos el logger para no ensuciar la salida de los tests.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('respeta el status de la excepcion HTTP', () => {
    filter.catch(new ConflictException('La parada ya fue confirmada'), host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('devuelve el formato de error unificado', () => {
    filter.catch(new ConflictException('La parada ya fue confirmada'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'La parada ya fue confirmada',
        path: '/api/v1/paradas/PD-0004/confirmar',
      }),
    );
  });

  it('preserva el `code` de negocio cuando la excepcion lo trae', () => {
    filter.catch(
      new ConflictException({
        message: 'La parada ya fue confirmada',
        code: 'PARADA_YA_CONFIRMADA',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PARADA_YA_CONFIRMADA' }));
  });

  it('genera un `code` por defecto a partir del status cuando no viene uno de negocio', () => {
    filter.catch(new ConflictException('sin code'), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'HTTP_409' }));
  });

  it('conserva el array de mensajes que produce el ValidationPipe', () => {
    filter.catch(new BadRequestException(['nivelLlenadoPct debe ser un numero']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['nivelLlenadoPct debe ser un numero'] }),
    );
  });

  it('convierte cualquier excepcion no HTTP en un 500 sin filtrar el detalle interno', () => {
    filter.catch(new Error('connection terminated unexpectedly'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });
});
