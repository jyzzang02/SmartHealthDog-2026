import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

interface MapPoint {
  lat: number;
  lng: number;
}

export interface HospitalMapItem {
  name: string;
  address: string | null;
  location: MapPoint;
  distance_m: number | null;
}

interface Props {
  center: MapPoint;
  hospitals: readonly HospitalMapItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const isValidPoint = (point: MapPoint) =>
  Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
  Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;

const HospitalSearchMap: React.FC<Props> = ({ center, hospitals, loading = false, error, onRetry }) => {
  const [selected, setSelected] = useState<HospitalMapItem | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedHospital = selected && hospitals.includes(selected) ? selected : null;
  const hasMarkers = hospitals.some((hospital) => isValidPoint(hospital.location));

  const mapHtml = useMemo(() => {
    const mapCenter = isValidPoint(center) ? center : { lat: 37.5665, lng: 126.9780 };
    const positions = hospitals
      .map((hospital, index) => ({ lat: hospital.location.lat, lng: hospital.location.lng, index }))
      .filter(isValidPoint);

    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #E9ECEF; }
          </style>
          <script>
            function notifyMapError() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map-error' }));
            }
          </script>
          <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=e65e93f752b1590bf9b8be83566dd5b6&autoload=false" onerror="notifyMapError()"></script>
        </head>
        <body>
          <div id="map"></div>
          <script>
            (function() {
              if (!window.kakao || !kakao.maps) { notifyMapError(); return; }
              kakao.maps.load(function() {
                var center = new kakao.maps.LatLng(${mapCenter.lat}, ${mapCenter.lng});
                var map = new kakao.maps.Map(document.getElementById('map'), { center: center, level: 4 });
                var positions = ${JSON.stringify(positions)};
                var bounds = new kakao.maps.LatLngBounds();
                bounds.extend(center);
                positions.forEach(function(point) {
                  var position = new kakao.maps.LatLng(point.lat, point.lng);
                  var marker = new kakao.maps.Marker({ map: map, position: position });
                  bounds.extend(position);
                  kakao.maps.event.addListener(marker, 'click', function() {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'hospital-select', index: point.index
                    }));
                  });
                });
                if (positions.length > 0) { map.setBounds(bounds); }
              });
            })();
          </script>
        </body>
      </html>`;
  }, [center, hospitals]);

  const handleMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(nativeEvent.data);
      if (message?.type === 'map-error') {
        setMapFailed(true);
      } else if (message?.type === 'hospital-select' && Number.isInteger(message.index)) {
        const hospital = hospitals[message.index];
        if (hospital && isValidPoint(hospital.location)) setSelected(hospital);
      }
    } catch {
      // Ignore messages that are not part of the map bridge protocol.
    }
  };

  return (
    <View>
      <Text style={styles.previewNotice}>
        {loading ? '주변 병원을 검색하고 있습니다.' : error ? '주변 병원 검색을 완료하지 못했습니다.' : '현재 위치 기준 반경 10km'}
      </Text>
      <View style={styles.mapArea}>
        {mapFailed ? (
          <View style={styles.mapStatus}>
            <Text style={styles.description}>지도를 불러오지 못했습니다.</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => { setMapFailed(false); setReloadKey((value) => value + 1); }}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            key={reloadKey}
            style={styles.map}
            source={{ html: mapHtml }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled={false}
            nestedScrollEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={[styles.mapStatus, StyleSheet.absoluteFill]}>
                <ActivityIndicator color="#0081D5" />
              </View>
            )}
            onMessage={handleMessage}
            onError={() => setMapFailed(true)}
            onHttpError={() => setMapFailed(true)}
          />
        )}
      </View>
      <View style={styles.information}>
        {loading ? <ActivityIndicator color="#0081D5" /> : error ? (
          <>
            <Text style={styles.description}>{error}</Text>
            {onRetry && <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={onRetry}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>}
          </>
        ) : selectedHospital ? (
          <>
            <Text style={styles.name}>{selectedHospital.name}</Text>
            <Text style={styles.description}>{selectedHospital.address || '주소 정보 없음'}</Text>
            {typeof selectedHospital.distance_m === 'number' && Number.isFinite(selectedHospital.distance_m) && selectedHospital.distance_m >= 0 && (
              <Text style={styles.distance}>현재 위치에서 {selectedHospital.distance_m.toLocaleString()}m</Text>
            )}
          </>
        ) : (
          <Text style={styles.description}>
            {hasMarkers ? '지도에서 병원 마커를 선택해 주세요.' : '표시할 병원이 없습니다.'}
          </Text>
        )}
      </View>
    </View>
  );
};

export default HospitalSearchMap;

const styles = StyleSheet.create({
  previewNotice: { color: '#7B7C7D', fontSize: 12, marginBottom: 8 },
  mapArea: { height: 260, backgroundColor: '#E9ECEF' },
  map: { flex: 1, backgroundColor: '#E9ECEF' },
  mapStatus: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E9ECEF' },
  information: { paddingVertical: 12 },
  name: { fontSize: 17, fontWeight: '600', color: '#000', marginBottom: 6 },
  description: { fontSize: 14, lineHeight: 22, color: '#7B7C7D' },
  distance: { fontSize: 14, lineHeight: 22, color: '#0081D5', marginTop: 4 },
  retryButton: { paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  retryText: { fontSize: 14, fontWeight: '600', color: '#0081D5' },
});
