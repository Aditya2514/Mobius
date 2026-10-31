import React from 'react';
import { DataGrid } from '@mui/x-data-grid';

export default function DataTable({
  columns,
  query,
  params,
  setParams,
  onRowClick,
  ...rest
}) {
  const sortField = params.sort?.replace(/^-/, '');

  return (
    <DataGrid
      rows={query.data?.data ?? []}
      columns={columns}
      rowCount={query.data?.total ?? 0}
      loading={query.isFetching}
      paginationMode="server"
      sortingMode="server"
      paginationModel={{ page: (params.page ?? 1) - 1, pageSize: params.pageSize ?? 25 }}
      onPaginationModelChange={(m) => setParams({ page: m.page + 1, pageSize: m.pageSize })}
      sortModel={
        sortField
          ? [{ field: sortField, sort: params.sort.startsWith('-') ? 'desc' : 'asc' }]
          : []
      }
      onSortModelChange={(m) =>
        setParams({
          sort: m[0] ? `${m[0].sort === 'desc' ? '-' : ''}${m[0].field}` : undefined,
        })
      }
      pageSizeOptions={[25, 50, 100]}
      disableColumnFilter
      disableRowSelectionOnClick
      onRowClick={onRowClick ? (p) => onRowClick(p.row) : undefined}
      autoHeight
      sx={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 2,
        '& .MuiDataGrid-row:hover': {
          cursor: onRowClick ? 'pointer' : 'default',
        },
        ...rest.sx,
      }}
      {...rest}
    />
  );
}

