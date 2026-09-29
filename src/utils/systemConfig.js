/**
 * Aero-Matrix System Connection Configuration
 */
export const SYSTEM_CONFIG = {
  twinUrl: import.meta.env.VITE_SYSTEM_URL || 'http://localhost:5174',
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
};

/**
 * Lightweight check to see if the Digital Twin UI (5174) or ML API (8000) are responsive.
 * Safe against CORS and network errors.
 */
export async function checkSystemStatus() {
  const result = {
    twinOnline: false,
    apiOnline: false,
    modelLoaded: false,
  };

  // Check Twin UI
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    await fetch(SYSTEM_CONFIG.twinUrl, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    result.twinOnline = true;
  } catch {
    result.twinOnline = false;
  }

  // Check Python ML Backend
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${SYSTEM_CONFIG.apiUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      result.apiOnline = true;
      result.modelLoaded = Boolean(data.model_loaded);
    }
  } catch {
    result.apiOnline = false;
  }

  return result;
}
