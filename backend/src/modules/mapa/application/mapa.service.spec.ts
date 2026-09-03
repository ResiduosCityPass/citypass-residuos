import {
  EstadoAlerta,
  EstadoContenedor,
  TipoAlerta,
  TipoResiduo,
} from '../../../shared/domain/enums';
import { AlertasService } from '../../alertas/application/alertas.service';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { Zona } from '../../zonas/domain/zona.entity';
import { MapaService } from './mapa.service';

const ZONA = { id: 'z-1', nombre: 'Centro', umbralCriticoPct: 70 } as Zona;

const contenedorDe = (parcial: Partial<Contenedor> = {}): Contenedor =>
  ({
    id: 'c-1',
    codigo: 'CT-0421',
    zonaId: 'z-1',
    zona: ZONA,
    lat: -34.6118,
    lng: -58.396,
    estado: EstadoContenedor.CRITICO,
    tipoResiduo: TipoResiduo.RECICLABLE,
    nivelLlenadoPct: 87.4,
    ultimaLecturaEn: new Date('2026-09-02T14:32:10.482Z'),
    capacidadLitros: 1100,
    activo: true,
    ...parcial,
  }) as Contenedor;

describe('MapaService (CU-07)', () => {
  let contenedores: jest.Mocked<ContenedorRepository>;
  let alertas: jest.Mocked<Pick<AlertasService, 'listar'>>;
  let service: MapaService;

  beforeEach(() => {
    contenedores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorCodigo: jest.fn(),
      listar: jest.fn(),
      listarConZona: jest.fn().mockResolvedValue([contenedorDe()]),
      contar: jest.fn(),
    };
    alertas = { listar: jest.fn().mockResolvedValue([]) };

    service = new MapaService(contenedores, alertas as unknown as AlertasService);
  });

  it('devuelve solo los campos necesarios para pintar un marcador', async () => {
    const [marcador] = await service.marcadores({});

    expect(marcador).toEqual({
      id: 'c-1',
      codigo: 'CT-0421',
      lat: -34.6118,
      lng: -58.396,
      estado: EstadoContenedor.CRITICO,
      tipoResiduo: TipoResiduo.RECICLABLE,
      nivelLlenadoPct: 87.4,
      ultimaLecturaEn: new Date('2026-09-02T14:32:10.482Z'),
      zonaNombre: 'Centro',
      umbralCriticoPct: 70,
      incendioActivo: false,
    });
  });

  it('no filtra capacidad ni otros datos internos al frontend', async () => {
    const [marcador] = await service.marcadores({});

    expect(marcador).not.toHaveProperty('capacidadLitros');
    expect(marcador).not.toHaveProperty('zona');
  });

  it('nunca devuelve contenedores dados de baja', async () => {
    await service.marcadores({});

    expect(contenedores.listarConZona).toHaveBeenCalledWith(
      expect.objectContaining({ soloActivos: true }),
    );
  });

  it('propaga los filtros de zona, tipo y estado', async () => {
    await service.marcadores({ zonaId: 'z-9', estado: EstadoContenedor.CRITICO });

    expect(contenedores.listarConZona).toHaveBeenCalledWith(
      expect.objectContaining({ zonaId: 'z-9', estado: EstadoContenedor.CRITICO }),
    );
  });

  describe('umbral de la zona', () => {
    it('incluye nombre y umbral, para poder dibujar la marca de referencia', async () => {
      const [marcador] = await service.marcadores({});

      // "94% sobre un umbral de 70" se entiende; "94%" solo, no.
      expect(marcador.zonaNombre).toBe('Centro');
      expect(marcador.umbralCriticoPct).toBe(70);
    });

    it('tolera que la zona no venga cargada', async () => {
      contenedores.listarConZona.mockResolvedValue([contenedorDe({ zona: undefined })]);

      const [marcador] = await service.marcadores({});

      expect(marcador.zonaNombre).toBeNull();
      expect(marcador.umbralCriticoPct).toBeNull();
    });
  });

  describe('incendio activo', () => {
    it('marca el contenedor que tiene un incendio abierto', async () => {
      alertas.listar.mockResolvedValue([{ contenedorId: 'c-1' }] as never);

      const [marcador] = await service.marcadores({});

      expect(marcador.incendioActivo).toBe(true);
    });

    it('pide solo los incendios abiertos, no todas las alertas', async () => {
      await service.marcadores({});

      expect(alertas.listar).toHaveBeenCalledWith({
        tipo: TipoAlerta.INCENDIO,
        estado: EstadoAlerta.ABIERTA,
      });
    });

    it('un contenedor verde puede tener un incendio activo', async () => {
      // El estado refleja el llenado; el incendio se evalua contra la
      // temperatura. Son dos cosas distintas y el mapa tiene que poder
      // mostrarlas a la vez.
      contenedores.listarConZona.mockResolvedValue([
        contenedorDe({ estado: EstadoContenedor.NORMAL, nivelLlenadoPct: 8 }),
      ]);
      alertas.listar.mockResolvedValue([{ contenedorId: 'c-1' }] as never);

      const [marcador] = await service.marcadores({});

      expect(marcador.estado).toBe(EstadoContenedor.NORMAL);
      expect(marcador.incendioActivo).toBe(true);
    });

    it('resuelve el mapa entero en dos consultas, sin importar cuantos contenedores haya', async () => {
      contenedores.listarConZona.mockResolvedValue([
        contenedorDe({ id: 'c-1' }),
        contenedorDe({ id: 'c-2' }),
        contenedorDe({ id: 'c-3' }),
      ]);

      await service.marcadores({});

      expect(contenedores.listarConZona).toHaveBeenCalledTimes(1);
      expect(alertas.listar).toHaveBeenCalledTimes(1);
    });
  });
});
