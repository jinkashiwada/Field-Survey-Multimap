export async function copyCurrentUrl(): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}

