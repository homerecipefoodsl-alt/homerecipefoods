export const EXPECTED_FIREBASE_PROJECT_ID = 'ai-studio-applet-webapp-e4b0f';

export interface ServiceAccountConfig {
  project_id: string;
  client_email: string;
  private_key: string;
}

export type ServiceAccountDiagnostic =
  | 'Ready'
  | 'missing_secret'
  | 'invalid_json'
  | 'initialization_error';

export type ServiceAccountValidation =
  | {
      ok: true;
      config: ServiceAccountConfig;
      diagnosticStatus: 'Ready';
    }
  | {
      ok: false;
      errorCode: string;
      status: number;
      diagnosticStatus: Exclude<ServiceAccountDiagnostic, 'Ready'>;
      message: string;
    };

export function normalizePrivateKeyPem(rawKey: string): string {
  return rawKey
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function pemToPkcs8ArrayBuffer(pem: string): ArrayBuffer {
  const normalizedPem = normalizePrivateKeyPem(pem);
  const b64 = normalizedPem
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, '')
    .replace(/-----END [A-Z0-9 ]+-----/g, '')
    .replace(/\s+/g, '');

  if (!b64 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(b64)) {
    throw new Error('INVALID_PKCS8_BODY');
  }

  const bin = atob(b64);
  if (bin.length < 32) {
    throw new Error('INVALID_PKCS8_LENGTH');
  }

  const buffer = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i += 1) {
    view[i] = bin.charCodeAt(i);
  }
  return buffer;
}

export async function verifyWebCryptoServiceAccountKey(
  privateKeyPem: string
): Promise<boolean> {
  try {
    const pkcs8 = pemToPkcs8ArrayBuffer(privateKeyPem);
    await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return true;
  } catch {
    return false;
  }
}

function escapeRawNewlinesInJsonStrings(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === '\r') {
        if (input[i + 1] === '\n') {
          i += 1;
        }
        out += '\\n';
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
    }
  }

  return out;
}

export function inspectServiceAccountConfig(
  raw: unknown,
  expectedProjectId: string = EXPECTED_FIREBASE_PROJECT_ID
): ServiceAccountValidation {
  if (raw === undefined || raw === null) {
    return {
      ok: false,
      errorCode: 'FIREBASE_CONFIG_MISSING',
      status: 500,
      diagnosticStatus: 'missing_secret',
      message:
        'FIREBASE_SERVICE_ACCOUNT_JSON secret is missing. Configure it as a Cloudflare Worker secret.',
    };
  }

  let parsedUnknown: unknown;

  if (typeof raw === 'object') {
    if (Array.isArray(raw)) {
      return {
        ok: false,
        errorCode: 'INVALID_JSON',
        status: 500,
        diagnosticStatus: 'invalid_json',
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON must be a valid JSON object.',
      };
    }
    parsedUnknown = raw;
  } else if (typeof raw === 'string') {
    // Strip optional UTF-8 BOM, zero-width characters, and non-breaking spaces from mobile/editor copy-paste
    let cleaned = raw
      .replace(/[\uFEFF\u200B-\u200D]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
    if (!cleaned) {
      return {
        ok: false,
        errorCode: 'FIREBASE_CONFIG_MISSING',
        status: 500,
        diagnosticStatus: 'missing_secret',
        message:
          'FIREBASE_SERVICE_ACCOUNT_JSON secret is empty. Configure it as a Cloudflare Worker secret.',
      };
    }

    // Explicitly detect Markdown code fences (e.g. ```json ... ```) as a configuration problem
    if (/^```/i.test(cleaned) || /```$/.test(cleaned)) {
      return {
        ok: false,
        errorCode: 'INVALID_JSON',
        status: 500,
        diagnosticStatus: 'invalid_json',
        message:
          'FIREBASE_SERVICE_ACCOUNT_JSON contains Markdown code fence markers (```). Remove ```json / ``` and store the raw JSON object only.',
      };
    }

    // Try strict JSON.parse first so double-encoded JSON ("{\"type\":...}") is accurately detected as a string
    try {
      parsedUnknown = JSON.parse(cleaned);
    } catch {
      // Handle accidental outer quotation marks wrapping an unescaped JSON object (e.g. '{...}' or "{...}")
      if (
        (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
        (cleaned.startsWith('"') && cleaned.endsWith('"'))
      ) {
        const inner = cleaned.slice(1, -1).trim();
        if (inner.startsWith('{') && inner.endsWith('}') && !inner.startsWith('{\\')) {
          cleaned = inner;
        }
      }

      try {
        parsedUnknown = JSON.parse(cleaned);
      } catch {
        // Detect typographic smart/curly quotes introduced by mobile keyboards or rich-text editors
        if (/[\u201C\u201D\u2018\u2019]/.test(cleaned)) {
          return {
            ok: false,
            errorCode: 'INVALID_JSON',
            status: 500,
            diagnosticStatus: 'invalid_json',
            message:
              'FIREBASE_SERVICE_ACCOUNT_JSON contains curly/smart quotes instead of standard straight JSON quotes (").',
          };
        }

        // Safely recover only literal unescaped CR/LF newlines inside JSON string values (e.g. pasted PEM lines)
        let recovered = false;
        if (cleaned.startsWith('{') && /[\r\n]/.test(cleaned)) {
          try {
            parsedUnknown = JSON.parse(escapeRawNewlinesInJsonStrings(cleaned));
            recovered = true;
          } catch {
            recovered = false;
          }
        }

        if (!recovered) {
          let reason =
            'FIREBASE_SERVICE_ACCOUNT_JSON is malformed and could not be parsed as JSON. Re-paste the complete minified single-line JSON object in Cloudflare Secrets.';
          if (!cleaned.startsWith('{')) {
            reason =
              "FIREBASE_SERVICE_ACCOUNT_JSON does not start with '{'. Store the full Firebase service account JSON object, not a partial key.";
          } else if (!cleaned.endsWith('}')) {
            reason =
              "FIREBASE_SERVICE_ACCOUNT_JSON appears truncated (missing closing '}'). Re-paste the complete minified single-line JSON object in Cloudflare Secrets.";
          }
          return {
            ok: false,
            errorCode: 'INVALID_JSON',
            status: 500,
            diagnosticStatus: 'invalid_json',
            message: reason,
          };
        }
      }
    }

    // Do NOT blindly unwrap double-encoded JSON strings; clearly surface the config issue
    if (typeof parsedUnknown === 'string') {
      return {
        ok: false,
        errorCode: 'INVALID_JSON',
        status: 500,
        diagnosticStatus: 'invalid_json',
        message:
          'FIREBASE_SERVICE_ACCOUNT_JSON is double-encoded as a JSON string. Store the raw service account JSON object without extra string escaping.',
      };
    }

    if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
      return {
        ok: false,
        errorCode: 'INVALID_JSON',
        status: 500,
        diagnosticStatus: 'invalid_json',
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON must be a valid JSON object.',
      };
    }
  } else {
    return {
      ok: false,
      errorCode: 'INVALID_JSON',
      status: 500,
      diagnosticStatus: 'invalid_json',
      message: 'FIREBASE_SERVICE_ACCOUNT_JSON must be a valid JSON object.',
    };
  }

  const parsed = parsedUnknown as Record<string, unknown>;
  const accountType = typeof parsed.type === 'string' ? parsed.type.trim() : '';
  const projectIdVal = typeof parsed.project_id === 'string' ? parsed.project_id.trim() : '';
  const clientEmailVal = typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
  const rawPrivateKey = typeof parsed.private_key === 'string' ? parsed.private_key : '';
  const privateKeyVal = normalizePrivateKeyPem(rawPrivateKey);

  if (accountType && accountType !== 'service_account') {
    return {
      ok: false,
      errorCode: 'FIREBASE_ADMIN_INIT_FAILED',
      status: 500,
      diagnosticStatus: 'initialization_error',
      message: 'Service account JSON does not have type "service_account".',
    };
  }

  if (!projectIdVal || !clientEmailVal || !clientEmailVal.includes('@') || !privateKeyVal) {
    return {
      ok: false,
      errorCode: 'FIREBASE_ADMIN_INIT_FAILED',
      status: 500,
      diagnosticStatus: 'initialization_error',
      message:
        'Service account JSON is missing required credential fields (project_id, client_email, or private_key).',
    };
  }

  const requiredProject = (expectedProjectId || EXPECTED_FIREBASE_PROJECT_ID).trim();
  if (projectIdVal !== requiredProject) {
    return {
      ok: false,
      errorCode: 'PROJECT_MISMATCH',
      status: 500,
      diagnosticStatus: 'initialization_error',
      message: `Service account project does not match the configured Firebase project (${requiredProject}).`,
    };
  }

  if (
    !privateKeyVal.includes('-----BEGIN PRIVATE KEY-----') ||
    !privateKeyVal.includes('-----END PRIVATE KEY-----')
  ) {
    return {
      ok: false,
      errorCode: 'FIREBASE_ADMIN_INIT_FAILED',
      status: 500,
      diagnosticStatus: 'initialization_error',
      message:
        'Firebase Admin private key format is invalid (expected PKCS#8 PEM with escaped \\n newlines).',
    };
  }

  try {
    pemToPkcs8ArrayBuffer(privateKeyVal);
  } catch {
    return {
      ok: false,
      errorCode: 'FIREBASE_ADMIN_INIT_FAILED',
      status: 500,
      diagnosticStatus: 'initialization_error',
      message:
        'Firebase Admin private key could not be decoded. Ensure private_key preserves valid PEM data and escaped \\n newlines.',
    };
  }

  return {
    ok: true,
    diagnosticStatus: 'Ready',
    config: {
      project_id: projectIdVal,
      client_email: clientEmailVal,
      private_key: privateKeyVal,
    },
  };
}
