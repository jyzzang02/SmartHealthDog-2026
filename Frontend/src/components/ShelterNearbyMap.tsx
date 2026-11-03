import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import MapRecenterButton from './MapRecenterButton';
import { isShelterCoordinates, NEARBY_SHELTER_RADIUS_KM } from '../hooks/useNearbyShelters';
import type { NearbyShelter, ShelterCoordinates } from '../hooks/useNearbyShelters';

interface Props {
  center: ShelterCoordinates | null;
  shelters: readonly NearbyShelter[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (shelter: NearbyShelter) => void;
}

const ShelterNearbyMap: React.FC<Props> = ({ center, shelters, loading, error, onRetry, onSelect }) => {
  const webViewRef = useRef<WebView>(null);
  const [readyMapId, setReadyMapId] = useState<string | null>(null);
  const [selected, setSelected] = useState<NearbyShelter | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [failedDocumentId, setFailedDocumentId] = useState<string | null>(null);
  const readyDocumentId = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedShelter = selected && shelters.includes(selected) ? selected : null;
  const document = useMemo(() => {
    if (!isShelterCoordinates(center)) return null;
    const documentId = `${reloadKey}:${Date.now()}:${Math.random()}`;
    const positions = shelters.map((shelter, index) => ({ ...shelter.location, index }))
      .filter(isShelterCoordinates);
    return { documentId, html: `<!DOCTYPE html><html><head>
      <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#E9ECEF}</style>
      <script>
        var mapDocumentId = ${JSON.stringify(documentId)};
        function notifyMapError() {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'map-error',documentId:mapDocumentId}));
        }
      </script>
      <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=e65e93f752b1590bf9b8be83566dd5b6&autoload=false" onerror="notifyMapError()"></script>
      </head><body><div id="map"></div><script>
        (function() {
          if (!window.kakao || !kakao.maps) { notifyMapError(); return; }
          try { kakao.maps.load(function() {
            try {
              var center = new kakao.maps.LatLng(${center.lat}, ${center.lng});
              var map = new kakao.maps.Map(document.getElementById('map'), {center:center,level:4});
              var userLocation = new kakao.maps.Circle({map:map,center:center,radius:20,strokeWeight:2,
                strokeColor:'#FFFFFF',fillColor:'#0081D5',fillOpacity:1});

                    window.recenterMap = function(payload) {
                      if (!payload || payload.documentId !== mapDocumentId) return;
                      var point = payload.point;
                      if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number'
                        || !isFinite(point.lat) || !isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return;
                      var position = new kakao.maps.LatLng(point.lat, point.lng);
                      if (userLocation) userLocation.setPosition(position);
                      else userLocation = new kakao.maps.Circle({map:map,center:position,radius:20,strokeWeight:2,
                        strokeColor:'#FFFFFF',fillColor:'#0081D5',fillOpacity:1});
                      map.panTo(position);
                    };
              var bounds = new kakao.maps.LatLngBounds();
              bounds.extend(center);
              var positions = ${JSON.stringify(positions)};
              positions.forEach(function(point) {
                var position = new kakao.maps.LatLng(point.lat, point.lng);
                var marker = new kakao.maps.Marker({map:map,position:position});
                bounds.extend(position);
                kakao.maps.event.addListener(marker,'click',function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({type:'shelter-select',index:point.index,documentId:mapDocumentId}));
                });
              });
              if (positions.length) map.setBounds(bounds);
              window.ReactNativeWebView.postMessage(JSON.stringify({type:'map-ready',documentId:mapDocumentId}));
            } catch (failure) { notifyMapError(); }
          }); } catch (failure) { notifyMapError(); }
        })();
      </script></body></html>` };
  }, [center, shelters, reloadKey]);
  const mapFailed = !!document && failedDocumentId === document.documentId;
  const clearTimeoutRef = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);
  useEffect(() => {
    if (!document || loading || error || mapFailed || readyDocumentId.current === document.documentId) return;
    const id = document.documentId;
    timeout.current = setTimeout(() => { timeout.current = null; setFailedDocumentId(id); }, 20000);
    return clearTimeoutRef;
  }, [document, loading, error, mapFailed, clearTimeoutRef]);
  const handleMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(nativeEvent.data);
      if (!document || message?.documentId !== document.documentId) return;
      if (message.type === 'map-ready') {
        readyDocumentId.current = document.documentId;
        setReadyMapId(document.documentId);
        clearTimeoutRef();
      } else if (message.type === 'map-error') {
        setFailedDocumentId(document.documentId);
      } else if (message.type === 'shelter-select' && Number.isInteger(message.index) && message.index >= 0) {
        const shelter = shelters[message.index];
        if (shelter && isShelterCoordinates(shelter.location)) setSelected(shelter);
      }
    } catch { /* Ignore unrelated or stale WebView messages. */ }
  };
  return (
    <View>
      <Text style={styles.notice}>현재 위치 기준 반경 {NEARBY_SHELTER_RADIUS_KM}km · 직선거리</Text>
      <View style={styles.mapArea}>
        {loading ? <View style={styles.status}><ActivityIndicator color="#0081D5" /></View>
          : error || !document ? <View style={styles.status}>
            <Text style={styles.description}>{error || '현재 위치를 확인할 수 없습니다.'}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={styles.retry}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View> : mapFailed ? <View style={styles.status}>
            <Text style={styles.description}>지도를 불러오지 못했습니다.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setReloadKey(value => value + 1)} style={styles.retry}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View> : <WebView ref={webViewRef} key={document.documentId} source={{ html: document.html }}
            originWhitelist={['*']} style={styles.map} javaScriptEnabled domStorageEnabled cacheEnabled={false}
            nestedScrollEnabled startInLoadingState
            renderLoading={() => <View style={[styles.status, StyleSheet.absoluteFill]}><ActivityIndicator color="#0081D5" /></View>}
            onMessage={handleMessage} onError={() => setFailedDocumentId(document.documentId)}
            onHttpError={() => setFailedDocumentId(document.documentId)}
            onRenderProcessGone={() => setFailedDocumentId(document.documentId)}
            onContentProcessDidTerminate={() => setFailedDocumentId(document.documentId)} />}
        {document && !loading && !error && !mapFailed && <MapRecenterButton key={`recenter:${document.documentId}`}
          disabled={readyMapId !== document.documentId}
          onLocation={point => webViewRef.current?.injectJavaScript(
            `window.recenterMap && window.recenterMap(${JSON.stringify({ documentId: document.documentId, point })});true;`
          )} />}
      </View>
      <View style={styles.information}>
        {loading ? <Text style={styles.description}>주변 보호소를 불러오는 중...</Text>
          : error ? null : selectedShelter ? <TouchableOpacity accessibilityRole="button" onPress={() => onSelect(selectedShelter)}>
            <Text style={styles.name}>{selectedShelter.name}</Text>
            <Text style={styles.description}>{selectedShelter.address}</Text>
            <Text style={styles.distance}>현재 위치에서 {selectedShelter.distance_m.toLocaleString()}m</Text>
          </TouchableOpacity> : <Text style={styles.description}>{shelters.length
            ? '지도에서 보호소 마커를 선택해 주세요.' : '반경 10km 안에 표시할 보호소가 없습니다.'}</Text>}
      </View>
    </View>
  );
};

export default ShelterNearbyMap;
const styles = StyleSheet.create({
  notice: { color: '#7B7C7D', fontSize: 12, marginBottom: 8 },
  mapArea: { height: 180, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 4, overflow: 'hidden' },
  map: { flex: 1, backgroundColor: '#E9ECEF' },
  status: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, backgroundColor: '#E9ECEF' },
  information: { paddingTop: 10 },
  description: { color: '#7B7C7D', fontSize: 14, lineHeight: 22 },
  name: { color: '#000', fontSize: 17, fontWeight: '600', marginBottom: 4 },
  distance: { color: '#0081D5', fontSize: 14, marginTop: 4 },
  retry: { paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#0081D5', fontSize: 14, fontWeight: '600' },
});
