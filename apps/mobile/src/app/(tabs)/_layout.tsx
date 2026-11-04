import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../state/cart';

export default function TabLayout() {
  const { quantity } = useCart();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2f765d',
        tabBarInactiveTintColor: '#8c9890',
        tabBarStyle: {
          height: 57 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 7),
          backgroundColor: '#ffffff',
          borderTopColor: '#e9ede8',
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>⌂</Text>,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Keranjang',
          tabBarBadge: quantity > 0 ? quantity : undefined,
          tabBarBadgeStyle: { backgroundColor: '#2f765d', fontSize: 9 },
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>▱</Text>,
        }}
      />
    </Tabs>
  );
}
