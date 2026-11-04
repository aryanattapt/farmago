import { Pressable, Text, View } from 'react-native';
import { money } from '../lib/formatters';
import type { Product } from '../lib/types';

type Props = {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
};

function colorsFor(category: string) {
  if (category.includes('Vitamin')) return { background: '#e8f2e5', accent: '#4b8059', mark: '#edf4e9' };
  if (category.includes('Alat')) return { background: '#e8edf5', accent: '#667fa2', mark: '#f1f4fa' };
  if (category.includes('Pertolongan')) return { background: '#f5e9df', accent: '#ae7956', mark: '#faf1e9' };
  return { background: '#ece9f4', accent: '#7f709e', mark: '#f3f0f8' };
}

export function ProductCard({ product, quantity, onAdd, onRemove }: Props) {
  const colors = colorsFor(product.category);

  return (
    <View style={styles.card}>
      <View style={[styles.visual, { backgroundColor: colors.background }]}>
        <View style={styles.orbit} />
        <View style={[styles.pack, { borderColor: `${colors.accent}22` }]}>
          <View style={[styles.cap, { backgroundColor: colors.accent }]} />
          <Text style={styles.brand}>FARMAGO</Text>
          <View style={[styles.packMark, { backgroundColor: colors.mark }]}>
            <Text style={[styles.plus, { color: colors.accent }]}>+</Text>
          </View>
          <Text style={[styles.caption, { color: colors.accent }]} numberOfLines={1}>
            {product.category.split(' ')[0].toUpperCase()}
          </Text>
        </View>
        {product.requiresPrescription && <Text style={styles.rxTag}>Resep</Text>}
        <View style={styles.favorite}><Text style={styles.heart}>♡</Text></View>
      </View>

      <View style={styles.info}>
        <Text style={styles.category} numberOfLines={1}>{product.category}</Text>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.unit} numberOfLines={1}>{product.sellUnit}</Text>
        <View style={styles.bottom}>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{money(product.indicativePrice)}</Text>
            <Text style={styles.priceNote}>harga indikatif</Text>
          </View>
          {quantity > 0 ? (
            <View style={styles.stepper}>
              <Pressable accessibilityLabel="Kurangi jumlah" onPress={onRemove} style={styles.stepButton}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.quantity}>{quantity}</Text>
              <Pressable accessibilityLabel="Tambah jumlah" disabled={!product.available} onPress={onAdd} style={styles.stepButton}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityLabel={product.available ? `Tambah ${product.name}` : 'Stok habis'}
              disabled={!product.available}
              onPress={onAdd}
              style={[styles.addButton, !product.available && styles.unavailable]}
            >
              <Text style={styles.addText}>{product.available ? '+' : 'Habis'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = {
  card: { flex: 1, backgroundColor: '#fff', borderColor: '#e8ede8', borderWidth: 1, borderRadius: 15, overflow: 'hidden' as const },
  visual: { height: 142, alignItems: 'center' as const, justifyContent: 'center' as const, position: 'relative' as const, overflow: 'hidden' as const },
  orbit: { position: 'absolute' as const, width: 118, height: 118, borderWidth: 1, borderColor: '#ffffff9c', borderRadius: 59 },
  pack: { width: 79, height: 102, backgroundColor: '#fff', borderWidth: 1, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, shadowColor: '#334638', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 5, height: 8 }, elevation: 3 },
  cap: { position: 'absolute' as const, top: -5, width: 45, height: 6, borderRadius: 4 },
  brand: { fontSize: 6, fontWeight: '800' as const, letterSpacing: 1, color: '#7a8a79' },
  packMark: { width: 38, height: 38, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const },
  plus: { fontSize: 28, fontWeight: '400' as const, lineHeight: 32 },
  caption: { fontSize: 6, fontWeight: '800' as const, letterSpacing: 1.3, maxWidth: 64 },
  rxTag: { position: 'absolute' as const, left: 9, top: 9, overflow: 'hidden' as const, borderRadius: 6, backgroundColor: '#fff', paddingHorizontal: 7, paddingVertical: 4, color: '#87694f', fontSize: 8, fontWeight: '800' as const },
  favorite: { position: 'absolute' as const, right: 9, top: 8, width: 27, height: 27, borderRadius: 14, backgroundColor: '#ffffffd9', alignItems: 'center' as const, justifyContent: 'center' as const },
  heart: { color: '#b8665b', fontSize: 19, lineHeight: 22 },
  info: { paddingHorizontal: 11, paddingTop: 11, paddingBottom: 12 },
  category: { color: '#83a08c', fontSize: 9, fontWeight: '700' as const },
  name: { minHeight: 38, marginTop: 4, color: '#29382e', fontSize: 12, lineHeight: 17, fontWeight: '700' as const },
  unit: { color: '#98a29b', fontSize: 9 },
  bottom: { minHeight: 38, marginTop: 11, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 4 },
  priceBlock: { flexShrink: 1 },
  price: { color: '#325d45', fontSize: 12, fontWeight: '800' as const },
  priceNote: { marginTop: 2, color: '#9aa39c', fontSize: 8 },
  addButton: { width: 31, height: 31, borderColor: '#cfe1d2', borderWidth: 1, borderRadius: 10, backgroundColor: '#eff6ed', alignItems: 'center' as const, justifyContent: 'center' as const },
  addText: { color: '#3d7854', fontSize: 20, lineHeight: 24, fontWeight: '500' as const },
  unavailable: { width: 47, backgroundColor: '#f4f5f2' },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, padding: 3, borderColor: '#dfebe0', borderWidth: 1, borderRadius: 9, backgroundColor: '#f8fbf7' },
  stepButton: { width: 22, height: 24, borderRadius: 6, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const },
  stepText: { color: '#47765a', fontSize: 17, lineHeight: 20 },
  quantity: { minWidth: 13, color: '#1c2924', fontSize: 10, fontWeight: '700' as const, textAlign: 'center' as const },
};
