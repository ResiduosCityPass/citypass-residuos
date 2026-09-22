import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Shell from './Shell.jsx';

vi.mock('../../api/waste.js', () => ({ USING_MOCKS: false }));

// Sin token de desarrollo, que es como corre el build publicado en Render: el
// boton "Token" tiene que estar.
vi.mock('../../api/client.js', () => ({
  usingDevToken: () => false,
  readToken: () => '',
  saveToken: () => true,
  clearToken: () => {},
}));

/**
 * jsdom no implementa matchMedia. Este doble deja disparar a mano el cambio de
 * ancho que en el navegador llega al agrandar la ventana.
 */
function fakeMatchMedia() {
  const listeners = new Set();
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }));
  return {
    widen: () => act(() => listeners.forEach((listener) => listener({ matches: true }))),
    listenerCount: () => listeners.size,
  };
}

/** Los botones atras y adelante del navegador: no pasan por el menu. */
function BackButton() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>Atras del navegador</button>
      <button type="button" onClick={() => navigate(1)}>Adelante del navegador</button>
    </>
  );
}

const renderShell = (initialEntries = ['/mapa']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="*"
          element={
            <Shell title="Contenedores" subtitle="Alta, edición, baja y vinculación de sensores" openAlerts={3}>
              <BackButton />
            </Shell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const menuButton = () => screen.getByRole('button', { name: /(Abrir|Cerrar) menu$/ });
const sidebar = () => screen.getByRole('navigation', { name: 'Modulos de CityPass+' });

describe('menu lateral y barra superior', () => {
  let media;

  beforeEach(() => {
    media = fakeMatchMedia();
  });

  afterEach(() => {
    document.body.classList.remove('no-scroll');
  });

  /**
   * Los codigos de caso de uso son vocabulario de la catedra, no del operador
   * municipal que usa la pantalla. No tienen que aparecer en ningun lado.
   */
  it('no muestra codigos de caso de uso', () => {
    const { container } = renderShell();

    expect(container.textContent).not.toMatch(/CU-?\d/);
    expect(container.textContent).not.toMatch(/caso de uso/i);
  });

  it('lista las secciones del modulo y las dos vistas de otros actores', () => {
    renderShell();

    const links = within(sidebar()).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toEqual([
      '/mapa', '/contenedores', '/zonas', '/alertas', '/flota', '/choferes', '/rutas',
      '/cerca', '/chofer',
    ]);
  });

  it('marca la seccion activa segun la ruta', () => {
    renderShell(['/flota']);

    expect(within(sidebar()).getByRole('link', { name: 'Flota' })).toHaveClass('active');
    expect(within(sidebar()).getByRole('link', { name: 'Mapa en vivo' })).not.toHaveClass('active');
  });

  it('muestra el globo de alertas en el menu y en la barra', () => {
    renderShell();

    expect(within(sidebar()).getByRole('link', { name: /Alertas/ })).toHaveTextContent('3');
    expect(screen.getByTitle('3 alertas sin resolver')).toBeInTheDocument();
  });

  it('muestra el titulo y el subtitulo de la pantalla', () => {
    renderShell();

    expect(screen.getByRole('heading', { name: 'Contenedores' })).toBeInTheDocument();
    expect(screen.getByText('Alta, edición, baja y vinculación de sensores')).toBeInTheDocument();
  });

  it('arranca con el cajon cerrado', () => {
    renderShell();

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar()).not.toHaveClass('open');
    expect(document.body).not.toHaveClass('no-scroll');
  });

  it('la hamburguesa abre el cajon, mete el foco adentro y bloquea el scroll de atras', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());

    expect(sidebar()).toHaveClass('open');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(menuButton()).toHaveAccessibleName('Cerrar menu');
    expect(screen.getByRole('button', { name: 'Cerrar el menu' })).toHaveFocus();
    expect(document.body).toHaveClass('no-scroll');
  });

  it('la misma hamburguesa lo vuelve a cerrar', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());
    await user.click(menuButton());

    expect(sidebar()).not.toHaveClass('open');
    expect(document.body).not.toHaveClass('no-scroll');
  });

  it('la X del cajon lo cierra y devuelve el foco a la hamburguesa', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());
    await user.click(screen.getByRole('button', { name: 'Cerrar el menu' }));

    expect(sidebar()).not.toHaveClass('open');
    expect(menuButton()).toHaveFocus();
  });

  it('Escape lo cierra y devuelve el foco a la hamburguesa', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());
    await user.keyboard('{Escape}');

    expect(sidebar()).not.toHaveClass('open');
    expect(menuButton()).toHaveFocus();
  });

  it('Escape con el cajon cerrado no hace nada', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.keyboard('{Escape}');

    expect(sidebar()).not.toHaveClass('open');
  });

  it('tocar el fondo oscuro lo cierra', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(menuButton());
    await user.click(container.querySelector('.sidebar-backdrop'));

    expect(sidebar()).not.toHaveClass('open');
    expect(container.querySelector('.sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('elegir una seccion navega y cierra el cajon', async () => {
    const user = userEvent.setup();
    renderShell(['/mapa']);

    await user.click(menuButton());
    await user.click(within(sidebar()).getByRole('link', { name: 'Zonas y umbrales' }));

    expect(within(sidebar()).getByRole('link', { name: 'Zonas y umbrales' })).toHaveClass('active');
    expect(sidebar()).not.toHaveClass('open');
    expect(document.body).not.toHaveClass('no-scroll');
  });

  /**
   * El boton atras del navegador cambia la pantalla sin pasar por los enlaces
   * del menu. Antes el cajon quedaba abierto tapando la pantalla nueva.
   */
  it('volver atras sin usar el menu tambien lo cierra', async () => {
    const user = userEvent.setup();
    renderShell(['/mapa', '/contenedores']);

    await user.click(menuButton());
    await user.click(screen.getByRole('button', { name: 'Atras del navegador' }));

    expect(within(sidebar()).getByRole('link', { name: 'Mapa en vivo' })).toHaveClass('active');
    expect(sidebar()).not.toHaveClass('open');
  });

  /**
   * Volver hacia adelante a la pantalla donde se habia abierto no lo reabre.
   * Lo encontro Fran en la revision: el estado seguia anotando esa pantalla y
   * al volver a ella el cajon aparecia abierto, con el body sin scroll.
   */
  it('atras y despues adelante no lo vuelve a abrir', async () => {
    const user = userEvent.setup();
    renderShell(['/mapa', '/contenedores']);

    await user.click(menuButton());
    await user.click(screen.getByRole('button', { name: 'Atras del navegador' }));
    await user.click(screen.getByRole('button', { name: 'Adelante del navegador' }));

    expect(within(sidebar()).getByRole('link', { name: 'Contenedores' })).toHaveClass('active');
    expect(sidebar()).not.toHaveClass('open');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(document.body).not.toHaveClass('no-scroll');
  });

  /**
   * Agrandar la ventana con el cajon abierto lo hace desaparecer por CSS, pero
   * el estado seguia en abierto y el body quedaba sin scroll en escritorio.
   */
  it('agrandar la ventana con el cajon abierto lo cierra y devuelve el scroll', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuButton());
    expect(media.listenerCount()).toBe(1);

    media.widen();

    expect(sidebar()).not.toHaveClass('open');
    expect(document.body).not.toHaveClass('no-scroll');
    expect(media.listenerCount()).toBe(0);
  });

  it('los modulos de otros squads estan deshabilitados', () => {
    renderShell();

    const mobility = screen.getByTitle(/Movilidad lo desarrolla el Squad 3/);
    expect(mobility).toHaveAttribute('aria-disabled', 'true');
    expect(within(sidebar()).queryByRole('link', { name: /Movilidad/ })).not.toBeInTheDocument();
  });

  it('el boton Token muestra y esconde el campo para pegarlo', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole('button', { name: 'Usar token' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Token' }));
    expect(screen.getByRole('button', { name: 'Usar token' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ocultar token' }));
    expect(screen.queryByRole('button', { name: 'Usar token' })).not.toBeInTheDocument();
  });

  it('sin datos de demostracion no muestra el cartel', () => {
    renderShell();

    expect(screen.queryByText('Datos de demostracion')).not.toBeInTheDocument();
  });
});
