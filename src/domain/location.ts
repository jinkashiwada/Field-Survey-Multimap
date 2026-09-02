export interface CenterStatus {
  longitude: number;
  latitude: number;
  zoom: number;
  elevation: number | null;
  elevationSource: string | null;
  elevationState: 'loading' | 'available' | 'unavailable';
}

export interface LocationUiState {
  state: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

