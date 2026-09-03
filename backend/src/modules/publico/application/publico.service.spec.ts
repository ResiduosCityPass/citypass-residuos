import { TipoResiduo } from '../../../shared/domain/enums';
import {
  ContenedorCercano,
  ContenedorCercanoRepository,
} from '../domain/contenedor-cercano.repository';
import { PublicoService } from './publico.service';
import { RADIO_DEFAULT_METROS } from './dto/buscar-cercanos.dto';

const OBELISCO = { lat: -34.6037, lng: -58.3816 };

const cercano = (parcial: Partial<ContenedorCercano> = {}): ContenedorCercano => ({
  id: 'c-1',
  codigo: 'CT-0421',
  lat: -34.6041,
  lng: -58.3822,
  tipoResiduo: TipoResiduo.RECICLABLE,
  distanciaMetros: 73,
  ...parcial,
});

describe('PublicoService (CU-11)', () => {
  let repo: jest.Mocked<ContenedorCercanoRepository>;
  let service: PublicoService;

  beforeEach(() => {
    repo = { buscarCercanos: jest.fn().mockResolvedValue([cercano()]) };
    service = new PublicoService(repo);
  });

  describe('lo que expone', () => {
    it('devuelve exactamente los seis campos del contrato publico', async () => {
      const [contenedor] = await service.buscarCercanos(OBELISCO);

      expect(contenedor).toEqual({
        id: 'c-1',
        codigo: 'CT-0421',
        lat: -34.6041,
        lng: -58.3822,
        tipoResiduo: TipoResiduo.RECICLABLE,
        distanciaMetros: 73,
      });
    });

    it('respeta el orden por distancia que devuelve la consulta', async () => {
      repo.buscarCercanos.mockResolvedValue([
        cercano({ id: 'c-1', distanciaMetros: 73 }),
        cercano({ id: 'c-2', distanciaMetros: 210 }),
        cercano({ id: 'c-3', distanciaMetros: 890 }),
      ]);

      const resultado = await service.buscarCercanos(OBELISCO);

      expect(resultado.map((c) => c.distanciaMetros)).toEqual([73, 210, 890]);
    });

    it('devuelve lista vacia si no hay nada en el radio, no un error', async () => {
      repo.buscarCercanos.mockResolvedValue([]);

      await expect(service.buscarCercanos(OBELISCO)).resolves.toEqual([]);
    });
  });

  describe('lo que NO expone', () => {
    it('no filtra informacion operativa aunque el repositorio la devuelva', async () => {
      // Este es el test que sostiene todo el caso de uso. La proyeccion del
      // servicio es campo por campo y nunca un spread: el dia que alguien
      // agregue una columna al contenedor o al SELECT, no puede colarse sola a
      // la vista anonima.
      repo.buscarCercanos.mockResolvedValue([
        {
          ...cercano(),
          estado: 'CRITICO',
          nivelLlenadoPct: 94.14,
          temperaturaC: 88.5,
          capacidadLitros: 1100,
          zonaId: 'z-1',
          activo: true,
        } as ContenedorCercano,
      ]);

      const [contenedor] = await service.buscarCercanos(OBELISCO);

      expect(contenedor).not.toHaveProperty('estado');
      expect(contenedor).not.toHaveProperty('nivelLlenadoPct');
      expect(contenedor).not.toHaveProperty('temperaturaC');
      expect(contenedor).not.toHaveProperty('capacidadLitros');
      expect(contenedor).not.toHaveProperty('zonaId');
      expect(contenedor).not.toHaveProperty('activo');
      expect(Object.keys(contenedor)).toHaveLength(6);
    });
  });

  describe('radio de busqueda', () => {
    it('aplica el radio por defecto cuando no se envia', async () => {
      await service.buscarCercanos(OBELISCO);

      expect(repo.buscarCercanos).toHaveBeenCalledWith(
        expect.objectContaining({ radioMetros: RADIO_DEFAULT_METROS }),
      );
    });

    it('respeta el radio pedido', async () => {
      await service.buscarCercanos({ ...OBELISCO, radioMetros: 300 });

      expect(repo.buscarCercanos).toHaveBeenCalledWith(
        expect.objectContaining({ radioMetros: 300 }),
      );
    });
  });

  describe('filtros', () => {
    it('propaga el punto de busqueda tal cual', async () => {
      await service.buscarCercanos(OBELISCO);

      expect(repo.buscarCercanos).toHaveBeenCalledWith(
        expect.objectContaining({ lat: -34.6037, lng: -58.3816 }),
      );
    });

    it('propaga el tipo de residuo cuando se filtra', async () => {
      // "Tengo pilas usadas, donde las tiro" es el caso de uso literal.
      await service.buscarCercanos({ ...OBELISCO, tipoResiduo: TipoResiduo.RECICLABLE });

      expect(repo.buscarCercanos).toHaveBeenCalledWith(
        expect.objectContaining({ tipoResiduo: TipoResiduo.RECICLABLE }),
      );
    });

    it('no inventa un tipo de residuo si no se filtro', async () => {
      await service.buscarCercanos(OBELISCO);

      expect(repo.buscarCercanos).toHaveBeenCalledWith(
        expect.objectContaining({ tipoResiduo: undefined }),
      );
    });
  });
});
