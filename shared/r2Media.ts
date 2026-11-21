export const ALLOWED_MEDIA_FOLDERS = [
  'products',
  'categories',
  'media',
  'banners',
  'showrooms',
] as const;

export type MediaUploadFolder = (typeof ALLOWED_MEDIA_FOLDERS)[number];

export const MAX_MEDIA_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];

export const CATALOG_UPLOAD_STAFF_ROLES = new Set([
  'super_admin',
  'admin',
  'manager',
]);

export const CATALOG_UPLOAD_PERMISSIONS = [
  'products_add',
  'products_edit',
  'categories_manage',
  'banners_manage',
  'showrooms_manage',
] as const;

export function isAllowedMediaFolder(value: string): value is MediaUploadFolder {
  return (ALLOWED_MEDIA_FOLDERS as readonly string[]).includes(value);
}

export function sanitizeMediaEntityId(rawId: string): string {
  const cleaned = rawId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 96) || `item-${Date.now()}`;
}

export function sanitizeMediaFileBase(rawFileName: string): string {
  const withoutExt = rawFileName.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(-48) || 'image';
}

export function buildR2ObjectKey(params: {
  folder: MediaUploadFolder;
  entityId: string;
  fileName: string;
  ext: 'jpg' | 'png' | 'webp';
}): string {
  const safeEntity = sanitizeMediaEntityId(params.entityId);
  const safeBase = sanitizeMediaFileBase(params.fileName);
  const randBytes = new Uint8Array(3);
  globalThis.crypto.getRandomValues(randBytes);
  const randHex = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${params.folder}/${safeEntity}/${Date.now()}_${randHex}_${safeBase}.${params.ext}`;
}

export function validateR2ReadKey(rawPath: string): string | null {
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  const trimmed = decoded.replace(/^\/+/, '').trim();
  if (
    !trimmed ||
    trimmed.length > 320 ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    return null;
  }

  if (
    !/^(products|categories|media|banners|showrooms)\/[a-zA-Z0-9_-]{1,96}\/[a-zA-Z0-9._-]{1,120}$/.test(
      trimmed
    )
  ) {
    return null;
  }

  if (!/\.(jpg|jpeg|png|webp)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function inspectImageBytes(
  bytes: Uint8Array,
  declaredMime?: string
):
  | { ok: true; contentType: AllowedMediaMimeType; ext: 'jpg' | 'png' | 'webp' }
  | { ok: false; status: number; code: string; message: string } {
  if (!bytes || bytes.byteLength <= 12) {
    return {
      ok: false,
      status: 400,
      code: 'EMPTY_IMAGE_FILE',
      message: 'নির্বাচিত ছবি ফাইলটি খালি বা অসম্পূর্ণ। অনুগ্রহ করে সঠিক ছবি দিন।',
    };
  }

  if (bytes.byteLength > MAX_MEDIA_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'IMAGE_TOO_LARGE',
      message: 'ছবির আকার অনেক বড়। সর্বোচ্চ ৫ এমবি আকারের ছবি আপলোড করা যাবে।',
    };
  }

  const normalizedMime = (declaredMime || '').split(';')[0].trim().toLowerCase();
  if (
    normalizedMime &&
    normalizedMime !== 'application/octet-stream' &&
    normalizedMime !== 'image/jpeg' &&
    normalizedMime !== 'image/jpg' &&
    normalizedMime !== 'image/png' &&
    normalizedMime !== 'image/webp'
  ) {
    return {
      ok: false,
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'অসমর্থিত ফাইল ফরম্যাট। শুধু JPG, PNG অথবা WEBP ছবি আপলোড করা যাবে।',
    };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ok: true, contentType: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ok: true, contentType: 'image/png', ext: 'png' };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ok: true, contentType: 'image/webp', ext: 'webp' };
  }

  return {
    ok: false,
    status: 415,
    code: 'INVALID_IMAGE_SIGNATURE',
    message: 'নির্বাচিত ফাইলটি বৈধ JPG, PNG বা WEBP ছবি নয়।',
  };
}

export function resolveAllowedApiCorsOrigin(
  requestOrigin: string | null | undefined,
  currentUrlOrigin: string,
  envAppUrl?: string
): string | null {
  const cleanOrigin = (requestOrigin || '').trim();
  if (!cleanOrigin) return null;

  let parsed: URL;
  try {
    parsed = new URL(cleanOrigin);
  } catch {
    return null;
  }

  const originStr = parsed.origin;
  if (originStr === currentUrlOrigin) {
    return originStr;
  }

  if (envAppUrl) {
    try {
      const appOrigin = new URL(envAppUrl.trim()).origin;
      if (originStr === appOrigin) return originStr;
    } catch {
      // Ignore invalid APP_URL placeholder
    }
  }

  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol === 'https:' &&
    (host === 'homerecipefoods.com' ||
      host === 'www.homerecipefoods.com' ||
      host.endsWith('.homerecipefoods-l.workers.dev') ||
      host.endsWith('.run.app'))
  ) {
    return originStr;
  }

  if (
    parsed.protocol === 'http:' &&
    (host === 'localhost' || host === '127.0.0.1')
  ) {
    return originStr;
  }

  return null;
}

export function buildR2MediaPublicUrl(params: {
  objectKey: string;
  publicBaseUrl?: string;
  workerOrigin: string;
}): string {
  const cleanKey = params.objectKey.replace(/^\/+/, '');
  const rawPublic = (params.publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (rawPublic) {
    try {
      const parsed = new URL(rawPublic);
      if (parsed.protocol === 'https:') {
        return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}/${cleanKey}`;
      }
    } catch {
      // Fall back to worker/app media serving route
    }
  }

  const baseOrigin = params.workerOrigin.trim().replace(/\/+$/, '');
  return `${baseOrigin}/api/media/file/${cleanKey}`;
}

export interface R2S3Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export function inspectR2S3Credentials(env: {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
}): { configured: true; creds: R2S3Credentials } | { configured: false } {
  const accountId = (env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = (env.R2_BUCKET_NAME || 'homerecipefoods-media').trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return { configured: false };
  }

  if (!/^[a-z0-9]{16,64}$/i.test(accountId) || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(bucketName)) {
    return { configured: false };
  }

  return {
    configured: true,
    creds: {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
    },
  };
}

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  return toHex(digest);
}

async function hmacSha256Raw(
  keyBytes: Uint8Array | string,
  message: string
): Promise<Uint8Array> {
  const rawKey = typeof keyBytes === 'string' ? new TextEncoder().encode(keyBytes) : keyBytes;
  const keyCopy = new Uint8Array(rawKey.byteLength);
  keyCopy.set(rawKey);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyCopy.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const msgBytes = new TextEncoder().encode(message);
  const msgCopy = new Uint8Array(msgBytes.byteLength);
  msgCopy.set(msgBytes);
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, msgCopy.buffer);
  return new Uint8Array(sig);
}

async function signR2S3Request(params: {
  method: 'PUT' | 'GET';
  creds: R2S3Credentials;
  objectKey: string;
  payloadHash: string;
  contentType?: string;
  cacheControl?: string;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const host = `${params.creds.accountId}.r2.cloudflarestorage.com`;
  const encodedKey = params.objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const canonicalUri = `/${encodeURIComponent(params.creds.bucketName)}/${encodedKey}`;
  const url = `https://${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const signedHeadersMap: Record<string, string> = {
    host,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.cacheControl) {
    signedHeadersMap['cache-control'] = params.cacheControl;
  }
  if (params.contentType) {
    signedHeadersMap['content-type'] = params.contentType;
  }

  const sortedHeaderKeys = Object.keys(signedHeadersMap).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${signedHeadersMap[key]}\n`)
    .join('');
  const signedHeadersList = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    params.method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeadersList,
    params.payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmacSha256Raw(`AWS4${params.creds.secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  const kSigning = await hmacSha256Raw(kService, 'aws4_request');
  const signatureHex = toHex(await hmacSha256Raw(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${params.creds.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeadersList}, Signature=${signatureHex}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.cacheControl) {
    headers['Cache-Control'] = params.cacheControl;
  }
  if (params.contentType) {
    headers['Content-Type'] = params.contentType;
  }

  return { url, headers };
}

export async function putObjectToR2S3(params: {
  creds: R2S3Credentials;
  objectKey: string;
  body: Uint8Array;
  contentType: AllowedMediaMimeType;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const payloadHash = await sha256Hex(params.body);
  const cacheControl = 'public, max-age=31536000, immutable';
  const signed = await signR2S3Request({
    method: 'PUT',
    creds: params.creds,
    objectKey: params.objectKey,
    payloadHash,
    contentType: params.contentType,
    cacheControl,
  });

  const bodyCopy = new Uint8Array(params.body.byteLength);
  bodyCopy.set(params.body);

  const resp = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: bodyCopy.buffer,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return {
      ok: false,
      status: resp.status,
      message: errText.slice(0, 300) || `R2 S3 PUT failed (${resp.status})`,
    };
  }

  return { ok: true };
}

export async function getObjectFromR2S3(params: {
  creds: R2S3Credentials;
  objectKey: string;
}): Promise<Response> {
  const emptyHash = await sha256Hex('');
  const signed = await signR2S3Request({
    method: 'GET',
    creds: params.creds,
    objectKey: params.objectKey,
    payloadHash: emptyHash,
  });

  return fetch(signed.url, {
    method: 'GET',
    headers: signed.headers,
  });
}
