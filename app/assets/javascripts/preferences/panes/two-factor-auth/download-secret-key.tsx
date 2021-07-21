// Temporary implementation until integration
export function downloadSecretKey(text: string) {
  const link = document.createElement('a');
  const blob = new Blob([text], {
    type: 'text/plain;charset=utf-8',
  });
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', 'secret_key.txt');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(link.href);
}
