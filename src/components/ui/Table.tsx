import type { ReactNode } from 'react';

import { cn } from '@/lib/utilities/cn';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** Right-aligned and tabular; use for every numeric readout. */
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  caption?: string;
  /** Shown in place of the body when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

export function Table<Row>({
  columns,
  rows,
  rowKey,
  caption,
  empty = 'No data.',
  className,
}: TableProps<Row>) {
  return (
    // Wide tables scroll inside their own container so the page never does.
    <div
      className={cn(
        'border-line bg-surface-raised w-full overflow-x-auto rounded-lg border',
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-line border-b">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'label-technical px-4 py-2.5 text-left whitespace-nowrap',
                  column.numeric && 'text-right',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-content-muted px-4 py-8 text-center text-sm"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-line hover:bg-surface-sunken border-b last:border-0"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-2.5', column.numeric && 'tabular text-right')}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
