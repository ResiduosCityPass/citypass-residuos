import { ConflictException, NotFoundException } from '@nestjs/common';
import { Zona } from '../domain/zona.entity';
import { ZonaRepository } from '../domain/zona.repository';
import { ZonasService } from './zonas.service';

const zonaDe = (parcial: Partial<Zona> = {}): Zona =>
  ({
    id: 'z-1',
    nombre: 'Centro',
    umbralCriticoPct: 70,
    umbralTemperaturaC: 60,
    bloqueada: false,
    ...parcial,
  }) as Zona;

describe('ZonasService', () => {
  let repo: jest.Mocked<ZonaRepository>;
  let service: ZonasService;

  beforeEach(() => {
    repo = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorNombre: jest.fn(),
      listar: jest.fn(),
      contarContenedores: jest.fn(),
      eliminar: jest.fn(),
    };
    service = new ZonasService(repo);
  });

  describe('crear', () => {
    it('crea la zona cuando el nombre esta libre', async () => {
      repo.buscarPorNombre.mockResolvedValue(null);
      repo.crear.mockResolvedValue(zonaDe());

      await service.crear({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 });

      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Centro', bloqueada: false }),
      );
    });

    it('rechaza un nombre de zona duplicado', async () => {
      repo.buscarPorNombre.mockResolvedValue(zonaDe());

      await expect(
        service.crear({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 }),
      ).rejects.toThrow(ConflictException);
      expect(repo.crear).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('devuelve la zona existente', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());

      await expect(service.obtener('z-1')).resolves.toMatchObject({ nombre: 'Centro' });
    });

    it('falla con 404 si la zona no existe', async () => {
      repo.buscarPorId.mockResolvedValue(null);

      await expect(service.obtener('z-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizar', () => {
    it('aplica los cambios sobre la zona existente', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());
      repo.guardar.mockImplementation(async (z) => z);

      const resultado = await service.actualizar('z-1', { umbralCriticoPct: 85 });

      expect(resultado.umbralCriticoPct).toBe(85);
    });

    it('deja renombrar la zona con su propio nombre sin considerarlo duplicado', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());
      repo.guardar.mockImplementation(async (z) => z);

      await expect(service.actualizar('z-1', { nombre: 'Centro' })).resolves.toBeDefined();
      expect(repo.buscarPorNombre).not.toHaveBeenCalled();
    });

    it('rechaza renombrar a un nombre ya usado por otra zona', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());
      repo.buscarPorNombre.mockResolvedValue(zonaDe({ id: 'z-2', nombre: 'Norte' }));

      await expect(service.actualizar('z-1', { nombre: 'Norte' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('eliminar', () => {
    it('elimina la zona cuando no tiene contenedores', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());
      repo.contarContenedores.mockResolvedValue(0);

      await service.eliminar('z-1');

      expect(repo.eliminar).toHaveBeenCalledWith('z-1');
    });

    it('se niega a eliminar una zona con contenedores asociados', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());
      repo.contarContenedores.mockResolvedValue(3);

      await expect(service.eliminar('z-1')).rejects.toThrow(ConflictException);
      expect(repo.eliminar).not.toHaveBeenCalled();
    });
  });

  describe('cambiarBloqueo', () => {
    it('bloquea la zona para excluirla del ruteo', async () => {
      repo.buscarPorId.mockResolvedValue(zonaDe());
      repo.guardar.mockImplementation(async (z) => z);

      const resultado = await service.cambiarBloqueo('z-1', true);

      expect(resultado.bloqueada).toBe(true);
    });
  });
});
