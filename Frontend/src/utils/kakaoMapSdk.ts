export const KAKAO_MAP_SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=e65e93f752b1590bf9b8be83566dd5b6&autoload=false';

// Keep the WebView allowlist broad enough for the callback to reject URLs locally.
// react-native-webview opens non-allowlisted URLs through the OS instead.
export const allowInlineMapNavigation = ({ url }: { url: string }) => url === 'about:blank';
