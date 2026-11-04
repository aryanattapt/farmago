import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '../../state/cart';
import { money } from '../../lib/formatters';

export default function CartScreen() {
  const { items, quantity, subtotal, changeQuantity } = useCart();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>FARMAGO</Text>
        <Text style={styles.title}>Keranjang</Text>
        <Text style={styles.subtitle}>{quantity} produk pilihanmu</Text>

        {items.length ? (
          <>
            <View style={styles.itemList}>
              {items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.productMark}><Text style={styles.productPlus}>+</Text></View>
                  <View style={styles.itemDetails}>
                    <Text style={styles.category}>{item.category}</Text>
                    <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.unit}>{item.sellUnit}</Text>
                    <Text style={styles.price}>{money(item.indicativePrice)}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable accessibilityLabel={`Kurangi ${item.name}`} onPress={() => changeQuantity(item, -1)} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable>
                    <Text style={styles.count}>{item.quantity}</Text>
                    <Pressable accessibilityLabel={`Tambah ${item.name}`} disabled={!item.available} onPress={() => changeQuantity(item, 1)} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.summary}>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal indikatif</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View>
              <Text style={styles.disclaimer}>Harga akhir, stok, apotek, dan ongkir diperiksa saat checkout.</Text>
            </View>
            <View style={styles.comingSoon}><Text style={styles.comingSoonTitle}>Checkout di aplikasi segera hadir</Text><Text style={styles.comingSoonText}>Lanjutkan transaksi melalui FarmaGO versi web.</Text></View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Text style={styles.emptyBag}>▱</Text></View>
            <Text style={styles.emptyTitle}>Keranjang masih kosong</Text>
            <Text style={styles.emptyCopy}>Pilih kebutuhan sehatmu dari katalog.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  safeArea: { flex: 1, backgroundColor: '#f7f8f5' },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 28 },
  kicker: { color: '#547c68', fontSize: 9, fontWeight: '800' as const, letterSpacing: 1.4 },
  title: { marginTop: 8, color: '#26352c', fontSize: 28, fontWeight: '800' as const, letterSpacing: -1 },
  subtitle: { marginTop: 4, color: '#87918a', fontSize: 11 },
  itemList: { marginTop: 22, borderTopColor: '#e8ede8', borderTopWidth: 1 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 11, paddingVertical: 15, borderBottomColor: '#e8ede8', borderBottomWidth: 1 },
  productMark: { width: 56, height: 62, borderRadius: 12, backgroundColor: '#e8f2e5', alignItems: 'center' as const, justifyContent: 'center' as const },
  productPlus: { color: '#4b8059', fontSize: 37, lineHeight: 42 },
  itemDetails: { flex: 1 },
  category: { color: '#83a08c', fontSize: 8, fontWeight: '700' as const },
  name: { marginTop: 4, color: '#29382e', fontSize: 11, lineHeight: 16, fontWeight: '700' as const },
  unit: { marginTop: 2, color: '#98a29b', fontSize: 8 },
  price: { marginTop: 5, color: '#325d45', fontSize: 11, fontWeight: '800' as const },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, padding: 3, borderColor: '#dfebe0', borderWidth: 1, borderRadius: 9, backgroundColor: '#f8fbf7' },
  stepButton: { width: 22, height: 25, borderRadius: 6, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const },
  stepText: { color: '#47765a', fontSize: 17, lineHeight: 20 },
  count: { minWidth: 14, color: '#1c2924', fontSize: 10, fontWeight: '700' as const, textAlign: 'center' as const },
  summary: { marginTop: 18, padding: 15, borderColor: '#e5ebe5', borderWidth: 1, borderRadius: 14, backgroundColor: '#fff' },
  summaryRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  summaryLabel: { color: '#657269', fontSize: 10 },
  summaryValue: { color: '#325d45', fontSize: 13, fontWeight: '800' as const },
  disclaimer: { marginTop: 9, color: '#929c95', fontSize: 8, lineHeight: 13 },
  comingSoon: { marginTop: 12, padding: 14, borderRadius: 13, backgroundColor: '#e8f1e6' },
  comingSoonTitle: { color: '#3f6e51', fontSize: 10, fontWeight: '800' as const },
  comingSoonText: { marginTop: 4, color: '#718178', fontSize: 9, lineHeight: 14 },
  emptyState: { flex: 1, minHeight: 340, alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyIcon: { width: 64, height: 64, borderRadius: 21, backgroundColor: '#e8f3e8', alignItems: 'center' as const, justifyContent: 'center' as const },
  emptyBag: { color: '#44815d', fontSize: 38, lineHeight: 43 },
  emptyTitle: { marginTop: 14, color: '#4f5e55', fontSize: 14, fontWeight: '700' as const },
  emptyCopy: { marginTop: 5, color: '#89948d', fontSize: 10 },
};
