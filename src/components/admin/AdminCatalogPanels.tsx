import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  Check,
  CheckCircle2,
  Database,
  Edit3,
  Eye,
  EyeOff,
  ImageOff,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import {
  CHATTOGRAM_OUTLETS,
  CONFIRMED_DEMO_SHOWROOM_IDS,
  isDemoOrDummyShowroom,
} from '../../data/outletsData';
import { resolveAssetUrl } from '../../lib/assets';
import {
  getCategoryText,
  getOccasionText,
  getProductText,
  getShowroomText,
} from '../../lib/bilingual';
import { OperationType, handleFirestoreError, requireDb } from '../../lib/firebase';
import { uploadCatalogImageToStorage, validateCatalogImageFile } from '../../lib/productStorage';
import { formatBdtPrice, toSlug } from '../../lib/utils';
import type {
  Category,
  Occasion,
  Product,
  ProductAvailability,
  Showroom,
} from '../../types';

// ========================
// 1. PRODUCT MANAGEMENT
// ========================
export function AdminProductsPanel() {
  const {
    allProducts,
    allCategories,
    allOccasions,
    allShowrooms,
    hasPermission,
    logAdminActivity,
    importProductMasterList,
    masterImportStats,
    masterImportRunning,
    lastMasterImportSummary,
  } = useStore();
  const canAdd = hasPermission('products_add');
  const canEdit = hasPermission('products_edit');
  const canDelete = hasPermission('products_delete');
  const [editing, setEditing] = useState<Product | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<string>('');
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'active' | 'hidden' | 'archived' | 'all'>('active');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);
  const [rowUploadProgress, setRowUploadProgress] = useState<number | null>(null);
  const [editorUploadProgress, setEditorUploadProgress] = useState<number | null>(null);
  const [editorUploadLabel, setEditorUploadLabel] = useState<string>('');
  const [editorUploadPreviewUrl, setEditorUploadPreviewUrl] = useState<string | null>(null);
  const [editorUploadError, setEditorUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const serializeNonImageState = (
    p: Product,
    ingText: string,
    szText: string
  ): string =>
    JSON.stringify({
      name: p.name.trim(),
      nameBn: (p.nameBn ?? p.name).trim(),
      nameEn: p.nameEn.trim(),
      slug: p.slug.trim(),
      category: p.category,
      categoryName: p.categoryName,
      productType: p.productType.trim(),
      price: Number(p.price) || 0,
      old_price: p.old_price ?? null,
      discount: (p.discount ?? '').trim(),
      price_label: (p.price_label ?? '').trim(),
      priceUnit: p.priceUnit.trim(),
      unit: (p.unit ?? p.priceUnit).trim(),
      shortDescription: p.shortDescription.trim(),
      shortDescriptionEn: (p.shortDescriptionEn ?? '').trim(),
      description: p.description.trim(),
      descriptionEn: (p.descriptionEn ?? '').trim(),
      ingredients: ingText.trim(),
      sizes: szText.trim(),
      weight: p.weight.trim(),
      occasions: p.occasions,
      showrooms: p.showrooms,
      availability: p.availability,
      importantNotes: p.importantNotes.trim(),
      featured: Boolean(p.featured),
      popular: Boolean(p.popular),
      visible: p.visible !== false,
      deleted: Boolean(p.deleted),
      display_order: Number(p.display_order) || 1,
    });

  const emptyProduct = (): Product => ({
    id: `prod-${Date.now()}`,
    name: '',
    nameBn: '',
    nameEn: '',
    name_bn: '',
    name_en: '',
    slug: '',
    category: allCategories[0]?.slug ?? 'custom-cake',
    categoryName: allCategories[0]?.name ?? 'কাস্টমাইজ কেক',
    categoryNameEn: allCategories[0]?.nameEn ?? 'Customized Cakes',
    productType: 'Signature Item',
    price: 0,
    old_price: undefined,
    discount: '',
    price_label: '',
    priceUnit: 'Piece',
    unit: 'Piece',
    shortDescription: '',
    shortDescriptionEn: '',
    short_description_bn: '',
    short_description_en: '',
    description: '',
    descriptionEn: '',
    description_bn: '',
    description_en: '',
    image: '',
    images: [],
    ingredients: [],
    sizes: ['Regular'],
    weight: '',
    occasions: [],
    showrooms: allShowrooms
      .filter((s) => s.visible !== false && !s.deleted && !isDemoOrDummyShowroom(s))
      .slice(0, 20)
      .map((s) => s.id),
    availability: 'In Showroom',
    importantNotes: '',
    featured: false,
    popular: false,
    visible: true,
    deleted: false,
    display_order: allProducts.length + 1,
    status: 'published',
  });

  const [ingredientsText, setIngredientsText] = useState('');
  const [sizesText, setSizesText] = useState('');

  const openEditor = (prod: Product | null) => {
    if (prod) {
      const t = getProductText(prod, allCategories);
      const ing = (Array.isArray(prod.ingredients) ? prod.ingredients : []).join(', ');
      const sz = (Array.isArray(prod.sizes) ? prod.sizes : []).join(', ');
      const normalizedImages =
        Array.isArray(prod.images) && prod.images.length > 0
          ? prod.images.filter(Boolean)
          : prod.image
          ? [prod.image]
          : [];
      const prepared: Product = {
        ...prod,
        name: t.nameBn,
        nameBn: t.nameBn,
        nameEn: t.nameEn,
        name_bn: t.nameBn,
        name_en: t.nameEn,
        unit: t.unit || prod.priceUnit,
        priceUnit: prod.priceUnit || t.unit || 'Piece',
        image: prod.image || normalizedImages[0] || '',
        images: normalizedImages,
        shortDescription: t.shortDescriptionBn,
        shortDescriptionEn: t.shortDescriptionEn,
        short_description_bn: t.shortDescriptionBn,
        short_description_en: t.shortDescriptionEn,
        description: t.descriptionBn,
        descriptionEn: t.descriptionEn,
        description_bn: t.descriptionBn,
        description_en: t.descriptionEn,
        categoryName: prod.categoryName || t.categoryNameBn,
        categoryNameEn: prod.categoryNameEn || t.categoryNameEn,
      };
      setIsNew(false);
      setEditing(prepared);
      setIngredientsText(ing);
      setSizesText(sz);
      setOriginalSnapshot(serializeNonImageState(prepared, ing, sz));
    } else {
      const fresh = emptyProduct();
      setIsNew(true);
      setEditing(fresh);
      setIngredientsText('');
      setSizesText('Regular');
      setOriginalSnapshot('');
    }
    setEditorUploadProgress(null);
    setEditorUploadLabel('');
    setEditorUploadPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setEditorUploadError(null);
    setFeedback(null);
  };

  const uploadProductFilesToStorage = async (files: File[]) => {
    if (!editing || files.length === 0) return;

    const currentImages = editing.images.filter(Boolean);
    const remainingSlots = Math.max(0, 6 - currentImages.length);
    if (remainingSlots <= 0) {
      setEditorUploadError('একটি পণ্যে সর্বোচ্চ ৬টি ছবি রাখা যাবে। নতুন ছবি যোগ করতে একটি ছবি সরান।');
      return;
    }

    const queue = files.slice(0, remainingSlots);
    for (const candidate of queue) {
      const errMsg = validateCatalogImageFile(candidate);
      if (errMsg) {
        setEditorUploadError(errMsg);
        return;
      }
    }

    setEditorUploadError(null);

    let accumulatedImages = [...currentImages];
    let activePreviewUrl: string | null = null;

    try {
      for (let i = 0; i < queue.length; i += 1) {
        const file = queue[i];
        if (activePreviewUrl) {
          URL.revokeObjectURL(activePreviewUrl);
          activePreviewUrl = null;
        }
        activePreviewUrl = URL.createObjectURL(file);
        setEditorUploadPreviewUrl(activePreviewUrl);
        setEditorUploadLabel(
          queue.length > 1 ? `${file.name} (${i + 1}/${queue.length})` : file.name
        );
        setEditorUploadProgress(1);

        const result = await uploadCatalogImageToStorage({
          folder: 'products',
          entityId: editing.id,
          file,
          onProgress: (pct) => setEditorUploadProgress(pct),
        });

        accumulatedImages = [
          result.downloadUrl,
          ...accumulatedImages.filter((u) => u !== result.downloadUrl),
        ].slice(0, 6);

        setEditing((prev) =>
          prev
            ? {
                ...prev,
                image: accumulatedImages[0] ?? '',
                images: accumulatedImages,
              }
            : null
        );
      }

      setFeedback({
        type: 'success',
        message: 'ছবি Firebase Storage-এ সফলভাবে আপলোড হয়েছে। পরিবর্তন স্থায়ী করতে "সংরক্ষণ করুন" চাপুন।',
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'ছবি আপলোড ব্যর্থ হয়েছে। ফাইল ফরম্যাট ও Firebase Storage যাচাই করুন।';
      setEditorUploadError(msg);
    } finally {
      if (activePreviewUrl) {
        URL.revokeObjectURL(activePreviewUrl);
      }
      setEditorUploadPreviewUrl(null);
      setEditorUploadProgress(null);
      setEditorUploadLabel('');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    await uploadProductFilesToStorage(fileList);
  };

  const handleQuickRowImageUpload = async (
    prod: Product,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;
    setUploadingRowId(prod.id);
    setRowUploadProgress(5);
    setFeedback(null);
    try {
      const uploaded = await uploadCatalogImageToStorage({
        folder: 'products',
        entityId: prod.id,
        file,
        onProgress: (pct) => setRowUploadProgress(pct),
      });
      const firestore = requireDb();
      const existingList = Array.isArray(prod.images) ? prod.images.filter(Boolean) : [];
      const nextImages = [
        uploaded.downloadUrl,
        ...existingList.filter((u) => u !== uploaded.downloadUrl),
      ].slice(0, 6);
      await updateDoc(doc(firestore, 'products', prod.id), {
        image: uploaded.downloadUrl,
        images: nextImages,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        'image_upload',
        'products',
        prod.id,
        prod.nameEn || prod.name,
        `Uploaded photo to Firebase Storage for ${prod.nameBn || prod.name}`
      );
      setFeedback({
        type: 'success',
        message: `"${prod.nameBn || prod.name}" এর ছবি Firebase Storage-এ সফলভাবে আপডেট হয়েছে।`,
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'ছবি আপলোড ব্যর্থ হয়েছে।';
      setFeedback({ type: 'error', message: msg });
      try {
        handleFirestoreError(err, OperationType.WRITE, `products/${prod.id}`);
      } catch {
        // Logged
      }
    } finally {
      setUploadingRowId(null);
      setRowUploadProgress(null);
    }
  };

  const handleMasterImportClick = async () => {
    setFeedback(null);
    try {
      const summary = await importProductMasterList();
      setFeedback({
        type: 'success',
        message: `মাস্টার তালিকা সিঙ্ক সম্পন্ন: মোট ${summary.totalMasterCount}টি, নতুন যোগ ${summary.newlyAddedCount}টি, স্কিপ (বিদ্যমান) ${summary.skippedExistingCount}টি।`,
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'মাস্টার প্রোডাক্ট তালিকা ইমপোর্ট করতে সমস্যা হয়েছে।',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    const nameBn = editing.name.trim();
    const nameEn = editing.nameEn.trim();
    if (!nameBn) {
      setFeedback({ type: 'error', message: 'অনুগ্রহ করে বাংলা নাম দিন।' });
      return;
    }
    if (!nameEn) {
      setFeedback({ type: 'error', message: 'অনুগ্রহ করে English Name দিন।' });
      return;
    }
    if (editorUploadProgress !== null) {
      setFeedback({
        type: 'error',
        message: 'ছবি আপলোড সম্পন্ন হওয়া পর্যন্ত অনুগ্রহ করে অপেক্ষা করুন।',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    const nextImages = editing.images.filter(Boolean).slice(0, 6);
    const primaryImage = nextImages[0] ?? '';

    try {
      const firestore = requireDb();

      // Safe image-only update guard: if admin only uploaded/changed photo, touch ONLY image fields
      if (
        !isNew &&
        originalSnapshot &&
        serializeNonImageState(editing, ingredientsText, sizesText) === originalSnapshot
      ) {
        await updateDoc(doc(firestore, 'products', editing.id), {
          image: primaryImage,
          images: nextImages,
          updatedAt: serverTimestamp(),
        });
        await logAdminActivity(
          'image_update',
          'products',
          editing.id,
          nameEn,
          `Updated product photo only for ${nameBn}`
        );
        setEditing(null);
        setFeedback({ type: 'success', message: 'পণ্যের ছবি নিরাপদে সংরক্ষণ করা হয়েছে।' });
        return;
      }

      const resolvedCategorySlug = toSlug(
        editing.category.trim() || allCategories[0]?.slug || 'custom-cake'
      );
      const catObj = allCategories.find((c) => c.slug === resolvedCategorySlug);
      const catText = catObj ? getCategoryText(catObj) : null;
      const slug = toSlug(editing.slug.trim() || nameEn || nameBn);
      const ingredients = ingredientsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 25);
      const sizes = sizesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);

      const resolvedUnit = (editing.unit ?? editing.priceUnit).trim() || 'Piece';
      const shortDescEn = (editing.shortDescriptionEn ?? '').trim();
      const shortDescBn = editing.shortDescription.trim() || shortDescEn || nameBn;
      const fullDescEn = (editing.descriptionEn ?? '').trim() || shortDescEn;
      const fullDescBn = editing.description.trim() || shortDescBn || fullDescEn || nameBn;
      const rawPrice = Number(editing.price);
      const numericPrice = Number.isFinite(rawPrice)
        ? Math.min(1000000, Math.max(0, rawPrice))
        : 0;
      const rawDisplayOrder = Number(editing.display_order);
      const safeDisplayOrder = Number.isFinite(rawDisplayOrder)
        ? Math.min(10000, Math.max(0, Math.round(rawDisplayOrder)))
        : 1;

      const payload: Record<string, unknown> = {
        id: editing.id,
        name: nameBn.slice(0, 160),
        nameBn: nameBn.slice(0, 160),
        nameEn: nameEn.slice(0, 160),
        name_bn: nameBn.slice(0, 160),
        name_en: nameEn.slice(0, 160),
        slug,
        category: resolvedCategorySlug,
        categoryName: (editing.categoryName || catText?.nameBn || resolvedCategorySlug).slice(0, 120),
        categoryNameEn: (editing.categoryNameEn || catText?.nameEn || '').slice(0, 120),
        productType: (editing.productType.trim() || 'Bakery & Sweets').slice(0, 120),
        price: numericPrice,
        priceUnit: resolvedUnit.slice(0, 60),
        unit: resolvedUnit.slice(0, 60),
        shortDescription: shortDescBn.slice(0, 300),
        shortDescriptionEn: shortDescEn.slice(0, 300),
        short_description_bn: shortDescBn.slice(0, 300),
        short_description_en: shortDescEn.slice(0, 300),
        description: fullDescBn.slice(0, 4000),
        descriptionEn: fullDescEn.slice(0, 4000),
        description_bn: fullDescBn.slice(0, 4000),
        description_en: fullDescEn.slice(0, 4000),
        image: primaryImage,
        images: nextImages,
        ingredients,
        sizes,
        weight: editing.weight.trim().slice(0, 80),
        occasions: editing.occasions.slice(0, 15),
        showrooms: editing.showrooms
          .filter((sid) => !CONFIRMED_DEMO_SHOWROOM_IDS.has(sid))
          .slice(0, 20),
        availability: editing.availability,
        importantNotes: editing.importantNotes.trim().slice(0, 800),
        featured: Boolean(editing.featured),
        popular: Boolean(editing.popular),
        visible: editing.visible !== false,
        deleted: Boolean(editing.deleted),
        display_order: safeDisplayOrder,
        status: editing.deleted ? 'archived' : editing.visible === false ? 'draft' : 'published',
        updatedAt: serverTimestamp(),
      };

      if (editing.masterKey) {
        payload.masterKey = editing.masterKey;
      }

      const hasValidOldPrice =
        typeof editing.old_price === 'number' &&
        Number.isFinite(editing.old_price) &&
        editing.old_price > 0;
      if (hasValidOldPrice) {
        payload.old_price = editing.old_price;
      } else if (!isNew) {
        payload.old_price = deleteField();
      }

      const trimmedDiscount = editing.discount?.trim() ?? '';
      if (trimmedDiscount) {
        payload.discount = trimmedDiscount.slice(0, 60);
      } else if (!isNew) {
        payload.discount = '';
      }

      const trimmedPriceLabel = editing.price_label?.trim() ?? '';
      if (trimmedPriceLabel) {
        payload.price_label = trimmedPriceLabel.slice(0, 80);
      } else if (!isNew) {
        payload.price_label = '';
      }

      if (isNew) {
        await setDoc(doc(firestore, 'products', editing.id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'products', editing.id, nameEn, `Created product ${nameBn}`);
      } else {
        await updateDoc(doc(firestore, 'products', editing.id), payload);
        await logAdminActivity('update', 'products', editing.id, nameEn, `Updated product ${nameBn}`);
      }
      setEditing(null);
      setFeedback({ type: 'success', message: 'পণ্য সফলভাবে সংরক্ষণ করা হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'সংরক্ষণে সমস্যা হয়েছে। ফিল্ডগুলোর তথ্য ও Firebase অনুমতি যাচাই করুন।',
      });
      try {
        handleFirestoreError(err, OperationType.WRITE, `products/${editing.id}`);
      } catch {
        // Logged
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (prod: Product) => {
    try {
      const firestore = requireDb();
      const nextVis = prod.visible === false;
      await updateDoc(doc(firestore, 'products', prod.id), {
        visible: nextVis,
        status: nextVis ? 'published' : 'draft',
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        nextVis ? 'show' : 'hide',
        'products',
        prod.id,
        prod.nameEn || prod.name
      );
    } catch {
      setFeedback({
        type: 'error',
        message: 'আপডেট করার আগে Firebase সংযোগ ও অনুমতি যাচাই করুন।',
      });
    }
  };

  const toggleArchive = async (prod: Product) => {
    try {
      const firestore = requireDb();
      const nextDeleted = !prod.deleted;
      await updateDoc(doc(firestore, 'products', prod.id), {
        deleted: nextDeleted,
        status: nextDeleted ? 'archived' : 'published',
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        nextDeleted ? 'archive' : 'restore',
        'products',
        prod.id,
        prod.nameEn || prod.name
      );
      setFeedback({
        type: 'success',
        message: nextDeleted ? 'পণ্যটি আর্কাইভ করা হয়েছে।' : 'পণ্যটি পুনরুদ্ধার করা হয়েছে।',
      });
    } catch {
      setFeedback({ type: 'error', message: 'আর্কাইভ পরিবর্তন ব্যর্থ হয়েছে।' });
    }
  };

  const confirmPermanentDelete = async () => {
    if (!pendingDeleteProduct) return;
    const target = pendingDeleteProduct;
    setDeletingProduct(true);
    try {
      const firestore = requireDb();
      await deleteDoc(doc(firestore, 'products', target.id));
      await logAdminActivity('delete', 'products', target.id, target.nameEn || target.name);
      if (editing?.id === target.id) {
        setEditing(null);
      }
      setPendingDeleteProduct(null);
      setFeedback({ type: 'success', message: 'পণ্যটি স্থায়ীভাবে ডিলিট করা হয়েছে।' });
    } catch (err) {
      setFeedback({ type: 'error', message: 'ডিলিট করতে সমস্যা হয়েছে।' });
      try {
        handleFirestoreError(err, OperationType.DELETE, `products/${target.id}`);
      } catch {
        // Logged
      }
    } finally {
      setDeletingProduct(false);
    }
  };

  const toggleFeatured = async (prod: Product) => {
    try {
      const firestore = requireDb();
      await updateDoc(doc(firestore, 'products', prod.id), {
        featured: !prod.featured,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setFeedback({ type: 'error', message: 'Featured পরিবর্তন ব্যর্থ হয়েছে।' });
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allProducts.filter((p) => {
      if (filterMode === 'active' && (p.deleted || p.visible === false)) return false;
      if (filterMode === 'hidden' && (p.deleted || p.visible !== false)) return false;
      if (filterMode === 'archived' && !p.deleted) return false;
      if (selectedCategoryFilter !== 'all' && p.category !== selectedCategoryFilter) return false;
      const hasImage = Boolean(p.image || (Array.isArray(p.images) && p.images.length > 0));
      if (missingImageOnly && hasImage) return false;

      if (!q) return true;
      const t = getProductText(p, allCategories);
      return (
        t.nameBn.toLowerCase().includes(q) ||
        t.nameEn.toLowerCase().includes(q) ||
        t.categoryNameBn.toLowerCase().includes(q) ||
        t.categoryNameEn.toLowerCase().includes(q) ||
        t.unit.toLowerCase().includes(q)
      );
    });
  }, [allProducts, allCategories, filterMode, selectedCategoryFilter, missingImageOnly, search]);

  const PAGE_SIZE = 40;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Product Management
          </h2>
          <p className="text-xs text-[#57534E]">
            মোট {allProducts.length}টি পণ্য · সরাসরি ছবি আপলোড, বাংলা ও English নাম, একক এবং মূল্য ব্যবস্থাপনা করুন।
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26]"
          >
            <Plus className="h-4 w-4" />
            <span>নতুন পণ্য যোগ করুন</span>
          </button>
        )}
      </div>

      {/* Authoritative Product Master List Sync Banner */}
      {canAdd && (
        <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                <Database className="h-4 w-4 text-[#DC1F26]" />
                <span>Product Master List Status (১৩৬টি পণ্য)</span>
              </div>
              <p className="text-xs text-[#57534E]">
                সিঙ্কড:{' '}
                <strong className="font-mono text-[#1C1917]">
                  {masterImportStats.syncedCount}/{masterImportStats.totalMaster}
                </strong>{' '}
                · অনুপস্থিত:{' '}
                <strong className="font-mono text-[#DC1F26]">
                  {masterImportStats.missingCount}
                </strong>{' '}
                · ছবি ছাড়া পণ্য:{' '}
                <strong className="font-mono text-amber-700">
                  {masterImportStats.missingImageCount}
                </strong>
              </p>
              {lastMasterImportSummary && (
                <p className="text-[11px] font-medium text-emerald-700">
                  সর্বশেষ সিঙ্ক: মোট {lastMasterImportSummary.totalMasterCount} · পূর্বে ছিল{' '}
                  {lastMasterImportSummary.existingProductCount} · নতুন যোগ{' '}
                  {lastMasterImportSummary.newlyAddedCount} · স্কিপ{' '}
                  {lastMasterImportSummary.skippedExistingCount}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleMasterImportClick}
              disabled={masterImportRunning}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[#1C1917] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:bg-[#1C1917] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${masterImportRunning ? 'animate-spin' : ''}`}
              />
              <span>
                {masterImportRunning
                  ? 'ইমপোর্ট হচ্ছে...'
                  : masterImportStats.missingCount > 0
                  ? `মাস্টার তালিকা ইমপোর্ট করুন (${masterImportStats.missingCount}টি বাকি)`
                  : 'মাস্টার তালিকা পুনরায় যাচাই করুন'}
              </span>
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={handleSave}
          className="rounded-2xl border border-[#D6D3D1] bg-white p-5 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between border-b border-[#F5F4F0] pb-3">
            <h3 className="font-display text-xl font-bold text-[#1C1917]">
              {isNew ? 'নতুন পণ্য যোগ করুন' : `সম্পাদনা: ${editing.name}`}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isNew && (
            <div className="mb-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
                Product Information
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <span className="block text-[10px] text-[#78716C]">বাংলা নাম</span>
                  <span className="font-semibold text-[#1C1917]">{editing.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">English Name</span>
                  <span className="font-semibold text-[#1C1917]">{editing.nameEn}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Category</span>
                  <span className="font-semibold text-[#1C1917]">{editing.categoryName}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Unit</span>
                  <span className="font-semibold text-[#1C1917]">
                    {editing.unit || editing.priceUnit}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Price</span>
                  <span className="font-mono font-bold text-[#1C1917]">
                    ৳{Number(editing.price) || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Image Status</span>
                  <span
                    className={`font-semibold ${
                      editing.images.length > 0 ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {editing.images.length > 0
                      ? `${editing.images.length}টি ছবি যুক্ত`
                      : 'ছবি আপলোড বাকি'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Product Name (বাংলা) *
              </label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    nameBn: e.target.value,
                    name_bn: e.target.value,
                  })
                }
                placeholder="যেমন: চকলেট কেক"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Product Name (English) *
              </label>
              <input
                type="text"
                value={editing.nameEn}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    nameEn: e.target.value,
                    name_en: e.target.value,
                  })
                }
                placeholder="e.g. Chocolate Cake"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Category *
              </label>
              <select
                value={editing.category}
                onChange={(e) => {
                  const nextCat = allCategories.find((c) => c.slug === e.target.value);
                  const ct = nextCat ? getCategoryText(nextCat) : null;
                  setEditing({
                    ...editing,
                    category: e.target.value,
                    categoryName: ct?.nameBn || editing.categoryName,
                    categoryNameEn: ct?.nameEn || editing.categoryNameEn,
                  });
                }}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              >
                {allCategories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name} ({c.nameEn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                মূল্য (৳ BDT) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Old Price (Optional ৳)
              </label>
              <input
                type="number"
                min={0}
                value={editing.old_price ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    old_price: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="পূর্বের দাম"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Discount / Price Label
              </label>
              <input
                type="text"
                value={editing.discount ?? ''}
                onChange={(e) => setEditing({ ...editing, discount: e.target.value })}
                placeholder="যেমন: 10% OFF বা Festive Offer"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                একক / Unit (যেমন: Piece, Kg, Box)
              </label>
              <input
                type="text"
                value={editing.unit ?? editing.priceUnit}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    unit: e.target.value,
                    priceUnit: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Custom Price Label (Optional)
              </label>
              <input
                type="text"
                value={editing.price_label ?? ''}
                onChange={(e) => setEditing({ ...editing, price_label: e.target.value })}
                placeholder="যেমন: ৳১,২০০ থেকে শুরু"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Availability
              </label>
              <select
                value={editing.availability}
                onChange={(e) =>
                  setEditing({ ...editing, availability: e.target.value as ProductAvailability })
                }
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              >
                <option value="In Showroom">In Showroom</option>
                <option value="Pre-Order at Showroom">Pre-Order at Showroom</option>
                <option value="Seasonal">Seasonal</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Product Type
              </label>
              <input
                type="text"
                value={editing.productType}
                onChange={(e) => setEditing({ ...editing, productType: e.target.value })}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                ওজন / Weight
              </label>
              <input
                type="text"
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                placeholder="যেমন: ১ কেজি"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Display Order &amp; URL Slug
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={editing.display_order ?? 1}
                  onChange={(e) =>
                    setEditing({ ...editing, display_order: Number(e.target.value) })
                  }
                  className="w-20 rounded-lg border border-[#D6D3D1] px-2 py-2 font-mono text-xs"
                />
                <input
                  type="text"
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="auto-slug"
                  className="flex-1 rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Short Description (বাংলা)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={editing.shortDescription}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      shortDescription: e.target.value,
                      short_description_bn: e.target.value,
                    })
                  }
                  placeholder="বাংলা সংক্ষিপ্ত বিবরণ"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Short Description (English)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={editing.shortDescriptionEn ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      shortDescriptionEn: e.target.value,
                      short_description_en: e.target.value,
                    })
                  }
                  placeholder="English short summary"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Full Description (বাংলা)
                </label>
                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      description: e.target.value,
                      description_bn: e.target.value,
                    })
                  }
                  placeholder="বাংলা বিস্তারিত বিবরণ"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Full Description (English)
                </label>
                <textarea
                  rows={3}
                  value={editing.descriptionEn ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      descriptionEn: e.target.value,
                      description_en: e.target.value,
                    })
                  }
                  placeholder="Full description in English"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                উপাদান (কমা দিয়ে আলাদা করুন)
              </label>
              <input
                type="text"
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                placeholder="দুধ, ছানা, জাফরান, পেস্তা"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                সাইজ / ভ্যারিয়েন্ট (কমা দিয়ে আলাদা করুন)
              </label>
              <input
                type="text"
                value={sizesText}
                onChange={(e) => setSizesText(e.target.value)}
                placeholder="500g Box, 1kg Box"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                গুরুত্বপূর্ণ নোট (Important Notes)
              </label>
              <input
                type="text"
                value={editing.importantNotes}
                onChange={(e) =>
                  setEditing({ ...editing, importantNotes: e.target.value })
                }
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            {/* Occasions Checkboxes */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="mb-1.5 text-xs font-semibold text-[#1C1917]">উপলক্ষ নির্বাচন করুন</p>
              <div className="flex flex-wrap gap-2">
                {allOccasions.map((occ) => {
                  const checked = editing.occasions.includes(occ.slug);
                  return (
                    <button
                      key={occ.id}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          occasions: checked
                            ? editing.occasions.filter((o) => o !== occ.slug)
                            : [...editing.occasions, occ.slug],
                        })
                      }
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${
                        checked
                          ? 'border-[#1C1917] bg-[#1C1917] text-white'
                          : 'border-[#E7E5E4] bg-[#FAFAF8] text-[#44403C]'
                      }`}
                    >
                      <span>{occ.icon}</span>
                      <span>{occ.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product Images (Firebase Storage Drag-and-Drop & Multi-Image Uploader) */}
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#1C1917]">
                    পণ্যের ছবি (Firebase Storage Upload)
                  </p>
                  <p className="text-[11px] text-[#57534E]">
                    JPG, JPEG, PNG বা WEBP ফরম্যাট (সর্বোচ্চ 5 MB/ছবি, সর্বোচ্চ ৬টি ছবি)। প্রথম ছবিটি প্রধান থাম্বনেইল হিসেবে দেখাবে।
                  </p>
                </div>
                <span className="font-mono text-[11px] font-semibold text-[#57534E]">
                  {editing.images.length}/6 ছবি
                </span>
              </div>

              {editorUploadError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{editorUploadError}</span>
                </div>
              )}

              {editorUploadProgress !== null && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#E7E5E4] bg-white p-3">
                  {editorUploadPreviewUrl && (
                    <img
                      src={editorUploadPreviewUrl}
                      alt="Selected preview"
                      className="h-12 w-16 shrink-0 rounded-md border border-[#E7E5E4] object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#1C1917]">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#DC1F26]" />
                        <span className="truncate">আপলোড হচ্ছে: {editorUploadLabel}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[#DC1F26]">
                        {editorUploadProgress}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F4F0]">
                      <div
                        className="h-full bg-[#DC1F26] transition-all duration-150"
                        style={{ width: `${editorUploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {editorUploadPreviewUrl && editorUploadProgress !== null && (
                  <div className="relative flex flex-col overflow-hidden rounded-lg border border-dashed border-[#DC1F26] bg-white">
                    <div className="relative aspect-[4/3] w-full bg-[#F5F4F0]">
                      <img
                        src={editorUploadPreviewUrl}
                        alt="Uploading preview"
                        className="h-full w-full object-cover opacity-75"
                      />
                      <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-white">
                        {editorUploadProgress}% আপলোড...
                      </span>
                    </div>
                  </div>
                )}
                {editing.images.map((img, i) => (
                  <div
                    key={`${img.slice(0, 32)}-${i}`}
                    className={`group relative flex flex-col overflow-hidden rounded-lg border bg-white ${
                      i === 0 ? 'border-[#DC1F26]' : 'border-[#D6D3D1]'
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full bg-[#F5F4F0]">
                      <img
                        src={resolveAssetUrl(img)}
                        alt={`Product preview ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-[#1C1917]/85 px-1.5 py-0.5 text-[9px] font-bold text-[#FACC15]">
                          প্রধান ছবি
                        </span>
                      )}
                      <button
                        type="button"
                        title="তালিকা থেকে সরান"
                        onClick={() => {
                          const updated = editing.images.filter((_, idx) => idx !== i);
                          setEditing({
                            ...editing,
                            image: updated[0] ?? '',
                            images: updated,
                          });
                        }}
                        className="absolute right-1.5 top-1.5 cursor-pointer rounded-full bg-black/75 p-1 text-white transition-colors hover:bg-[#DC1F26]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const reordered = [
                            img,
                            ...editing.images.filter((_, idx) => idx !== i),
                          ];
                          setEditing({
                            ...editing,
                            image: reordered[0] ?? '',
                            images: reordered,
                          });
                        }}
                        className="cursor-pointer border-t border-[#F5F4F0] bg-white px-2 py-1 text-[10px] font-semibold text-[#57534E] hover:bg-[#FAFAF8] hover:text-[#DC1F26]"
                      >
                        প্রধান করুন
                      </button>
                    )}
                  </div>
                ))}

                {editing.images.length < 6 && (
                  <label
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      setDragActive(false);
                      const dropped = ev.dataTransfer.files
                        ? Array.from(ev.dataTransfer.files)
                        : [];
                      void uploadProductFilesToStorage(dropped);
                    }}
                    className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center text-[11px] font-semibold transition-colors ${
                      dragActive
                        ? 'border-[#DC1F26] bg-red-50/50 text-[#DC1F26]'
                        : 'border-[#D6D3D1] bg-white text-[#57534E] hover:border-[#DC1F26] hover:text-[#1C1917]'
                    }`}
                  >
                    {editorUploadProgress !== null ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[#DC1F26]" />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-[#DC1F26]" />
                    )}
                    <span>
                      {editorUploadProgress !== null ? 'আপলোড হচ্ছে...' : 'ছবি যোগ / টেনে আনুন'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      disabled={editorUploadProgress !== null}
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap items-center gap-6 sm:col-span-2 lg:col-span-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={editing.featured}
                  onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                />
                <span>Featured Product</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={editing.popular}
                  onChange={(e) => setEditing({ ...editing, popular: e.target.checked })}
                />
                <span>Popular Product</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={editing.visible !== false}
                  onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
                />
                <span>Visible on Storefront</span>
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3 border-t border-[#F5F4F0] pt-4">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter */}
      <div className="rounded-xl border border-[#E7E5E4] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E5E4] p-4">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="পণ্য খুঁজুন (বাংলা বা English)..."
              className="w-full max-w-xs rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
            <select
              value={selectedCategoryFilter}
              onChange={(e) => {
                setSelectedCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="all">সকল ক্যাটাগরি</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setMissingImageOnly((v) => !v);
                setPage(1);
              }}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                missingImageOnly
                  ? 'border-amber-600 bg-amber-50 text-amber-800'
                  : 'border-[#D6D3D1] bg-[#FAFAF8] text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <ImageOff className="h-3.5 w-3.5" />
              <span>ছবি নেই ({masterImportStats.missingImageCount})</span>
            </button>
          </div>
          <div className="flex gap-1.5 text-xs">
            {(['active', 'hidden', 'archived', 'all'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setFilterMode(mode);
                  setPage(1);
                }}
                className={`cursor-pointer rounded-md px-3 py-1.5 font-semibold capitalize ${
                  filterMode === mode
                    ? 'bg-[#1C1917] text-white'
                    : 'bg-[#F5F4F0] text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] bg-[#FAFAF8] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">পণ্য ও ছবি</th>
                <th className="px-4 py-3 font-semibold">ক্যাটাগরি</th>
                <th className="px-4 py-3 font-semibold">একক</th>
                <th className="px-4 py-3 font-semibold">মূল্য</th>
                <th className="px-4 py-3 font-semibold">দৃশ্যমানতা</th>
                <th className="px-4 py-3 font-semibold">Featured</th>
                <th className="px-4 py-3 text-right font-semibold">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#78716C]">
                    কোনো পণ্য পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                paginated.map((p) => {
                  const thumbSrc = p.images?.[0] || p.image || '';
                  const pt = getProductText(p, allCategories);
                  return (
                    <tr key={p.id} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumbSrc ? (
                            <img
                              src={resolveAssetUrl(thumbSrc)}
                              alt={pt.nameBn}
                              className="h-10 w-12 shrink-0 rounded-md border border-[#E7E5E4] object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-amber-400 bg-amber-50 text-amber-700">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1C1917]">{pt.nameBn}</p>
                            <p className="text-[11px] text-[#78716C]">{pt.nameEn}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#44403C]">
                        {p.categoryName || pt.categoryNameBn}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#57534E]">
                        {pt.unit || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums font-semibold text-[#1C1917]">
                        {formatBdtPrice(p.price)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => canEdit && toggleVisibility(p)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${
                            canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                          } ${
                            p.visible !== false
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-[#F5F4F0] text-[#78716C]'
                          }`}
                        >
                          {p.visible !== false ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                          <span>{p.visible !== false ? 'Visible' : 'Hidden'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => canEdit && toggleFeatured(p)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                            canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                          } ${
                            p.featured
                              ? 'bg-[#FEF9C3] text-[#854D0E]'
                              : 'bg-[#F5F4F0] text-[#78716C]'
                          }`}
                        >
                          <Star className="h-3 w-3" />
                          <span>{p.featured ? 'Featured' : 'Standard'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canEdit && (
                            <>
                              <label
                                title="Firebase Storage-এ ছবি আপলোড করুন"
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                  thumbSrc
                                    ? 'border-[#E7E5E4] text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917]'
                                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500'
                                }`}
                              >
                                {uploadingRowId === p.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
                                ) : (
                                  <Camera className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden sm:inline">
                                  {uploadingRowId === p.id
                                    ? rowUploadProgress !== null
                                      ? `${rowUploadProgress}%`
                                      : 'আপলোড...'
                                    : thumbSrc
                                    ? 'ছবি বদলান'
                                    : 'ছবি যোগ'}
                                </span>
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                  disabled={uploadingRowId === p.id}
                                  onChange={(ev) => handleQuickRowImageUpload(p, ev)}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => openEditor(p)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#1C1917] hover:border-[#DC1F26]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title={p.deleted ? 'Restore' : 'Safe Archive'}
                                onClick={() => toggleArchive(p)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#57534E] hover:border-[#1C1917]"
                              >
                                {p.deleted ? (
                                  <RotateCcw className="h-3.5 w-3.5 text-emerald-700" />
                                ) : (
                                  <Archive className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </>
                          )}
                          {p.deleted && canDelete && (
                            <button
                              type="button"
                              title="Delete Permanently"
                              onClick={() => setPendingDeleteProduct(p)}
                              className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E7E5E4] px-4 py-3 text-xs text-[#57534E]">
            <span>
              দেখানো হচ্ছে {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length}টি পণ্য
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                পূর্ববর্তী
              </button>
              <span className="px-2 font-mono font-semibold">
                {safePage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                পরবর্তী
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Safe Permanent Delete Confirmation Modal */}
      {pendingDeleteProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#DC1F26]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  পণ্য স্থায়ীভাবে ডিলিট করবেন?
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  আপনি{' '}
                  <strong className="text-[#1C1917]">
                    {pendingDeleteProduct.nameBn || pendingDeleteProduct.name} (
                    {pendingDeleteProduct.nameEn})
                  </strong>{' '}
                  স্থায়ীভাবে ডিলিট করতে যাচ্ছেন। ডিলিট করলে এটি আর পুনরুদ্ধার করা যাবে না।
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5 border-t border-[#F5F4F0] pt-4">
              <button
                type="button"
                disabled={deletingProduct}
                onClick={() => setPendingDeleteProduct(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAFAF8]"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={deletingProduct}
                onClick={() => void confirmPermanentDelete()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {deletingProduct && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>স্থায়ীভাবে ডিলিট করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// 2. CATEGORY MANAGEMENT
// ========================
export function AdminCategoriesPanel() {
  const { allCategories, logAdminActivity } = useStore();
  const [editing, setEditing] = useState<Category | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [catUploading, setCatUploading] = useState(false);
  const [catUploadPct, setCatUploadPct] = useState<number | null>(null);
  const [catPreviewUrl, setCatPreviewUrl] = useState<string | null>(null);
  const [pendingDeleteCat, setPendingDeleteCat] = useState<Category | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const startNew = () => {
    setIsNew(true);
    setMsg(null);
    setEditing({
      id: `cat-${Date.now()}`,
      name: '',
      nameEn: '',
      name_bn: '',
      name_en: '',
      slug: '',
      description: '',
      descriptionEn: '',
      description_bn: '',
      description_en: '',
      image: '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
      order: allCategories.length + 1,
      visible: true,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editing) return;
    const validationError = validateCatalogImageFile(file);
    if (validationError) {
      setMsg(validationError);
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setCatPreviewUrl(localUrl);
    setCatUploading(true);
    setCatUploadPct(1);
    setMsg(null);
    try {
      const result = await uploadCatalogImageToStorage({
        folder: 'categories',
        entityId: editing.id,
        file,
        onProgress: (pct) => setCatUploadPct(pct),
      });
      setEditing((prev) => (prev ? { ...prev, image: result.downloadUrl } : null));
    } catch (err) {
      setMsg(
        err instanceof Error && err.message
          ? err.message
          : 'ক্যাটাগরির ছবি আপলোড ব্যর্থ হয়েছে।'
      );
    } finally {
      URL.revokeObjectURL(localUrl);
      setCatPreviewUrl(null);
      setCatUploading(false);
      setCatUploadPct(null);
    }
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nameBn = editing.name.trim();
    const nameEn = editing.nameEn.trim();
    if (!nameBn) {
      setMsg('অনুগ্রহ করে বাংলা নাম দিন।');
      return;
    }
    if (!nameEn) {
      setMsg('অনুগ্রহ করে English Name দিন।');
      return;
    }

    const slug = toSlug(editing.slug.trim() || nameEn || nameBn);
    const descEn = (editing.descriptionEn ?? '').trim();
    const descBn = editing.description.trim() || descEn || nameBn;

    const payload = {
      id: editing.id,
      name: nameBn,
      nameEn,
      name_bn: nameBn,
      name_en: nameEn,
      slug,
      description: descBn,
      descriptionEn: descEn,
      description_bn: descBn,
      description_en: descEn,
      image: editing.image,
      order: Number(editing.order) || 1,
      visible: editing.visible !== false,
      deleted: Boolean(editing.deleted),
      updatedAt: serverTimestamp(),
    };
    try {
      const firestore = requireDb();
      if (isNew) {
        await setDoc(doc(firestore, 'categories', editing.id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'categories', editing.id, nameEn);
      } else {
        await updateDoc(doc(firestore, 'categories', editing.id), payload);
        await logAdminActivity('update', 'categories', editing.id, nameEn);
      }
      setEditing(null);
      setMsg('ক্যাটাগরি সংরক্ষণ করা হয়েছে।');
    } catch {
      setMsg('ক্যাটাগরি সেভ করতে সমস্যা হয়েছে।');
    }
  };

  const toggleCategoryVisibility = async (cat: Category) => {
    try {
      const firestore = requireDb();
      await updateDoc(doc(firestore, 'categories', cat.id), {
        visible: cat.visible === false,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setMsg('স্ট্যাটাস পরিবর্তন করা যায়নি।');
    }
  };

  const removeCategory = async (id: string) => {
    try {
      const firestore = requireDb();
      await deleteDoc(doc(firestore, 'categories', id));
      await logAdminActivity('delete', 'categories', id, id);
      setMsg('ক্যাটাগরি ডিলিট করা হয়েছে।');
    } catch {
      setMsg('ডিলিট করা যায়নি।');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Category Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English নামে ক্যাটাগরি যোগ, বিবরণ পরিবর্তন, Hide/Show ও অর্ডার সাজান।
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
          <Plus className="h-4 w-4" />
          <span>নতুন ক্যাটাগরি</span>
        </button>
      </div>

      {msg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#B91C1C]">
          {msg}
        </p>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={saveCategory}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">নাম (বাংলা) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: কাস্টমাইজ কেক"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Name (English) *</label>
            <input
              type="text"
              value={editing.nameEn}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Customized Cakes"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Order</label>
            <input
              type="number"
              value={editing.order}
              onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              ছবি পরিবর্তন (Firebase Storage · JPG/PNG/WEBP)
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26]">
                {catUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <span>
                  {catUploading
                    ? `আপলোড হচ্ছে ${catUploadPct ?? 0}%`
                    : 'ছবি নির্বাচন করুন'}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  disabled={catUploading}
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
              {(catPreviewUrl || editing.image) && (
                <img
                  src={catPreviewUrl || resolveAssetUrl(editing.image)}
                  alt="Category preview"
                  className="h-10 w-14 rounded-md border border-[#E7E5E4] object-cover"
                />
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
            <textarea
              rows={2}
              value={editing.description}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  description: e.target.value,
                  description_bn: e.target.value,
                })
              }
              placeholder="বাংলা বিবরণ"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (English)</label>
            <textarea
              rows={2}
              value={editing.descriptionEn ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  descriptionEn: e.target.value,
                  description_en: e.target.value,
                })
              }
              placeholder="English description"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold sm:col-span-2">
            <input
              type="checkbox"
              checked={editing.visible !== false}
              onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
            />
            <span>Visible on Storefront</span>
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
            >
              সংরক্ষণ
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allCategories.map((cat) => {
          const ct = getCategoryText(cat);
          return (
            <div
              key={cat.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-white ${
                cat.visible === false ? 'border-amber-300 opacity-75' : 'border-[#E7E5E4]'
              }`}
            >
              <img
                src={resolveAssetUrl(cat.image)}
                alt={ct.nameBn}
                className="aspect-[16/9] w-full object-cover"
              />
              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#78716C]">
                    <span>Order #{cat.order}</span>
                    <span>{cat.visible === false ? 'Hidden' : cat.slug}</span>
                  </div>
                  <h3 className="font-display mt-1 text-xl font-bold text-[#1C1917]">
                    {ct.nameBn}
                  </h3>
                  {ct.nameEn && (
                    <p className="text-xs font-semibold text-[#DC1F26]">{ct.nameEn}</p>
                  )}
                  <p className="mt-1.5 text-xs text-[#57534E]">{ct.descriptionBn}</p>
                  {ct.descriptionEn && (
                    <p className="mt-1 text-[11px] text-[#78716C]">{ct.descriptionEn}</p>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-[#F5F4F0] pt-3">
                  <button
                    type="button"
                    onClick={() => toggleCategoryVisibility(cat)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-xs font-medium text-[#57534E]"
                  >
                    {cat.visible === false ? 'Show' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false);
                      setMsg(null);
                      setEditing({
                        ...cat,
                        name: ct.nameBn,
                        nameEn: ct.nameEn,
                        name_bn: ct.nameBn,
                        name_en: ct.nameEn,
                        description: ct.descriptionBn,
                        descriptionEn: ct.descriptionEn,
                        description_bn: ct.descriptionBn,
                        description_en: ct.descriptionEn,
                      });
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-3 py-1 text-xs font-medium hover:border-[#DC1F26]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteCat(cat)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pendingDeleteCat && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <h3 className="font-display text-xl font-bold text-[#1C1917]">
              ক্যাটাগরি ডিলিট করবেন?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
              আপনি <strong>{pendingDeleteCat.name}</strong> ক্যাটাগরিটি ডিলিট করতে যাচ্ছেন। এটি নিশ্চিত করতে নিচে চাপুন।
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteCat(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917]"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingDeleteCat.id;
                  setPendingDeleteCat(null);
                  void removeCategory(id);
                }}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
              >
                ডিলিট করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// 3. OCCASION MANAGEMENT
// ========================
export function AdminOccasionsPanel() {
  const { allOccasions, allProducts, logAdminActivity } = useStore();
  const [editing, setEditing] = useState<Occasion | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [assigningSlug, setAssigningSlug] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const saveOccasion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nameBn = editing.name.trim();
    const nameEn = editing.nameEn.trim();
    if (!nameBn) {
      setMsg('অনুগ্রহ করে বাংলা নাম দিন।');
      return;
    }
    if (!nameEn) {
      setMsg('অনুগ্রহ করে English Name দিন।');
      return;
    }

    const slug = editing.slug.trim() || toSlug(nameEn || nameBn);
    const descEn = (editing.descriptionEn ?? '').trim();
    const descBn = editing.description.trim() || descEn || nameBn;

    const payload = {
      id: editing.id,
      name: nameBn,
      nameEn,
      name_bn: nameBn,
      name_en: nameEn,
      slug,
      icon: editing.icon.trim() || '✨',
      description: descBn,
      descriptionEn: descEn,
      description_bn: descBn,
      description_en: descEn,
      order: Number(editing.order) || 1,
      visible: editing.visible !== false,
      updatedAt: serverTimestamp(),
    };
    try {
      const firestore = requireDb();
      if (isNew) {
        await setDoc(doc(firestore, 'occasions', editing.id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'occasions', editing.id, nameEn);
      } else {
        await updateDoc(doc(firestore, 'occasions', editing.id), payload);
        await logAdminActivity('update', 'occasions', editing.id, nameEn);
      }
      setEditing(null);
      setMsg('উপলক্ষ সেভ হয়েছে।');
    } catch {
      setMsg('সেভ করতে সমস্যা হয়েছে।');
    }
  };

  const toggleProductOccasion = async (product: Product, occSlug: string) => {
    const has = product.occasions.includes(occSlug);
    const next = has
      ? product.occasions.filter((o) => o !== occSlug)
      : [...product.occasions, occSlug];
    try {
      const firestore = requireDb();
      await updateDoc(doc(firestore, 'products', product.id), {
        occasions: next,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setMsg('আপডেট করতে প্রথমে ডেমো ক্যাটালগ Firestore-এ সেভ করুন।');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Occasion Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English নামে উপলক্ষ যোগ/সম্পাদনা করুন এবং পণ্য নির্ধারণ করুন।
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsNew(true);
            setMsg(null);
            setEditing({
              id: `occ-${Date.now()}`,
              name: '',
              nameEn: '',
              name_bn: '',
              name_en: '',
              slug: '',
              icon: '🎉',
              description: '',
              descriptionEn: '',
              description_bn: '',
              description_en: '',
              order: allOccasions.length + 1,
              visible: true,
            });
          }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
          <Plus className="h-4 w-4" />
          <span>নতুন উপলক্ষ</span>
        </button>
      </div>

      {msg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#B91C1C]">
          {msg}
        </p>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={saveOccasion}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">Icon (Emoji)</label>
            <input
              type="text"
              value={editing.icon}
              onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">নাম (বাংলা) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: জন্মদিন"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Name (English) *</label>
            <input
              type="text"
              value={editing.nameEn}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Birthday"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
              <input
                type="text"
                value={editing.description}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    description: e.target.value,
                    description_bn: e.target.value,
                  })
                }
                placeholder="বাংলা বিবরণ"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Description (English)</label>
              <input
                type="text"
                value={editing.descriptionEn ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    descriptionEn: e.target.value,
                    description_en: e.target.value,
                  })
                }
                placeholder="English description"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
            >
              সংরক্ষণ
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {allOccasions.map((occ) => {
          const ot = getOccasionText(occ);
          const matchedCount = allProducts.filter((p) => p.occasions.includes(occ.slug)).length;
          return (
            <div
              key={occ.id}
              className="rounded-xl border border-[#E7E5E4] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#1C1917]">
                    {occ.icon} {ot.nameBn}{' '}
                    <span className="text-xs font-normal text-[#78716C]">({ot.nameEn})</span>
                  </h3>
                  <p className="mt-1 text-xs text-[#57534E]">{ot.descriptionBn}</p>
                  {ot.descriptionEn && (
                    <p className="mt-0.5 text-[11px] text-[#78716C]">{ot.descriptionEn}</p>
                  )}
                  <p className="mt-2 font-mono text-[11px] text-[#DC1F26]">
                    {matchedCount} products assigned
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setAssigningSlug(assigningSlug === occ.slug ? null : occ.slug)
                    }
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                  >
                    Assign Products
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false);
                      setMsg(null);
                      setEditing({
                        ...occ,
                        name: ot.nameBn,
                        nameEn: ot.nameEn,
                        name_bn: ot.nameBn,
                        name_en: ot.nameEn,
                        description: ot.descriptionBn,
                        descriptionEn: ot.descriptionEn,
                        description_bn: ot.descriptionBn,
                        description_en: ot.descriptionEn,
                      });
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] p-1 text-[#57534E]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(requireDb(), 'occasions', occ.id));
                      } catch {
                        setMsg('ডিলিট করা যায়নি।');
                      }
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] p-1 text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {assigningSlug === occ.slug && (
                <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto border-t border-[#F5F4F0] pt-3">
                  {allProducts.map((prod) => {
                    const checked = prod.occasions.includes(occ.slug);
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => toggleProductOccasion(prod, occ.slug)}
                        className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#FAFAF8]"
                      >
                        <span className="text-[#1C1917]">
                          {prod.name} {prod.nameEn ? `(${prod.nameEn})` : ''}
                        </span>
                        <span
                          className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                            checked
                              ? 'border-[#DC1F26] bg-[#DC1F26] text-white'
                              : 'border-[#D6D3D1]'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========================
// 4. SHOWROOM MANAGEMENT
// ========================
export function AdminShowroomsPanel() {
  const {
    firestoreShowrooms,
    legacyDemoShowrooms,
    logAdminActivity,
  } = useStore();
  const [editing, setEditing] = useState<Showroom | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [purgingDemoDocs, setPurgingDemoDocs] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const purgeConfirmedDemoShowrooms = async () => {
    if (legacyDemoShowrooms.length === 0) return;
    setPurgingDemoDocs(true);
    setMsg(null);
    try {
      const firestore = requireDb();
      let deletedCount = 0;
      for (const demoDoc of legacyDemoShowrooms) {
        if (!CONFIRMED_DEMO_SHOWROOM_IDS.has(demoDoc.id) && !isDemoOrDummyShowroom(demoDoc)) {
          continue;
        }
        await deleteDoc(doc(firestore, 'showrooms', demoDoc.id));
        await logAdminActivity(
          'delete',
          'showrooms',
          demoDoc.id,
          demoDoc.nameEn || demoDoc.name,
          'Removed confirmed legacy demo showroom record'
        );
        deletedCount += 1;
      }
      setMsg(
        deletedCount > 0
          ? `নিশ্চিতভাবে চিহ্নিত ${deletedCount}টি পুরোনো Demo Showroom ডকুমেন্ট Firestore থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।`
          : 'মুছে ফেলার মতো কোনো Demo ডকুমেন্ট পাওয়া যায়নি।'
      );
    } catch {
      setMsg('Demo ডকুমেন্ট মুছতে সমস্যা হয়েছে। অনুগ্রহ করে আপনার অনুমতি যাচাই করুন।');
    } finally {
      setPurgingDemoDocs(false);
    }
  };

  const saveShowroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    const nameBn = editing.name.trim();
    const nameEn = (editing.nameEn ?? '').trim();
    if (!nameBn) {
      setMsg('অনুগ্রহ করে বাংলা নাম দিন।');
      return;
    }
    if (!nameEn) {
      setMsg('অনুগ্রহ করে English Name দিন।');
      return;
    }

    const areaEn = (editing.areaEn ?? '').trim();
    const areaBn = editing.area.trim() || areaEn;
    if (!areaBn) {
      setMsg('অনুগ্রহ করে শোরুমের এলাকা (Area) লিখুন।');
      return;
    }

    const addressEn = (editing.addressEn ?? '').trim();
    const addressBn = editing.address.trim() || addressEn;
    if (!addressBn) {
      setMsg('অনুগ্রহ করে সম্পূর্ণ ঠিকানা লিখুন।');
      return;
    }

    const phone = editing.phone.trim();
    if (phone.length < 6) {
      setMsg('অনুগ্রহ করে সঠিক ফোন নম্বর লিখুন।');
      return;
    }

    const descEn = (editing.descriptionEn ?? '').trim();
    const descBn = (editing.description ?? '').trim() || descEn;
    const hoursEn = (editing.openingHoursEn ?? '').trim();
    const hoursBn = editing.openingHours.trim() || hoursEn || 'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা';
    const rawLat = Number(editing.lat);
    const rawLng = Number(editing.lng);
    const hasCoords = Number.isFinite(rawLat) && Number.isFinite(rawLng) && (rawLat !== 0 || rawLng !== 0);
    const safeMapUrl =
      editing.mapUrl.trim() ||
      (hasCoords
        ? `https://maps.google.com/?q=${rawLat},${rawLng}`
        : `https://maps.google.com/?q=${encodeURIComponent(addressEn || addressBn)}`);

    const payload: Record<string, unknown> = {
      id: editing.id,
      name: nameBn,
      nameEn,
      name_bn: nameBn,
      name_en: nameEn,
      area: areaBn,
      areaEn,
      address: addressBn,
      addressEn,
      address_bn: addressBn,
      address_en: addressEn,
      description: descBn,
      descriptionEn: descEn,
      description_bn: descBn,
      description_en: descEn,
      phone,
      alternate_phone: (editing.alternate_phone ?? '').trim(),
      email: (editing.email ?? '').trim(),
      openingHours: hoursBn,
      openingHoursEn: hoursEn,
      opening_time: (editing.opening_time ?? '').trim(),
      closing_time: (editing.closing_time ?? '').trim(),
      weekly_holiday: (editing.weekly_holiday ?? '').trim(),
      mapUrl: safeMapUrl,
      lat: Number.isFinite(rawLat) ? rawLat : 0,
      lng: Number.isFinite(rawLng) ? rawLng : 0,
      isMain: Boolean(editing.isMain),
      visible: editing.visible !== false,
      display_order: Number(editing.display_order) || 1,
      updatedAt: serverTimestamp(),
    };
    try {
      const firestore = requireDb();
      if (isNew) {
        await setDoc(doc(firestore, 'showrooms', editing.id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'showrooms', editing.id, nameEn);
      } else {
        await updateDoc(doc(firestore, 'showrooms', editing.id), payload);
        await logAdminActivity('update', 'showrooms', editing.id, nameEn);
      }
      setEditing(null);
      setMsg('শোরুম তথ্য সংরক্ষণ করা হয়েছে।');
    } catch {
      setMsg('সংরক্ষণে সমস্যা হয়েছে।');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Showroom Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English ভাষায় অনুমোদিত শোরুম ও অতিরিক্ত Firestore শাখার তথ্য পরিচালনা করুন।
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsNew(true);
            setMsg(null);
            setEditing({
              id: `showroom-${Date.now()}`,
              name: '',
              nameEn: '',
              name_bn: '',
              name_en: '',
              area: '',
              areaEn: '',
              address: '',
              addressEn: '',
              address_bn: '',
              address_en: '',
              description: '',
              descriptionEn: '',
              description_bn: '',
              description_en: '',
              phone: '',
              alternate_phone: '',
              email: '',
              openingHours: 'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা',
              openingHoursEn: 'Friday – Saturday · 8:00 AM – 10:00 PM',
              opening_time: '08:00 AM',
              closing_time: '10:00 PM',
              weekly_holiday: 'Open Daily',
              mapUrl: '',
              lat: 0,
              lng: 0,
              isMain: false,
              visible: true,
              display_order: CHATTOGRAM_OUTLETS.length + firestoreShowrooms.length + 1,
            });
          }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
          <Plus className="h-4 w-4" />
          <span>নতুন শোরুম</span>
        </button>
      </div>

      {msg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#B91C1C]">
          {msg}
        </p>
      )}

      {legacyDemoShowrooms.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold text-amber-950">
                Firestore-এ পুরোনো Demo Showroom ডকুমেন্ট শনাক্ত হয়েছে ({legacyDemoShowrooms.length}টি)
              </p>
              <p className="mt-1 text-[11px] text-amber-900">
                ওয়েবসাইট UI ও অভিযোগ বক্স থেকে এগুলো ইতিমধ্যেই সম্পূর্ণ লুকানো হয়েছে। ডাটাবেস পরিষ্কার করতে চাইলে নিচের বাটনে ক্লিক করে শুধুমাত্র এই চিহ্নিত Demo রেকর্ডগুলো মুছে দিন (আসল কোনো শোরুম পরিবর্তন হবে না):
              </p>
              <ul className="mt-1.5 list-inside list-disc text-[11px] font-mono text-amber-900">
                {legacyDemoShowrooms.map((d) => (
                  <li key={d.id}>
                    {d.id} — {d.nameEn || d.name}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              disabled={purgingDemoDocs}
              onClick={() => void purgeConfirmedDemoShowrooms()}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {purgingDemoDocs ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>চিহ্নিত Demo ডকুমেন্ট মুছুন</span>
            </button>
          </div>
        </div>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={saveShowroom}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">Showroom Name (বাংলা) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: খুলশী মোড় শোরুম"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Showroom Name (English) *</label>
            <input
              type="text"
              value={editing.nameEn ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Khulshi More Outlet"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Area (বাংলা) *</label>
            <input
              type="text"
              value={editing.area}
              onChange={(e) => setEditing({ ...editing, area: e.target.value })}
              placeholder="যেমন: খুলশী, চট্টগ্রাম"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Area (English)</label>
            <input
              type="text"
              value={editing.areaEn ?? ''}
              onChange={(e) => setEditing({ ...editing, areaEn: e.target.value })}
              placeholder="e.g. Khulshi, Chattogram"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Primary Phone *</label>
            <input
              type="text"
              value={editing.phone}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              placeholder="+8801XXXXXXXXX"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Alternate Phone / Email</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={editing.alternate_phone ?? ''}
                onChange={(e) => setEditing({ ...editing, alternate_phone: e.target.value })}
                placeholder="Alt Phone"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="email"
                value={editing.email ?? ''}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="Branch Email"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Google Maps URL</label>
            <input
              type="url"
              value={editing.mapUrl}
              onChange={(e) => setEditing({ ...editing, mapUrl: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Weekly Holiday</label>
            <input
              type="text"
              value={editing.weekly_holiday ?? ''}
              onChange={(e) => setEditing({ ...editing, weekly_holiday: e.target.value })}
              placeholder="e.g. Open Daily"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Opening Hours (বাংলা) *</label>
            <input
              type="text"
              value={editing.openingHours}
              onChange={(e) => setEditing({ ...editing, openingHours: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Opening Hours (English)</label>
            <input
              type="text"
              value={editing.openingHoursEn ?? ''}
              onChange={(e) => setEditing({ ...editing, openingHoursEn: e.target.value })}
              placeholder="e.g. Daily 8:00 AM – 10:00 PM"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Address (বাংলা) *</label>
            <input
              type="text"
              value={editing.address}
              onChange={(e) =>
                setEditing({ ...editing, address: e.target.value, address_bn: e.target.value })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Address (English)</label>
            <input
              type="text"
              value={editing.addressEn ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, addressEn: e.target.value, address_en: e.target.value })
              }
              placeholder="Full address in English"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
            <input
              type="text"
              value={editing.description ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  description: e.target.value,
                  description_bn: e.target.value,
                })
              }
              placeholder="বাংলা বিবরণ (ঐচ্ছিক)"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (English)</label>
            <input
              type="text"
              value={editing.descriptionEn ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  descriptionEn: e.target.value,
                  description_en: e.target.value,
                })
              }
              placeholder="English description (optional)"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Latitude</label>
            <input
              type="number"
              step="any"
              value={editing.lat}
              onChange={(e) => setEditing({ ...editing, lat: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Longitude</label>
            <input
              type="number"
              step="any"
              value={editing.lng}
              onChange={(e) => setEditing({ ...editing, lng: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-5 sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={editing.isMain}
                onChange={(e) => setEditing({ ...editing, isMain: e.target.checked })}
              />
              <span>Primary Office &amp; Outlet</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={editing.visible !== false}
                onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
              />
              <span>Visible on Website</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
            >
              সংরক্ষণ
            </button>
          </div>
        </form>
      )}

      {/* Firestore Custom Showrooms */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917]">
          অতিরিক্ত ডাইনামিক শোরুম (Firestore)
        </h3>
        {firestoreShowrooms.length === 0 ? (
          <div className="rounded-xl border border-[#E7E5E4] bg-white p-6 text-center text-xs text-[#57534E]">
            Firestore-এ এই মুহূর্তে কোনো অতিরিক্ত শোরুম ডকুমেন্ট নেই। নতুন শোরুম যোগ করতে উপরের “নতুন শোরুম” বাটন ব্যবহার করুন।
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {firestoreShowrooms.map((sr) => {
              const st = getShowroomText(sr);
              return (
                <div key={sr.id} className="rounded-xl border border-[#E7E5E4] bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#DC1F26]">
                        {st.areaBn}
                        {st.areaEn && st.areaEn !== st.areaBn ? ` · ${st.areaEn}` : ''}{' '}
                        {sr.visible === false ? '· (Hidden)' : ''}
                      </p>
                      <h3 className="font-display text-xl font-bold text-[#1C1917]">{st.nameBn}</h3>
                      {st.nameEn && (
                        <p className="text-xs font-medium text-[#78716C]">{st.nameEn}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNew(false);
                          setMsg(null);
                          setEditing({
                            ...sr,
                            name: st.nameBn,
                            nameEn: st.nameEn,
                            name_bn: st.nameBn,
                            name_en: st.nameEn,
                            area: st.areaBn,
                            areaEn: st.areaEn,
                            address: st.addressBn,
                            addressEn: st.addressEn,
                            address_bn: st.addressBn,
                            address_en: st.addressEn,
                            description: st.descriptionBn,
                            descriptionEn: st.descriptionEn,
                            description_bn: st.descriptionBn,
                            description_en: st.descriptionEn,
                            openingHours: st.openingHoursBn,
                            openingHoursEn: st.openingHoursEn,
                          });
                        }}
                        className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#1C1917]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteDoc(doc(requireDb(), 'showrooms', sr.id));
                            await logAdminActivity('delete', 'showrooms', sr.id, st.nameEn || st.nameBn);
                          } catch {
                            setMsg('ডিলিট করা যায়নি।');
                          }
                        }}
                        className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#57534E]">{st.addressBn}</p>
                  {st.addressEn && (
                    <p className="mt-0.5 text-[11px] text-[#78716C]">{st.addressEn}</p>
                  )}
                  <p className="mt-2 font-mono text-xs font-semibold text-[#1C1917]">
                    {sr.phone} {sr.alternate_phone ? `· ${sr.alternate_phone}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-[#78716C]">
                    {st.openingHoursBn}
                    {st.openingHoursEn ? ` · ${st.openingHoursEn}` : ''}
                    {sr.weekly_holiday ? ` · ${sr.weekly_holiday}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approved Official Outlets Reference */}
      <div className="space-y-3 border-t border-[#E7E5E4] pt-5">
        <div>
          <h3 className="text-sm font-bold text-[#1C1917]">
            অনুমোদিত অফিশিয়াল শো-রুম · Official Chattogram Outlets
          </h3>
          <p className="text-[11px] text-[#57534E]">
            ওয়েবসাইটের Our Outlets / আমাদের শো-রুম, Contact ও Complaint Box-এ ব্যবহৃত অনুমোদিত তালিকা।
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CHATTOGRAM_OUTLETS.map((outlet) => (
            <div key={outlet.id} className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-display text-lg font-bold text-[#1C1917]">
                    {outlet.nameBn}
                  </h4>
                  <p className="text-xs font-medium text-[#78716C]">{outlet.nameEn}</p>
                </div>
                {outlet.type && (
                  <span className="text-[11px] font-bold text-[#B91C1C]">
                    {outlet.type}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-[#57534E]">{outlet.addressBn}</p>
              <p className="mt-0.5 text-[11px] text-[#78716C]">{outlet.addressEn}</p>
              <p className="mt-2 font-mono text-xs font-semibold text-[#1C1917]">
                {outlet.phone}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
