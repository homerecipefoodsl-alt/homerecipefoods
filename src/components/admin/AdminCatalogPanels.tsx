import { useState } from 'react';
import {
  Archive,
  Check,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import { resolveAssetUrl } from '../../lib/assets';
import {
  getCategoryText,
  getOccasionText,
  getProductText,
  getShowroomText,
} from '../../lib/bilingual';
import { OperationType, handleFirestoreError, requireDb } from '../../lib/firebase';
import { compressImageToDataUrl, formatBdtPrice, toSlug } from '../../lib/utils';
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
  } = useStore();
  const canAdd = hasPermission('products_add');
  const canEdit = hasPermission('products_edit');
  const canDelete = hasPermission('products_delete');
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'active' | 'hidden' | 'archived' | 'all'>('active');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const emptyProduct = (): Product => ({
    id: `prod-${Date.now()}`,
    name: '',
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
    priceUnit: 'প্রতি পিস',
    shortDescription: '',
    shortDescriptionEn: '',
    short_description_bn: '',
    short_description_en: '',
    description: '',
    descriptionEn: '',
    description_bn: '',
    description_en: '',
    images: [],
    ingredients: [],
    sizes: ['Regular'],
    weight: '',
    occasions: [],
    showrooms: allShowrooms.map((s) => s.id),
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
      setIsNew(false);
      setEditing({
        ...prod,
        name: t.nameBn,
        nameEn: t.nameEn,
        name_bn: t.nameBn,
        name_en: t.nameEn,
        shortDescription: t.shortDescriptionBn,
        shortDescriptionEn: t.shortDescriptionEn,
        short_description_bn: t.shortDescriptionBn,
        short_description_en: t.shortDescriptionEn,
        description: t.descriptionBn,
        descriptionEn: t.descriptionEn,
        description_bn: t.descriptionBn,
        description_en: t.descriptionEn,
        categoryName: t.categoryNameBn,
        categoryNameEn: t.categoryNameEn,
      });
      setIngredientsText(prod.ingredients.join(', '));
      setSizesText(prod.sizes.join(', '));
    } else {
      const fresh = emptyProduct();
      setIsNew(true);
      setEditing(fresh);
      setIngredientsText('');
      setSizesText('Regular');
    }
    setFeedback(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    try {
      const url = await compressImageToDataUrl(file, 900, 0.78);
      setEditing({ ...editing, images: [...editing.images.slice(0, 5), url] });
    } catch {
      setFeedback('ছবি আপলোড ব্যর্থ হয়েছে।');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    const nameBn = editing.name.trim();
    const nameEn = editing.nameEn.trim();
    if (!nameBn) {
      setFeedback('অনুগ্রহ করে বাংলা নাম দিন।');
      return;
    }
    if (!nameEn) {
      setFeedback('অনুগ্রহ করে English Name দিন।');
      return;
    }

    setSaving(true);
    setFeedback(null);

    const catObj = allCategories.find((c) => c.slug === editing.category);
    const catText = catObj ? getCategoryText(catObj) : null;
    const slug = editing.slug.trim() || toSlug(nameEn || nameBn);
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

    const shortDescEn = (editing.shortDescriptionEn ?? '').trim();
    const shortDescBn = editing.shortDescription.trim() || shortDescEn || nameBn;
    const fullDescEn = (editing.descriptionEn ?? '').trim() || shortDescEn;
    const fullDescBn = editing.description.trim() || shortDescBn || fullDescEn || nameBn;

    const payload: Record<string, unknown> = {
      id: editing.id,
      name: nameBn,
      nameEn,
      name_bn: nameBn,
      name_en: nameEn,
      slug,
      category: editing.category,
      categoryName: catText?.nameBn || editing.categoryName,
      categoryNameEn: catText?.nameEn || editing.categoryNameEn || '',
      productType: editing.productType.trim() || 'Bakery & Sweets',
      price: Number(editing.price) || 0,
      priceUnit: editing.priceUnit.trim() || 'প্রতি পিস',
      shortDescription: shortDescBn,
      shortDescriptionEn: shortDescEn,
      short_description_bn: shortDescBn,
      short_description_en: shortDescEn,
      description: fullDescBn,
      descriptionEn: fullDescEn,
      description_bn: fullDescBn,
      description_en: fullDescEn,
      images:
        editing.images.length > 0
          ? editing.images.slice(0, 6)
          : [catObj?.image ?? '/src/assets/images/hero_bakery_clean_1794746110066.jpg'],
      ingredients,
      sizes,
      weight: editing.weight.trim(),
      occasions: editing.occasions.slice(0, 15),
      showrooms: editing.showrooms.slice(0, 20),
      availability: editing.availability,
      importantNotes: editing.importantNotes.trim(),
      featured: Boolean(editing.featured),
      popular: Boolean(editing.popular),
      visible: editing.visible !== false,
      deleted: Boolean(editing.deleted),
      display_order: Number(editing.display_order) || 1,
      status: editing.deleted ? 'archived' : editing.visible === false ? 'draft' : 'published',
      updatedAt: serverTimestamp(),
    };

    if (typeof editing.old_price === 'number' && editing.old_price > 0) {
      payload.old_price = editing.old_price;
    }
    if (editing.discount?.trim()) {
      payload.discount = editing.discount.trim();
    }
    if (editing.price_label?.trim()) {
      payload.price_label = editing.price_label.trim();
    }

    try {
      const firestore = requireDb();
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
      setFeedback('পণ্য সফলভাবে সংরক্ষণ করা হয়েছে।');
    } catch (err) {
      setFeedback('সংরক্ষণে সমস্যা হয়েছে। প্রথমে Firebase সংযোগ ও ডেমো ক্যাটালগ যাচাই করুন।');
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
      setFeedback('আপডেট করার আগে Firebase সংযোগ ও ক্যাটালগ যাচাই করুন।');
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
      setFeedback(nextDeleted ? 'পণ্যটি আর্কাইভ করা হয়েছে।' : 'পণ্যটি পুনরুদ্ধার করা হয়েছে।');
    } catch {
      setFeedback('আর্কাইভ পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  const handlePermanentDelete = async (prod: Product) => {
    try {
      const firestore = requireDb();
      await deleteDoc(doc(firestore, 'products', prod.id));
      await logAdminActivity('delete', 'products', prod.id, prod.nameEn || prod.name);
      setFeedback('পণ্যটি স্থায়ীভাবে ডিলিট করা হয়েছে।');
    } catch (err) {
      setFeedback('ডিলিট করতে সমস্যা হয়েছে।');
      try {
        handleFirestoreError(err, OperationType.DELETE, `products/${prod.id}`);
      } catch {
        // Logged
      }
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
      setFeedback('আপডেট করার আগে ডেমো ক্যাটালগ Firestore-এ সেভ করুন।');
    }
  };

  const filtered = allProducts.filter((p) => {
    if (filterMode === 'active' && (p.deleted || p.visible === false)) return false;
    if (filterMode === 'hidden' && (p.deleted || p.visible !== false)) return false;
    if (filterMode === 'archived' && !p.deleted) return false;

    const q = search.toLowerCase();
    const t = getProductText(p, allCategories);
    return (
      t.nameBn.toLowerCase().includes(q) ||
      t.nameEn.toLowerCase().includes(q) ||
      t.categoryNameBn.toLowerCase().includes(q) ||
      t.categoryNameEn.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Product Management
          </h2>
          <p className="text-xs text-[#57534E]">
            নতুন পণ্য যোগ করুন, বাংলা ও English নাম-বিবরণ, পূর্বের মূল্য, ছাড়, ছবি এবং Show/Hide/Archive নিয়ন্ত্রণ করুন।
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

      {feedback && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-[#B91C1C]">
          {feedback}
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
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
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
                মূল্যের একক (যেমন: প্রতি কেজি)
              </label>
              <input
                type="text"
                value={editing.priceUnit}
                onChange={(e) => setEditing({ ...editing, priceUnit: e.target.value })}
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

            {/* Images */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="mb-1.5 text-xs font-semibold text-[#1C1917]">
                পণ্যের ছবি (আপলোড করুন)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {editing.images.map((img, i) => (
                  <div
                    key={i}
                    className="relative h-20 w-24 overflow-hidden rounded-lg border border-[#D6D3D1]"
                  >
                    <img
                      src={resolveAssetUrl(img)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          images: editing.images.filter((_, idx) => idx !== i),
                        })
                      }
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex h-20 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#D6D3D1] px-4 text-xs font-medium text-[#57534E] hover:border-[#DC1F26]">
                  <Upload className="h-4 w-4" />
                  <span>ছবি আপলোড</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="পণ্য খুঁজুন..."
            className="w-full max-w-sm rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
          />
          <div className="flex gap-1.5 text-xs">
            {(['active', 'hidden', 'archived', 'all'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
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
                <th className="px-4 py-3 font-semibold">পণ্য</th>
                <th className="px-4 py-3 font-semibold">ক্যাটাগরি</th>
                <th className="px-4 py-3 font-semibold">মূল্য</th>
                <th className="px-4 py-3 font-semibold">দৃশ্যমানতা</th>
                <th className="px-4 py-3 font-semibold">Featured</th>
                <th className="px-4 py-3 text-right font-semibold">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-[#FAFAF8]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={resolveAssetUrl(p.images[0])}
                        alt={p.name}
                        className="h-10 w-12 rounded-md object-cover"
                      />
                      <div>
                        <p className="font-semibold text-[#1C1917]">{p.name}</p>
                        <p className="text-[11px] text-[#78716C]">{p.nameEn}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#44403C]">{p.categoryName}</td>
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
                      {p.visible !== false ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
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
                          onClick={() => handlePermanentDelete(p)}
                          className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
    if (!file || !editing) return;
    const url = await compressImageToDataUrl(file, 900, 0.78);
    setEditing({ ...editing, image: url });
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
            <label className="mb-1 block text-xs font-semibold">ছবি পরিবর্তন</label>
            <input type="file" accept="image/*" onChange={handleUpload} className="text-xs" />
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
                    onClick={() => removeCategory(cat.id)}
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
  const { allShowrooms, logAdminActivity } = useStore();
  const [editing, setEditing] = useState<Showroom | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    const areaBn = editing.area.trim() || areaEn || 'Dhaka';
    const addressEn = (editing.addressEn ?? '').trim();
    const addressBn = editing.address.trim() || addressEn || areaBn;
    const descEn = (editing.descriptionEn ?? '').trim();
    const descBn = (editing.description ?? '').trim() || descEn;
    const hoursEn = (editing.openingHoursEn ?? '').trim();
    const hoursBn = editing.openingHours.trim() || hoursEn || 'প্রতিদিন সকাল ৮:০০ – রাত ১১:০০';
    const phone = editing.phone.trim() || '+880 1700-000000';

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
      mapUrl:
        editing.mapUrl.trim() || `https://maps.google.com/?q=${editing.lat},${editing.lng}`,
      lat: Number(editing.lat) || 23.7465,
      lng: Number(editing.lng) || 90.376,
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Showroom Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English ভাষায় শোরুমের নাম, এলাকা, ঠিকানা, ফোন, ইমেইল, সময়সূচি, সাপ্তাহিক ছুটি ও ম্যাপ আপডেট করুন।
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
              phone: '+880 17',
              alternate_phone: '',
              email: '',
              openingHours: 'প্রতিদিন সকাল ৮:০০ – রাত ১১:০০',
              openingHoursEn: 'Daily 8:00 AM – 11:00 PM',
              opening_time: '08:00 AM',
              closing_time: '11:00 PM',
              weekly_holiday: 'Open Daily',
              mapUrl: 'https://maps.google.com/?q=23.7465,90.3760',
              lat: 23.7465,
              lng: 90.376,
              isMain: false,
              visible: true,
              display_order: allShowrooms.length + 1,
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
              placeholder="যেমন: ধানমন্ডি ফ্ল্যাগশিপ শোরুম"
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
              placeholder="e.g. Dhanmondi Flagship Showroom"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Area (বাংলা) *</label>
            <input
              type="text"
              value={editing.area}
              onChange={(e) => setEditing({ ...editing, area: e.target.value })}
              placeholder="যেমন: ধানমন্ডি"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Area (English)</label>
            <input
              type="text"
              value={editing.areaEn ?? ''}
              onChange={(e) => setEditing({ ...editing, areaEn: e.target.value })}
              placeholder="e.g. Dhanmondi"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Primary Phone *</label>
            <input
              type="text"
              value={editing.phone}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
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
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Weekly Holiday</label>
            <input
              type="text"
              value={editing.weekly_holiday ?? ''}
              onChange={(e) => setEditing({ ...editing, weekly_holiday: e.target.value })}
              placeholder="e.g. Open Daily / Closed Tuesday"
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
              placeholder="e.g. Daily 8:00 AM – 11:00 PM"
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
              <span>Main Flagship Showroom</span>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {allShowrooms.map((sr) => {
          const st = getShowroomText(sr);
          return (
            <div key={sr.id} className="rounded-xl border border-[#E7E5E4] bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#DC1F26]">
                    {st.areaBn}
                    {st.areaEn ? ` · ${st.areaEn}` : ''}{' '}
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
    </div>
  );
}
