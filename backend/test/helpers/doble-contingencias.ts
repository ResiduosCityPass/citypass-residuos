import { ContingenciasService } from '../../src/modules/contingencias/application/contingencias.service';
import { Ruta } from '../../src/modules/rutas/domain/ruta.entity';
import { Zona } from '../../src/modules/zonas/domain/zona.entity';

/** Doble neutro para los casos de uso previos al modulo de contingencias. */
export const dobleContingencias = () => ({
  bloquearOperacion: jest.fn().mockResolvedValue(undefined),
  restricciones: jest.fn().mockResolvedValue([]),
  pendientesDeRecuperacion: jest.fn().mockResolvedValue([]),
  exigirZonaHabilitada: jest.fn().mockResolvedValue(undefined),
  registrarVaciado: jest.fn().mockResolvedValue(undefined),
  decorarRutas: jest.fn().mockImplementation(async (rutas: Ruta[]) => rutas),
  decorarZonas: jest.fn().mockImplementation(async (zonas: Zona[]) => zonas),
  zonaTieneHistorial: jest.fn().mockResolvedValue(false),
});

export const sinContingencias = () => dobleContingencias() as unknown as ContingenciasService;
