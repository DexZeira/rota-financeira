import { parseCsv } from './csv-import';
import { parseOfx } from './ofx-import';
import { previewImport } from './import-session';
import type { Data } from '../../model';
import type { CsvOptions, Source } from './types';
const worker = globalThis as unknown as {
  onmessage:
    | ((
        e: MessageEvent<{
          text: string;
          source: Source;
          options: CsvOptions;
          data: Data;
        }>,
      ) => void)
    | null;
  postMessage: (message: unknown) => void;
};
worker.onmessage = ({ data }) => {
  try {
    const lines =
      data.source === 'csv'
        ? parseCsv(data.text, data.options)
        : parseOfx(data.text, data.options.account);
    worker.postMessage({ rows: previewImport(data.data, lines) });
  } catch (e) {
    worker.postMessage({
      error:
        e instanceof Error ? e.message : 'Não foi possível analisar o arquivo.',
    });
  }
};
