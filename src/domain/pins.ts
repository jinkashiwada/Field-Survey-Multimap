export type PinType = 'trace-candidate' | 'needs-review' | 'danger' | 'memo';

export interface PinRecord {
  id: string;
  name: string;
  type: PinType;
  memo: string;
  longitude: number;
  latitude: number;
  elevation: number | null;
  elevationSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export const pinTypeLabels: Record<PinType, string> = {
  'trace-candidate': '痕跡候補',
  'needs-review': '要確認',
  danger: '危険',
  memo: '一般メモ',
};

