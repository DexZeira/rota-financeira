import { type ReactNode } from 'react';
import { type Column } from '../components/common';
import { type Data, type Collection, type Row, num, money, brDate } from '../model';
export type ViewProps = {
  data: Data;
  edit: (kind: Collection | 'settings' | 'bike', r?: Row) => void;
  del: (kind: Collection, r: Row) => void;
  go: (page: string) => void;
  update: (kind: Collection, row: Row) => void;
  saveSettings: (settings: Row) => void;
};
export const value = (label: string, v: ReactNode) => (
  <div className="detail" key={label}>
    <span>{label}</span>
    <strong>{v}</strong>
  </div>
);
export const dateCol: Column = { label: 'Data', render: (r) => brDate(r.date) };
export const amountCol: Column = {
  label: 'Valor',
  render: (r) => money(num(r.amount)),
};
