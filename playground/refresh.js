// Both pages share the existing hourly refresh API; daily ranking data is separate.
export function bindRefresh(button, status, afterRefresh = async () => {}) {
  button.onclick = async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Updating hourly prices for all listings… This may take several minutes.';
    try {
      const response = await fetch('/api/refresh', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({})
      });
      if (response.status === 501 || response.status === 404) throw new Error('Start the refresh server with: uv run --locked python server.py');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Market refresh failed.');
      status.textContent = result.message;
      await afterRefresh();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
