import { Injectable } from '@nestjs/common';
@Injectable()
export class EstadoRecepcionBus {
  private datos = {
    estado: 'DESHABILITADO',
    topicos: [] as string[],
    ultimoError: null as string | null,
    ultimoEventoEn: null as string | null,
    simulacroHabilitado: false,
    simulacrosPendientesRegistro: [] as string[],
  };
  actualizar(datos: Partial<typeof this.datos>) {
    Object.assign(this.datos, datos);
  }
  estado() {
    return {
      ...this.datos,
      topicos: [...this.datos.topicos],
      simulacrosPendientesRegistro: [...this.datos.simulacrosPendientesRegistro],
    };
  }
}
