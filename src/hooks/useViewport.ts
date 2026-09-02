import { useEffect, useState } from 'react';
import type { ViewportSize } from '../utils/layout';

function readViewport(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useViewport(): ViewportSize {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  return viewport;
}

