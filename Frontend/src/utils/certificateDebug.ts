export function logCertificateDebug(event: string, details?: Record<string, number | boolean>) {
  if (__DEV__) {
    console.info('[certificate-debug] ' + event, details ?? {});
  }
}
