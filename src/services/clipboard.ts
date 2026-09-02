export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continue to the selection-based fallback.
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  input.remove();
  return copied;
}

export async function copyCurrentUrl(): Promise<boolean> {
  return copyText(window.location.href);
}
