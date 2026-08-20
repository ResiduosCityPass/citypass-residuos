import { EstadoContenedor, TipoResiduo } from '../../shared/domain/enums';
import { Contenedor } from '../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../contenedores/domain/contenedor.repository';
import { MapaController } from './mapa.controller';

const contenedor = {
  id: 'c-1',
  codigo: 'CT-0421',
  zonaId: 'z-1',
  lat: -34.6118,
  lng: -58.396,
  estado: EstadoContenedor.CRITICO,
  tipoResiduo: TipoResiduo.RECICLABLE,
  nivelLlenadoPct: 87.4,
  ultimaLecturaEn: new Date('2026-09-15T14:32:10.482Z'),
  capacidadLitros: 1100,
  activo: true,
} as Contenedor;

describe('MapaController (CU-07)', () => {
  let contenedores: jest.Mocked<ContenedorRepository>;
  let controller: MapaController;

  beforeEach(() => {
    contenedores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorCodigo: jest.fn(),
      listar: jest.fn().mockResolvedValue([contenedor]),
      contar: jest.fn(),
    };
    controller = new MapaController(contenedores);
  });

  it('devuelve solo los campos necesarios para pintar un marcador', async () => {
    const [marcador] = await controller.contenedoresParaMapa({});

    expect(marcador).toEqual({
      id: 'c-1',
      codigo: 'CT-0421',
      lat: -34.6118,
      lng: -58.396,
      estado: EstadoContenedor.CRITICO,
      tipoResiduo: TipoResiduo.RECICLABLE,
      nivelLlenadoPct: 87.4,
      ultimaLecturaEn: contenedor.ultimaLecturaEn,
    });
  });

  it('no filtra capacidad ni otros datos internos al frontend', async () => {
    const [marcador] = await controller.contenedoresParaMapa({});

    expect(marcador).not.toHaveProperty('capacidadLitros');
    expect(marcador).not.toHaveProperty('zonaId');
  });

  it('nunca devuelve contenedores dados de baja', async () => {
    await controller.contenedoresParaMapa({});

    expect(contenedores.listar).toHaveBeenCalledWith(
      expect.objectContaining({ soloActivos: true }),
    );
  });

  it('propaga los filtros de zona, tipo y estado', async () => {
    await controller.contenedoresParaMapa({ zonaId: 'z-9', estado: EstadoContenedor.CRITICO });

    expect(contenedores.listar).toHaveBeenCalledWith(
      expect.objectContaining({ zonaId: 'z-9', estado: EstadoContenedor.CRITICO }),
    );
  });
});
