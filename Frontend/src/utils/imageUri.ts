const API_BASE_URL = 'http://api.puppydoc.ovh:8080';
const ASSET_BASE_URL = API_BASE_URL;

export const resolveImageUri = (value?: string | null) => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${API_BASE_URL}${trimmed}`;
  }

  const normalized = trimmed.replace(/^\/+/, '');
  return `${ASSET_BASE_URL}/${normalized}`;
};

