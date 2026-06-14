const ALLOWED_IMAGE_URI_PATTERN = /^(https?|file|content):\/\//i;

export const resolveImageUri = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (
    lowered === 'null' ||
    lowered === 'undefined' ||
    lowered === 'none' ||
    lowered === 'n/a'
  ) {
    return null;
  }

  if (!ALLOWED_IMAGE_URI_PATTERN.test(trimmed)) {
    return null;
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] || '';
  const pathOnly = withoutQuery.replace(/^[a-z][a-z0-9+\-.]*:\/\/[^/]+/i, '');
  if (!pathOnly || pathOnly === '/') {
    return null;
  }

  return trimmed;
};
