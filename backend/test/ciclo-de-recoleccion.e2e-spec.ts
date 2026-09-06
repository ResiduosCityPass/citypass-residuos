import * as request from 'supertest';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoRuta,
  Rol,
  TipoResiduo,
} from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * El ciclo completo del modulo, contra PostgreSQL real.
 *
 * Sensor reporta -> contenedor critico -> alerta -> ruta -> asignacion ->
 * confirmacion del chofer -> contenedor en verde, alerta cerrada y camion libre.
 *
 * Es la demo del modulo escrita como test: si esto pasa, el modulo hace lo que
 * dice que hace.
 */
describe('Ciclo de recoleccion (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  const DEPOSITO = { lat: -34.6037, lng: -58.3816 };

  /**
   * `sub` con el que firma el helper de tokens para el rol CHOFER. Es lo que
   * une la sesion con el chofer: sin un chofer que lo tenga en `usuarioSub`,
   * `GET /rutas/mias` no devuelve nada.
   */
  const SESION_CHOFER = 'test-CHOFER';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Da de alta un chofer y devuelve su id, que es lo que espera CU-09. */
  const crearChofer = async (usuarioSub?: string) => {
    const respuesta = await http
      .post('/api/v1/choferes')
      .set(auth(admin))
      .send({
        nombre: 'Juana Perez',
        legajo: `CH-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`,
        ...(usuarioSub ? { usuarioSub } : {}),
      })
      .expect(201);

    return respuesta.body.id as string;
  };

  /** Crea zona, contenedores saturados y un camion listo para salir. */
  const prepararEscenario = async (cantidadContenedores = 2) => {
    const zona = await http
      .post('/api/v1/zonas')
      .set(auth(admin))
      .send({ nombre: `Centro ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedores = [];

    for (let i = 0; i < cantidadContenedores; i++) {
      const contenedor = await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.body.id,
          tipoResiduo: TipoResiduo.RECICLABLE,
          capacidadLitros: 1100,
          lat: DEPOSITO.lat - 0.002 * (i + 1),
          lng: DEPOSITO.lng,
        })
        .expect(201);

      const sensor = await http
        .post(`/api/v1/contenedores/${contenedor.body.id}/sensor`)
        .set(auth(admin))
        .send({})
        .expect(201);

      // Una lectura que lo cruza al umbral: queda CRITICO con su alerta abierta.
      await http
        .post('/api/v1/lecturas')
        .set('X-Sensor-Key', sensor.body.apiKey)
        .send({ nivelLlenadoPct: 88, temperaturaC: 21, bateriaPct: 90 })
        .expect(202);

      contenedores.push(contenedor.body);
    }

    const camion = await http
      .post('/api/v1/camiones')
      .set(auth(admin))
      .send({
        patente: `AB${Date.now().toString().slice(-5)}`,
        capacidadLitros: 12_000,
        tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
      })
      .expect(201);

    const choferId = await crearChofer(SESION_CHOFER);

    return { zona: zona.body, contenedores, camion: camion.body, choferId };
  };

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token(Rol.ADMINISTRADOR);
  });

  afterAll(async () => {
    await ctx.cerrar();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  it('recorre el ciclo entero: de contenedor saturado a contenedor vaciado', async () => {
    const { contenedores, camion, choferId } = await prepararEscenario(2);

    // --- CU-08 · el operador pide una propuesta -----------------------------
    const propuesta = await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(201);

    expect(propuesta.body.estado).toBe(EstadoRuta.PROPUESTA);
    expect(propuesta.body.paradas).toHaveLength(2);
    expect(propuesta.body.paradas.map((p: { orden: number }) => p.orden)).toEqual([1, 2]);
    expect(propuesta.body.litrosEstimados).toBe(Math.round(1100 * 0.88 * 2));

    // El camion todavia esta libre: es una propuesta, no un compromiso.
    const flotaAntes = await http.get('/api/v1/camiones').set(auth(admin)).expect(200);
    expect(flotaAntes.body[0].estado).toBe(EstadoCamion.DISPONIBLE);

    // --- CU-09 · una persona la confirma ------------------------------------
    const asignada = await http
      .patch(`/api/v1/rutas/${propuesta.body.id}/asignar`)
      .set(auth(admin))
      .send({ choferId })
      .expect(200);

    expect(asignada.body.estado).toBe(EstadoRuta.ASIGNADA);

    const flotaDespues = await http.get('/api/v1/camiones').set(auth(admin)).expect(200);
    expect(flotaDespues.body[0].estado).toBe(EstadoCamion.EN_RUTA);

    // --- CU-10 · el chofer ve su ruta ---------------------------------------
    const chofer = ctx.token(Rol.CHOFER);
    const miRuta = await http.get('/api/v1/rutas/mias').set(auth(chofer)).expect(200);

    expect(miRuta.body.id).toBe(propuesta.body.id);
    expect(miRuta.body.paradas).toHaveLength(2);

    // --- CU-10 · confirma la primera parada ---------------------------------
    const primera = miRuta.body.paradas[0];
    const contenedorDeLaPrimera = contenedores.find(
      (c: { id: string }) => c.id === primera.contenedorId,
    )!;

    const confirmacion = await http
      .patch(`/api/v1/paradas/${primera.id}/confirmar`)
      .set(auth(chofer))
      .send({ lat: contenedorDeLaPrimera.lat, lng: contenedorDeLaPrimera.lng })
      .expect(200);

    expect(confirmacion.body).toMatchObject({
      estadoContenedor: EstadoContenedor.NORMAL,
      nivelLlenadoPct: 0,
      alertasCerradas: 1,
      rutaEstado: EstadoRuta.EN_CURSO,
      distanciaMetros: 0,
    });

    // La alerta de saturacion de ese contenedor quedo cerrada.
    const alertas = await http
      .get(`/api/v1/alertas?contenedorId=${contenedorDeLaPrimera.id}&estado=ABIERTA`)
      .set(auth(admin))
      .expect(200);
    expect(alertas.body).toHaveLength(0);

    // --- CU-10 · confirma la ultima y se cierra todo -------------------------
    const segunda = miRuta.body.paradas[1];
    const contenedorDeLaSegunda = contenedores.find(
      (c: { id: string }) => c.id === segunda.contenedorId,
    )!;

    const cierre = await http
      .patch(`/api/v1/paradas/${segunda.id}/confirmar`)
      .set(auth(chofer))
      .send({ lat: contenedorDeLaSegunda.lat, lng: contenedorDeLaSegunda.lng })
      .expect(200);

    expect(cierre.body.rutaEstado).toBe(EstadoRuta.COMPLETADA);

    // El camion vuelve a estar disponible: sin esto quedaria EN_RUTA para
    // siempre, y CU-03 no deja sacarlo de ese estado a mano.
    const flotaFinal = await http.get('/api/v1/camiones').set(auth(admin)).expect(200);
    expect(flotaFinal.body[0].estado).toBe(EstadoCamion.DISPONIBLE);

    // Y el chofer ya no tiene ruta activa.
    const sinRuta = await http.get('/api/v1/rutas/mias').set(auth(chofer)).expect(200);
    expect(sinRuta.body).toEqual({});

    // El mapa muestra los dos contenedores en verde.
    const mapa = await http.get('/api/v1/mapa/contenedores').set(auth(admin)).expect(200);
    expect(mapa.body.every((c: { estado: string }) => c.estado === EstadoContenedor.NORMAL)).toBe(
      true,
    );
  });

  describe('CU-08 · reglas de la propuesta', () => {
    it('no vuelve a rutear un contenedor ya comprometido en otra ruta', async () => {
      const { camion } = await prepararEscenario(2);

      await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);

      const otroCamion = await http
        .post('/api/v1/camiones')
        .set(auth(admin))
        .send({
          patente: `XY${Date.now().toString().slice(-5)}`,
          capacidadLitros: 12_000,
          tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
        })
        .expect(201);

      const segunda = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: otroCamion.body.id })
        .expect(409);

      expect(segunda.body.code).toBe('RUTA_SIN_CONTENEDORES');
    });

    it('no rutea contenedores de una zona bloqueada', async () => {
      const { zona, camion } = await prepararEscenario(1);

      await http
        .patch(`/api/v1/zonas/${zona.id}/bloqueo?bloqueada=true`)
        .set(auth(admin))
        .expect(200);

      const respuesta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(409);

      expect(respuesta.body.code).toBe('RUTA_SIN_CONTENEDORES');
    });

    it('no ofrece un camion que ya esta en ruta', async () => {
      const { camion, choferId } = await prepararEscenario(1);

      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);
      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(200);

      const respuesta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(409);

      expect(respuesta.body.code).toBe('CAMION_NO_DISPONIBLE');
    });
  });

  describe('CU-09 · el chofer se elige de una lista, no se escribe', () => {
    it('asignar a un chofer que no existe falla, en vez de asignar en silencio', async () => {
      // Este es el caso que motivo todo el ABM. Antes `choferId` era texto
      // libre: un identificador mal tipeado asignaba la ruta con exito y el
      // chofer no la veia nunca. La pantalla quedaba vacia y sin error, y
      // parecia que la ruta no se habia generado.
      const { camion } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);

      const respuesta = await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);

      expect(respuesta.body.code).toBe('CHOFER_NO_ENCONTRADO');
    });

    it('no acepta cualquier texto como chofer', async () => {
      const { camion } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);

      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId: 'jperez' })
        .expect(400);
    });

    it('no se le asigna una ruta a un chofer dado de baja', async () => {
      const { camion, choferId } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);

      await http.delete(`/api/v1/choferes/${choferId}`).set(auth(admin)).expect(204);

      const respuesta = await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(409);

      expect(respuesta.body.code).toBe('CHOFER_INACTIVO');
    });

    it('la ruta trae el chofer expandido: la pantalla muestra su nombre', async () => {
      const { camion, choferId } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);

      const asignada = await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(200);

      expect(asignada.body.chofer).toMatchObject({ id: choferId, nombre: 'Juana Perez' });

      // Y tambien en el listado, que es donde el operador lo lee.
      const listado = await http.get('/api/v1/rutas').set(auth(admin)).expect(200);
      expect(listado.body[0].chofer.nombre).toBe('Juana Perez');
    });

    it('la baja es logica: el chofer sigue existiendo con sus rutas', async () => {
      const { choferId } = await prepararEscenario(1);

      await http.delete(`/api/v1/choferes/${choferId}`).set(auth(admin)).expect(204);

      const activos = await http.get('/api/v1/choferes').set(auth(admin)).expect(200);
      expect(activos.body.find((c: { id: string }) => c.id === choferId)).toBeUndefined();

      const todos = await http
        .get('/api/v1/choferes?incluirInactivos=true')
        .set(auth(admin))
        .expect(200);
      expect(todos.body.find((c: { id: string }) => c.id === choferId)).toMatchObject({
        activo: false,
      });
    });

    it('el legajo no se repite', async () => {
      await http
        .post('/api/v1/choferes')
        .set(auth(admin))
        .send({ nombre: 'Juana Perez', legajo: 'CH-REPETIDO' })
        .expect(201);

      const respuesta = await http
        .post('/api/v1/choferes')
        .set(auth(admin))
        .send({ nombre: 'Otro Distinto', legajo: 'CH-REPETIDO' })
        .expect(409);

      expect(respuesta.body.code).toBe('CHOFER_LEGAJO_DUPLICADO');
    });

    it('dar de baja al chofer le revoca el acceso en el acto', async () => {
      // Sin login no hay sesion que cerrar ni contrasena que cambiar: la baja es
      // el unico mecanismo de revocacion que existe. Si un chofer dado de baja
      // siguiera viendo su ruta y confirmando paradas, no habria forma de
      // sacarle el acceso a nadie.
      const { camion, choferId } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);
      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(200);

      const chofer = ctx.token(Rol.CHOFER);

      // Antes de la baja ve su ruta.
      const antes = await http.get('/api/v1/rutas/mias').set(auth(chofer)).expect(200);
      expect(antes.body.id).toBe(ruta.body.id);
      const paradaId = antes.body.paradas[0].id;
      const contenedor = antes.body.paradas[0].contenedor;

      await http.delete(`/api/v1/choferes/${choferId}`).set(auth(admin)).expect(204);

      // Despues no ve nada, y no puede cerrar la parada que tenia abierta.
      const despues = await http.get('/api/v1/rutas/mias').set(auth(chofer)).expect(200);
      expect(despues.body).toEqual({});

      const intento = await http
        .patch(`/api/v1/paradas/${paradaId}/confirmar`)
        .set(auth(chofer))
        .send({ lat: contenedor.lat, lng: contenedor.lng })
        .expect(403);

      expect(intento.body.code).toBe('PARADA_DE_OTRA_RUTA');
    });

    it('una sesion que no es de ningun chofer no ve ninguna ruta', async () => {
      const { camion, choferId } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);
      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(200);

      // Rol CHOFER valido, pero su `sub` no corresponde a ningun chofer dado de
      // alta. Devuelve vacio, no un error: distinguir "no sos chofer" de "no
      // tenes ruta" solo le diria a quien pregunta si ese `sub` existe.
      const respuesta = await http
        .get('/api/v1/rutas/mias')
        .set(auth(ctx.token(Rol.CHOFER, 'sesion-sin-chofer')))
        .expect(200);

      expect(respuesta.body).toEqual({});
    });
  });

  describe('CU-10 · omitir una parada', () => {
    /** Deja una ruta asignada y devuelve sus paradas ya ordenadas. */
    const rutaAsignada = async (cantidadContenedores = 2) => {
      const escenario = await prepararEscenario(cantidadContenedores);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: escenario.camion.id })
        .expect(201);
      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId: escenario.choferId })
        .expect(200);

      const chofer = ctx.token(Rol.CHOFER);
      const miRuta = await http.get('/api/v1/rutas/mias').set(auth(chofer)).expect(200);

      return { ...escenario, chofer, ruta: miRuta.body, paradas: miRuta.body.paradas };
    };

    it('deja el contenedor como estaba: lleno, critico y con su alerta abierta', async () => {
      // Es toda la diferencia con confirmar. Si omitir vaciara el contenedor,
      // el operador veria en verde justo el que nadie pudo recolectar.
      const { chofer, paradas, contenedores } = await rutaAsignada(2);
      const objetivo = contenedores.find((c: { id: string }) => c.id === paradas[0].contenedorId)!;

      const respuesta = await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(chofer))
        .send({ motivo: 'Auto mal estacionado tapando el contenedor' })
        .expect(200);

      expect(respuesta.body).toMatchObject({
        estado: 'OMITIDA',
        motivo: 'Auto mal estacionado tapando el contenedor',
        estadoContenedor: EstadoContenedor.CRITICO,
        nivelLlenadoPct: 88,
        rutaEstado: EstadoRuta.EN_CURSO,
      });

      const alertas = await http
        .get(`/api/v1/alertas?contenedorId=${objetivo.id}&estado=ABIERTA`)
        .set(auth(admin))
        .expect(200);
      expect(alertas.body).toHaveLength(1);
    });

    it('no exige estar cerca del contenedor', async () => {
      // El caso tipico es justamente no poder acercarse.
      const { chofer, paradas } = await rutaAsignada(1);

      await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(chofer))
        .send({ motivo: 'Calle cortada por obra' })
        .expect(200);
    });

    it('exige un motivo: una parada omitida sin explicacion no le sirve a nadie', async () => {
      const { chofer, paradas } = await rutaAsignada(1);

      await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(chofer))
        .send({})
        .expect(400);
    });

    it('omitir la ultima parada cierra la ruta y libera el camion', async () => {
      // Sin esto, una calle cortada dejaba la ruta trabada en EN_CURSO para
      // siempre y el camion tomado sin forma de recuperarlo.
      const { chofer, paradas } = await rutaAsignada(1);

      const respuesta = await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(chofer))
        .send({ motivo: 'Calle cortada por obra' })
        .expect(200);

      expect(respuesta.body.rutaEstado).toBe(EstadoRuta.COMPLETADA);

      const flota = await http.get('/api/v1/camiones').set(auth(admin)).expect(200);
      expect(flota.body[0].estado).toBe(EstadoCamion.DISPONIBLE);
    });

    it('una parada omitida es final: no se confirma despues', async () => {
      const { chofer, paradas, contenedores } = await rutaAsignada(2);
      const objetivo = contenedores.find((c: { id: string }) => c.id === paradas[0].contenedorId)!;

      await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(chofer))
        .send({ motivo: 'Calle cortada por obra' })
        .expect(200);

      const respuesta = await http
        .patch(`/api/v1/paradas/${paradas[0].id}/confirmar`)
        .set(auth(chofer))
        .send({ lat: objetivo.lat, lng: objetivo.lng })
        .expect(409);

      expect(respuesta.body.code).toBe('PARADA_YA_OMITIDA');
    });

    it('un chofer no puede omitir la parada de otro', async () => {
      const { paradas } = await rutaAsignada(1);

      // Un chofer de verdad, dado de alta, pero que no es el de esta ruta.
      await crearChofer('test-OTRO-CHOFER');
      const otroChofer = ctx.token(Rol.CHOFER, 'test-OTRO-CHOFER');

      const respuesta = await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(otroChofer))
        .send({ motivo: 'Calle cortada por obra' })
        .expect(403);

      expect(respuesta.body.code).toBe('PARADA_DE_OTRA_RUTA');
    });

    it('el listado de rutas trae el avance sin traer las paradas', async () => {
      const { chofer, paradas } = await rutaAsignada(2);

      await http
        .patch(`/api/v1/paradas/${paradas[0].id}/omitir`)
        .set(auth(chofer))
        .send({ motivo: 'Calle cortada por obra' })
        .expect(200);

      const listado = await http.get('/api/v1/rutas').set(auth(admin)).expect(200);

      expect(listado.body[0].avance).toEqual({
        total: 2,
        confirmadas: 0,
        omitidas: 1,
        pendientes: 1,
      });
      // El avance es un contador, no la ruta entera repetida por fila.
      expect(listado.body[0].paradas).toBeUndefined();
    });
  });

  describe('CU-01 · fuera de servicio y sensor en el listado', () => {
    it('un contenedor fuera de servicio no entra en la ruta', async () => {
      const { contenedores, camion } = await prepararEscenario(2);

      await http
        .patch(`/api/v1/contenedores/${contenedores[0].id}/servicio?fuera=true`)
        .set(auth(admin))
        .expect(200);

      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);

      expect(ruta.body.paradas).toHaveLength(1);
      expect(ruta.body.paradas[0].contenedorId).toBe(contenedores[1].id);
    });

    it('al reintegrarlo vuelve CRITICO si su ultimo nivel seguia sobre el umbral', async () => {
      // Devolverlo a NORMAL a ciegas lo dejaria verde en el mapa al 88% y fuera
      // del ruteo, que solo toma criticos.
      const { contenedores } = await prepararEscenario(1);

      await http
        .patch(`/api/v1/contenedores/${contenedores[0].id}/servicio?fuera=true`)
        .set(auth(admin))
        .expect(200);

      const reintegrado = await http
        .patch(`/api/v1/contenedores/${contenedores[0].id}/servicio?fuera=false`)
        .set(auth(admin))
        .expect(200);

      expect(reintegrado.body.estado).toBe(EstadoContenedor.CRITICO);
      expect(reintegrado.body.nivelLlenadoPct).toBe(88);
    });

    it('el listado de contenedores dice cuales ya tienen sensor', async () => {
      const { zona } = await prepararEscenario(1);

      await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.id,
          tipoResiduo: TipoResiduo.RECICLABLE,
          capacidadLitros: 1100,
          lat: DEPOSITO.lat,
          lng: DEPOSITO.lng,
        })
        .expect(201);

      const listado = await http.get('/api/v1/contenedores').set(auth(admin)).expect(200);

      const conSensor = listado.body.filter((c: { sensor: unknown }) => c.sensor);
      const sinSensor = listado.body.filter((c: { sensor: unknown }) => !c.sensor);

      expect(conSensor).toHaveLength(1);
      expect(sinSensor).toHaveLength(1);
      expect(conSensor[0].sensor.codigo).toMatch(/^SN-/);
      // La credencial del sensor no viaja nunca: se guarda hasheada y la columna
      // esta declarada `select: false`.
      expect(conSensor[0].sensor.apiKeyHash).toBeUndefined();
    });
  });

  describe('CU-10 · quien confirma y desde donde', () => {
    it('rechaza confirmar desde lejos y dice a cuantos metros esta', async () => {
      const { camion, choferId } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);
      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(200);

      const chofer = ctx.token(Rol.CHOFER);
      const miRuta = await http.get('/api/v1/rutas/mias').set(auth(chofer)).expect(200);

      const respuesta = await http
        .patch(`/api/v1/paradas/${miRuta.body.paradas[0].id}/confirmar`)
        .set(auth(chofer))
        .send({ lat: -34.9, lng: -58.9 })
        .expect(403);

      expect(respuesta.body.code).toBe('PARADA_FUERA_DE_RADIO');
      expect(respuesta.body.message).toMatch(/\d+ m del contenedor/);
    });

    it('un operador no puede confirmar paradas', async () => {
      const { camion, choferId } = await prepararEscenario(1);
      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201);
      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId })
        .expect(200);

      const detalle = await http.get(`/api/v1/rutas/${ruta.body.id}`).set(auth(admin)).expect(200);

      await http
        .patch(`/api/v1/paradas/${detalle.body.paradas[0].id}/confirmar`)
        .set(auth(ctx.token(Rol.OPERADOR)))
        .send({ lat: -34.6, lng: -58.38 })
        .expect(403);
    });
  });
});
