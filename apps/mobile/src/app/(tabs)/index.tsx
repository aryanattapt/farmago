import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ProductCard } from '../../components/ProductCard';
import { listProducts } from '../../lib/api';
import type { Product } from '../../lib/types';
import { useCart } from '../../state/cart';

const colors = {
  ink: '#1c2924',
  muted: '#78827d',
  green: '#2f765d',
  darkGreen: '#294f3e',
  softGreen: '#e5f1e9',
  line: '#e9ede8',
  paper: '#ffffff',
  background: '#f7f8f5',
};

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inputRef = useRef<TextInput>(null);
  const requestId = useRef(0);
  const categoriesLoaded = useRef(false);
  const { items, changeQuantity, quantity } = useCart();

  const loadProducts = useCallback(async (nextQuery = '', nextCategory = '') => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await listProducts(nextQuery, nextCategory);
      if (currentRequest !== requestId.current) return;
      setProducts(result.items);
      if (!categoriesLoaded.current) {
        setCategories(result.categories);
        categoriesLoaded.current = true;
      }
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : 'Katalog belum dapat dimuat.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const search = () => {
    Keyboard.dismiss();
    void loadProducts(query, category);
  };
  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    void loadProducts(query, nextCategory);
  };
  const resetCatalog = () => {
    setQuery('');
    setCategory('');
    void loadProducts();
  };
  const productQuantity = (id: string) => items.find((item) => item.id === id)?.quantity ?? 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandPlus}>+</Text></View>
            <View>
              <Text style={styles.brandName}>Farma<Text style={styles.brandAccent}>GO</Text></Text>
              <Text style={styles.brandTagline}>SEHAT DIMULAI DARI SINI</Text>
            </View>
          </View>
          <Pressable accessibilityLabel={`Buka keranjang, ${quantity} item`} onPress={() => router.push('/cart')} style={styles.cartButton}>
            <Text style={styles.cartIcon}>▱</Text>
            {quantity > 0 && <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{quantity}</Text></View>}
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <View style={styles.eyebrowRow}><View style={styles.eyebrowDot} /><Text style={styles.eyebrow}>APOTEK PILIHAN, LEBIH DEKAT</Text></View>
            <Text style={styles.heroTitle}>Rawat diri{ '\n' }<Text style={styles.heroTitleAccent}>lebih mudah.</Text></Text>
            <Text style={styles.heroDescription}>Temukan kebutuhan kesehatan dari apotek mitra, ditemani apoteker.</Text>
            <Pressable onPress={() => inputRef.current?.focus()} style={styles.heroButton}>
              <Text style={styles.heroButtonText}>Cari kebutuhanmu  <Text style={styles.heroArrow}>›</Text></Text>
            </Pressable>
            <View style={styles.heroProof}>
              <View style={styles.avatarStack}><Text style={[styles.avatar, styles.avatarOne]}>R</Text><Text style={[styles.avatar, styles.avatarTwo]}>A</Text><Text style={[styles.avatar, styles.avatarThree]}>D</Text></View>
              <View><Text style={styles.proofTitle}>Apoteker tepercaya</Text><Text style={styles.proofCaption}>Siap membantu setiap langkah</Text></View>
            </View>
          </View>
          <View accessibilityElementsHidden style={styles.heroArt}>
            <View style={styles.artSun} />
            <View style={styles.artBottle}>
              <View style={styles.artCap} />
              <View style={styles.artLabel}><Text style={styles.artCross}>+</Text><Text style={styles.artLabelText}>DAILY{ '\n' }CARE</Text></View>
            </View>
            <View style={styles.artPill} />
            <Text style={styles.artFlower}>✳</Text>
            <View style={styles.artCard}><Text style={styles.artCheck}>✓</Text><Text style={styles.artCardText}>Terpercaya</Text></View>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            placeholder="Cari obat, vitamin, dan lainnya..."
            placeholderTextColor="#a0aaa3"
            style={styles.searchInput}
          />
          <Pressable accessibilityLabel="Cari produk" onPress={search} style={styles.searchButton}><Text style={styles.searchArrow}>›</Text></Pressable>
        </View>
        <View style={styles.searchNote}><Text style={styles.lockIcon}>▣</Text><Text style={styles.searchNoteText}>Resep diperiksa apoteker sebelum pembayaran</Text></View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.benefits}>
          <Benefit mark="✓" title="Apotek tepercaya" copy="Mitra terverifikasi" />
          <Benefit mark="+" title="Diperiksa apoteker" copy="Untuk produk resep" />
          <Benefit mark="↗" title="Status transparan" copy="Pantau pesanan" />
          <Benefit mark="♡" title="Peduli kesehatan" copy="Belanja lebih tenang" />
        </ScrollView>

        <View style={styles.catalogHeading}>
          <View style={styles.catalogTitleWrap}>
            <Text style={styles.sectionKicker}>PILIHAN UNTUKMU</Text>
            <Text style={styles.sectionTitle}>Belanja kebutuhan sehat</Text>
            <Text style={styles.sectionSubtitle}>Harga indikatif. Total ditinjau sebelum pesanan dibuat.</Text>
          </View>
          <Pressable onPress={resetCatalog} style={styles.viewAll}><Text style={styles.viewAllText}>Lihat semua  ›</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {['', ...categories].map((item) => {
            const active = category === item;
            return (
              <Pressable key={item || 'all'} onPress={() => selectCategory(item)} style={[styles.chip, active && styles.activeChip]}>
                <Text style={[styles.chipText, active && styles.activeChipText]}>{item || 'Semua produk'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.stateBox}><ActivityIndicator color={colors.green} /><Text style={styles.stateText}>Memuat katalog...</Text></View>
        ) : error ? (
          <View style={styles.stateBox}><Text style={styles.stateTitle}>Katalog belum tersedia</Text><Text style={styles.stateText}>{error}</Text><Pressable onPress={() => void loadProducts(query, category)} style={styles.retryButton}><Text style={styles.retryText}>Coba lagi</Text></Pressable></View>
        ) : products.length ? (
          <View style={styles.productGrid}>
            {products.map((product, index) => index % 2 === 0 ? (
              <View key={product.id} style={styles.productRow}>
                <ProductCard product={product} quantity={productQuantity(product.id)} onAdd={() => changeQuantity(product, 1)} onRemove={() => changeQuantity(product, -1)} />
                {products[index + 1] ? <ProductCard product={products[index + 1]} quantity={productQuantity(products[index + 1].id)} onAdd={() => changeQuantity(products[index + 1], 1)} onRemove={() => changeQuantity(products[index + 1], -1)} /> : <View style={styles.emptyColumn} />}
              </View>
            ) : null)}
          </View>
        ) : (
          <View style={styles.stateBox}><Text style={styles.emptySearchIcon}>⌕</Text><Text style={styles.stateTitle}>Belum ada produk yang cocok</Text><Text style={styles.stateText}>Coba kata kunci atau kategori lain.</Text><Pressable onPress={resetCatalog} style={styles.retryButton}><Text style={styles.retryText}>Atur ulang pencarian</Text></Pressable></View>
        )}

        <View style={styles.catalogFootnote}><Text style={styles.footnoteIcon}>✓</Text><Text style={styles.footnoteText}>Produk berlabel resep perlu ditinjau apoteker.</Text></View>

        <View style={styles.supportBanner}>
          <View style={styles.supportIcon}><Text style={styles.supportHeart}>♡</Text></View>
          <View style={styles.supportCopy}><Text style={styles.sectionKicker}>BUTUH BANTUAN?</Text><Text style={styles.supportTitle}>Kesehatanmu, prioritas kami.</Text><Text style={styles.supportDescription}>Apoteker dan tim bantuan siap membantumu.</Text></View>
          <Text style={styles.supportDeco}>✳</Text>
        </View>
        <Text style={styles.footerText}>FarmaGO · Sehat dimulai dari sini</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Benefit({ mark, title, copy }: { mark: string; title: string; copy: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}><Text style={styles.benefitMark}>{mark}</Text></View>
      <View><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitCopy}>{copy}</Text></View>
    </View>
  );
}

const styles = {
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 28 },
  header: { height: 52, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 15 },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#ddefe1', alignItems: 'center' as const, justifyContent: 'center' as const },
  brandPlus: { color: '#2b7258', fontSize: 27, lineHeight: 31, fontWeight: '700' as const },
  brandName: { color: colors.ink, fontSize: 18, lineHeight: 20, fontWeight: '800' as const, letterSpacing: -0.7 },
  brandAccent: { color: '#418769' },
  brandTagline: { color: '#8d9890', fontSize: 6, fontWeight: '700' as const, letterSpacing: 1.2, marginTop: 2 },
  cartButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#f3f8f3', borderColor: '#dce7de', borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  cartIcon: { color: '#2e604a', fontSize: 25, lineHeight: 29 },
  cartBadge: { position: 'absolute' as const, right: -4, top: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#34775d', alignItems: 'center' as const, justifyContent: 'center' as const },
  cartBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' as const },
  hero: { minHeight: 267, borderRadius: 20, padding: 17, backgroundColor: '#e8f1e6', overflow: 'hidden' as const, position: 'relative' as const, justifyContent: 'center' as const },
  heroCopy: { width: '73%' as const, zIndex: 2 },
  eyebrowRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7 },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#80bb8c' },
  eyebrow: { color: '#547c68', fontSize: 8, fontWeight: '800' as const, letterSpacing: 1.05 },
  heroTitle: { marginTop: 18, color: '#1e2d26', fontSize: 29, lineHeight: 33, fontWeight: '800' as const, letterSpacing: -1.4 },
  heroTitleAccent: { color: '#50826a' },
  heroDescription: { maxWidth: 225, marginTop: 9, color: '#758078', fontSize: 10, lineHeight: 16 },
  heroButton: { alignSelf: 'flex-start' as const, marginTop: 13, paddingHorizontal: 12, height: 34, borderRadius: 9, backgroundColor: colors.darkGreen, justifyContent: 'center' as const },
  heroButtonText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },
  heroArrow: { fontSize: 17, lineHeight: 17 },
  heroProof: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 14 },
  avatarStack: { flexDirection: 'row' as const, paddingLeft: 2 },
  avatar: { width: 22, height: 22, marginLeft: -3, borderWidth: 2, borderColor: '#e8f1e6', borderRadius: 12, textAlign: 'center' as const, textAlignVertical: 'center' as const, color: '#fff', fontSize: 7, fontWeight: '800' as const, overflow: 'hidden' as const },
  avatarOne: { backgroundColor: '#91a997' },
  avatarTwo: { backgroundColor: '#dcad89' },
  avatarThree: { backgroundColor: '#758f9b' },
  proofTitle: { color: '#59665e', fontSize: 8, fontWeight: '700' as const },
  proofCaption: { marginTop: 2, color: '#8a948d', fontSize: 7 },
  heroArt: { position: 'absolute' as const, right: 1, top: 30, width: 104, height: 195 },
  artSun: { position: 'absolute' as const, width: 102, height: 102, borderRadius: 51, top: 16, right: 0, backgroundColor: '#c8e2cb' },
  artBottle: { position: 'absolute' as const, width: 62, height: 107, right: 19, top: 39, borderRadius: 14, backgroundColor: '#fffefa', alignItems: 'center' as const, justifyContent: 'center' as const, shadowColor: '#6f9678', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 8, height: 12 }, elevation: 4, transform: [{ rotate: '-6deg' }] },
  artCap: { position: 'absolute' as const, top: -8, width: 41, height: 13, borderRadius: 5, backgroundColor: '#568b70' },
  artLabel: { width: 48, height: 49, borderRadius: 6, backgroundColor: '#e8f1df', flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4 },
  artCross: { color: '#6eae79', fontSize: 28, lineHeight: 30, fontWeight: '400' as const },
  artLabelText: { color: '#39664d', fontSize: 5, lineHeight: 8, letterSpacing: 0.7, fontWeight: '800' as const },
  artPill: { position: 'absolute' as const, width: 49, height: 14, top: 31, right: 0, borderRadius: 8, backgroundColor: '#fff', borderRightColor: '#e5b68c', borderRightWidth: 24, transform: [{ rotate: '33deg' }] },
  artFlower: { position: 'absolute' as const, left: 3, bottom: 23, color: '#e8a988', fontSize: 24 },
  artCard: { position: 'absolute' as const, right: 0, bottom: 9, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 7, paddingVertical: 6, borderWidth: 1, borderColor: '#fff', borderRadius: 9, backgroundColor: '#ffffffeb' },
  artCheck: { color: '#438262', fontSize: 12, fontWeight: '800' as const },
  artCardText: { color: '#486955', fontSize: 7, fontWeight: '700' as const },
  searchBox: { height: 52, marginTop: 15, paddingLeft: 13, paddingRight: 7, borderRadius: 13, borderColor: '#e4eae4', borderWidth: 1, backgroundColor: '#fff', flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9 },
  searchIcon: { color: '#7b8a80', fontSize: 27, lineHeight: 31 },
  searchInput: { flex: 1, paddingVertical: 0, color: colors.ink, fontSize: 11 },
  searchButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#edf5ed', alignItems: 'center' as const, justifyContent: 'center' as const },
  searchArrow: { color: '#3c7658', fontSize: 24, lineHeight: 27 },
  searchNote: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 8, marginLeft: 3 },
  lockIcon: { color: '#639473', fontSize: 11 },
  searchNoteText: { color: '#87928b', fontSize: 8 },
  benefits: { gap: 8, paddingVertical: 16 },
  benefit: { minWidth: 148, padding: 10, borderColor: colors.line, borderWidth: 1, borderRadius: 13, backgroundColor: '#fff', flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  benefitIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#eff6ef', alignItems: 'center' as const, justifyContent: 'center' as const },
  benefitMark: { color: '#4b8662', fontSize: 15, fontWeight: '700' as const },
  benefitTitle: { color: '#405147', fontSize: 8, fontWeight: '700' as const },
  benefitCopy: { marginTop: 3, color: '#929c95', fontSize: 7 },
  catalogHeading: { marginTop: 9, flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, gap: 8 },
  catalogTitleWrap: { flex: 1 },
  sectionKicker: { color: '#547c68', fontSize: 8, fontWeight: '800' as const, letterSpacing: 1.3 },
  sectionTitle: { marginTop: 6, color: '#26352c', fontSize: 20, lineHeight: 25, fontWeight: '800' as const, letterSpacing: -0.7 },
  sectionSubtitle: { marginTop: 3, color: '#87918a', fontSize: 8, lineHeight: 13 },
  viewAll: { paddingVertical: 6 },
  viewAllText: { color: '#397456', fontSize: 8, fontWeight: '700' as const },
  chips: { gap: 7, paddingTop: 15, paddingBottom: 13 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderColor: '#e2e9e2', borderWidth: 1, borderRadius: 20, backgroundColor: '#fff' },
  activeChip: { backgroundColor: '#e7f1e7', borderColor: '#cde0d0' },
  chipText: { color: '#69766e', fontSize: 9, fontWeight: '600' as const },
  activeChipText: { color: '#366d50', fontWeight: '700' as const },
  productGrid: { gap: 11 },
  productRow: { flexDirection: 'row' as const, gap: 11 },
  emptyColumn: { flex: 1 },
  stateBox: { minHeight: 190, paddingHorizontal: 18, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  stateTitle: { color: '#4f5e55', fontSize: 13, fontWeight: '700' as const, textAlign: 'center' as const },
  stateText: { color: '#89948d', fontSize: 10, textAlign: 'center' as const },
  emptySearchIcon: { color: '#44815d', fontSize: 27 },
  retryButton: { marginTop: 4, paddingHorizontal: 13, paddingVertical: 8, borderColor: '#d6e3d8', borderWidth: 1, borderRadius: 9, backgroundColor: '#fff' },
  retryText: { color: '#386c52', fontSize: 9, fontWeight: '700' as const },
  catalogFootnote: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 16 },
  footnoteIcon: { color: '#649474', fontSize: 11, fontWeight: '800' as const },
  footnoteText: { color: '#89938c', fontSize: 8 },
  supportBanner: { minHeight: 108, marginTop: 25, padding: 14, borderRadius: 17, borderColor: '#dce9dc', borderWidth: 1, backgroundColor: '#e8f1e6', flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, overflow: 'hidden' as const },
  supportIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#d5e8d4', alignItems: 'center' as const, justifyContent: 'center' as const },
  supportHeart: { color: '#4e865e', fontSize: 24, lineHeight: 27 },
  supportCopy: { flex: 1 },
  supportTitle: { marginTop: 5, color: '#33473a', fontSize: 12, fontWeight: '800' as const },
  supportDescription: { maxWidth: 205, marginTop: 3, color: '#7d8b80', fontSize: 8, lineHeight: 12 },
  supportDeco: { position: 'absolute' as const, right: -5, bottom: -38, color: '#d2e5d0', fontSize: 95, lineHeight: 100 },
  footerText: { paddingVertical: 17, color: '#a0a8a2', fontSize: 8, textAlign: 'center' as const },
};
