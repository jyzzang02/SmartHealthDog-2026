const messagesByCode: Record<string, string> = {
  FORBIDDEN: '권한이 없습니다.',
  INTERNAL_SERVER_ERROR: '서버에서 예기치 않은 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_JWT: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
  RESOURCE_NOT_FOUND: '요청한 정보를 찾을 수 없습니다.',
};

const isReadableMessage = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !/^[?\s]+$/.test(value);

export const getResponseErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  let body = '';

  try {
    body = await response.text();
  } catch {
    return fallback;
  }

  if (!body) {
    return fallback;
  }

  try {
    const data = JSON.parse(body) as {
      code?: unknown;
      descriptions?: unknown;
      error?: unknown;
      message?: unknown;
    };
    const codes = Array.isArray(data.code)
      ? data.code.filter((code): code is string => typeof code === 'string')
      : [];
    const descriptions = Array.isArray(data.descriptions)
      ? data.descriptions.filter(isReadableMessage)
      : [];

    if (descriptions.length > 0) {
      return descriptions.join('\n');
    }

    if (isReadableMessage(data.error)) {
      return data.error;
    }

    if (isReadableMessage(data.message)) {
      return data.message;
    }

    return codes.map((code) => messagesByCode[code]).find(Boolean) ?? fallback;
  } catch {
    return body.trim().startsWith('{') ? fallback : body;
  }
};
