import { ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { CodigoChoferService } from './codigo-chofer.service';
import {
  generarCodigoChofer,
  subDeCodigoChofer,
  vencimientoCodigoChofer,
} from './credencial-chofer';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwksService } from './jwks.service';
import { RolesGuard } from './roles.guard';
import { Rol } from '../domain/enums';

describe('Código corto de chofer', () => {
  const config = new ConfigService({ AUTH_MODE: 'federated' });
  const findOne = jest.fn();
  const db = { getRepository: () => ({ findOne }) } as unknown as DataSource;
  const service = new CodigoChoferService(db, config);
  beforeEach(() => {
    findOne.mockReset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('resuelve una identidad interna solo desde el hash de un chofer activo', async () => {
    const code = generarCodigoChofer();
    findOne.mockResolvedValue({ legajo: 'CH-014' });
    const claims = await service.verificar(code);
    expect(findOne).toHaveBeenCalledWith({
      where: { usuarioSub: subDeCodigoChofer(code), activo: true },
    });
    expect(claims).toMatchObject({
      sub: subDeCodigoChofer(code),
      token_use: 'chofer-interno',
      groups: ['chofer'],
      iss: 'citypass-residuos-choferes',
      aud: ['citypass-residuos-api'],
    });
    expect(claims.exp - claims.iat).toBe(30 * 24 * 60 * 60);
  });

  it.each(['CH-incompleto', 'token.falso', generarCodigoChofer(Date.now() - 31 * 86400000)])(
    'rechaza formatos incompletos o vencidos sin consultar la base: %s',
    async (code) => {
      await expect(service.verificar(code)).rejects.toThrow();
      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it('no tolera ni un segundo después del vencimiento', async () => {
    const code = generarCodigoChofer();
    jest.spyOn(Date, 'now').mockReturnValue(vencimientoCodigoChofer(code)! * 1000);
    await expect(service.verificar(code)).rejects.toThrow('vencido');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rechaza códigos revocados, dados de baja, desconocidos o con la fecha alterada', async () => {
    findOne.mockResolvedValue(null);
    const code = generarCodigoChofer();
    await expect(service.verificar(code)).rejects.toThrow('revocado');
    const altered =
      code.slice(0, code.lastIndexOf('-') + 1) +
      (vencimientoCodigoChofer(code)! + 86400).toString(36);
    expect(subDeCodigoChofer(altered)).not.toBe(subDeCodigoChofer(code));
    await expect(service.verificar(altered)).rejects.toThrow('revocado');
  });

  it.each(['local', 'federated'])(
    'el guard acepta el código como CHOFER en %s sin elevar permisos',
    async (mode) => {
      const code = generarCodigoChofer();
      findOne.mockResolvedValue({ legajo: 'CH-014' });
      const req = { headers: { authorization: `Bearer ${code}` } } as Request;
      const context = {
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;
      const guard = new JwtAuthGuard(
        new Reflector(),
        new JwtService(),
        new ConfigService({ AUTH_MODE: mode }),
        {} as JwksService,
        service,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(req.usuario?.rol).toBe(Rol.CHOFER);
      const reflect = {
        getAllAndOverride: () => [Rol.ADMINISTRADOR, Rol.OPERADOR],
      } as unknown as Reflector;
      expect(() => new RolesGuard(reflect).canActivate(context)).toThrow('requiere');
    },
  );

  it('el guard responde 401 sin revelar el código si no hay verificador o fue revocado', async () => {
    const code = generarCodigoChofer();
    const req = { headers: { authorization: `Bearer ${code}` } } as Request;
    const context = {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    for (const verifier of [undefined, service]) {
      findOne.mockResolvedValue(null);
      const guard = new JwtAuthGuard(
        new Reflector(),
        new JwtService(),
        config,
        {} as JwksService,
        verifier,
      );
      await expect(guard.canActivate(context)).rejects.toThrow('Token invalido');
    }
    expect(JSON.stringify((Logger.prototype.warn as jest.Mock).mock.calls)).not.toContain(code);
  });
});
