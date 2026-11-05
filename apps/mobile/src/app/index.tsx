import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

declare const process: { env: { EXPO_PUBLIC_WEB_URL?: string } };

const localWebUrl = Platform.select({
  android: 'http://10.0.2.2:5173',
  default: 'http://localhost:5173',
}) ?? 'http://localhost:5173';

function originOf(value: string) {
  return value.match(/^https?:\/\/[^/]+/i)?.[0]?.toLowerCase() ?? '';
}

const absoluteFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export default function MobileWebApp() {
  const webView = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const webUrl = useMemo(
    () => process.env.EXPO_PUBLIC_WEB_URL?.trim() || localWebUrl,
    [],
  );
  const appOrigin = useMemo(() => originOf(webUrl), [webUrl]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !canGoBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const handleNavigation = (request: { url: string }) => {
    const scheme = request.url.split(':', 1)[0]?.toLowerCase();
    if (scheme === 'about') return true;
    if (scheme === 'http' || scheme === 'https') {
      if (originOf(request.url) === appOrigin) return true;
      void Linking.openURL(request.url).catch(() => setLoadError(true));
      return false;
    }
    if (scheme === 'mailto' || scheme === 'tel') {
      void Linking.openURL(request.url).catch(() => setLoadError(true));
    }
    return false;
  };

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    webView.current?.reload();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <WebView
        ref={webView}
        source={{ uri: webUrl }}
        originWhitelist={['http://*', 'https://*']}
        onShouldStartLoadWithRequest={handleNavigation}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => {
          setLoading(true);
          setLoadError(false);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setLoadError(true);
        }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        style={styles.webView}
      />
      {loading && !loadError && (
        <View accessibilityLabel="Memuat FarmaGO" style={styles.loading}>
          <ActivityIndicator color="#2f765d" size="large" />
          <Text style={styles.loadingText}>Memuat FarmaGO…</Text>
        </View>
      )}
      {loadError && (
        <View style={styles.errorScreen}>
          <Text style={styles.brand}>FarmaGO</Text>
          <Text style={styles.errorTitle}>FarmaGO belum dapat dibuka</Text>
          <Text style={styles.errorCopy}>
            Periksa koneksi dan alamat web aplikasi, lalu coba lagi.
          </Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>Coba lagi</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = {
  safeArea: { flex: 1, backgroundColor: '#f7f8f5' },
  webView: { flex: 1, backgroundColor: '#f7f8f5' },
  loading: {
    ...absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    backgroundColor: '#f7f8f5',
  },
  loadingText: { color: '#657269', fontSize: 13, fontWeight: '600' as const },
  errorScreen: {
    ...absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 28,
    backgroundColor: '#f7f8f5',
  },
  brand: { marginBottom: 22, color: '#2f765d', fontSize: 20, fontWeight: '800' as const },
  errorTitle: { color: '#26352c', fontSize: 18, fontWeight: '800' as const, textAlign: 'center' as const },
  errorCopy: { marginTop: 8, color: '#78827d', fontSize: 13, lineHeight: 20, textAlign: 'center' as const },
  retryButton: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: '#294f3e' },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
};
