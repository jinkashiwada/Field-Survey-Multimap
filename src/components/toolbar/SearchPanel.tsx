import { useState, type FormEvent } from 'react';
import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { parseCoordinateQuery, searchLocalFeatures, type SearchResult } from '../../services/search';

interface SearchPanelProps {
  open: boolean;
  pinFeatures: () => Feature<Geometry>[];
  gisFeatures: () => Feature<Geometry>[];
  onClose: () => void;
  onGoTo: (result: SearchResult) => void;
}

export function SearchPanel({ open, pinFeatures, gisFeatures, onClose, onGoTo }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const coordinate = parseCoordinateQuery(query);
    setResults(coordinate ? [coordinate] : searchLocalFeatures(query, pinFeatures(), gisFeatures()));
    setSearched(true);
  };

  return (
    <aside className="data-drawer" aria-label="地点検索">
      <header><h2>検索</h2><button type="button" onClick={onClose} aria-label="検索を閉じる">閉じる</button></header>
      <form className="search-form" onSubmit={submit}>
        <label htmlFor="map-search">座標、ピン名、読込み地物名</label>
        <div><input id="map-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="35.6904, 139.8688 または河川名" autoFocus /><button type="submit">検索</button></div>
      </form>
      <p className="drawer-note">座標は「緯度, 経度」と「経度 緯度」に対応します。内蔵河川の全国名称検索と住所検索は、軽量な公式索引を用意できるまで対象外です。読み込んだ河川データは名称属性から検索できます。</p>
      {searched && results.length === 0 && <p role="status">一致する地点がありません。</p>}
      <ul className="search-results">
        {results.map((result, index) => (
          <li key={`${result.source}-${result.longitude}-${result.latitude}-${index}`}>
            <button type="button" onClick={() => onGoTo(result)}>
              <strong>{result.label}</strong>
              <small>{result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}</small>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
