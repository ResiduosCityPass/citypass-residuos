/**
 * Tabla con sus tres estados: cargando, vacia y con datos.
 *
 * Estan juntos a proposito. Cuando cada pantalla resuelve el "no hay nada" por
 * su cuenta, una muestra un texto gris, otra no muestra nada y la tercera deja
 * la cabecera flotando sola.
 */
export default function Table({ columns, rows, loading, emptyText, rowKey, onRowClick }) {
  const body = () => {
    if (loading) {
      return [0, 1, 2, 3].map((i) => (
        <tr key={`skeleton-${i}`} className="skeleton-row">
          {columns.map((column) => (
            <td key={column.key}><span className="skeleton" /></td>
          ))}
        </tr>
      ));
    }

    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length} className="table-empty">{emptyText}</td>
        </tr>
      );
    }

    return rows.map((row) => (
      <tr
        key={rowKey(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={onRowClick ? 'row-clickable' : undefined}
      >
        {columns.map((column) => (
          <td key={column.key} style={column.width ? { width: column.width } : undefined}>
            {column.render(row)}
          </td>
        ))}
      </tr>
    ));
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>{body()}</tbody>
      </table>
    </div>
  );
}
