import type { ScreenHandle } from '../../../shared/ui/screen';
import type { SalesSession } from '../sales-session';
import type { SalesShell } from '../shell';

// Tanda tangan layar Sales yang dipanggil index.ts. Layar yang tidak butuh kueri atau shell
// cukup menerima parameter awal.
export type SalesScreen = (
  session: SalesSession,
  go: (path: string) => void,
  query: URLSearchParams,
  shell: SalesShell,
) => ScreenHandle;
