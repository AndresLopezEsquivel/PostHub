import { ApiError, request } from './client';

// The uploads resource (docs/api_design.md "Uploads and health") plus the direct-to-S3
// PUT it enables. Two-step, presigned, direct-to-S3: we ask the backend to sign a PUT
// URL, upload the bytes straight to S3, and only ever hand the backend the resulting
// key (imageKey/avatarKey). The image bytes never transit the API server.

// --- API shapes (mirrors backend/src/services/uploads.service.ts) ------------

export type Purpose = 'post' | 'avatar';

export interface PresignInput {
  contentType: string;
  purpose: Purpose;
}

export interface PresignResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

// The server's allowlist, mirrored so a bad file fails instantly without a round trip.
// Kept in sync with EXTENSIONS in uploads.service.ts.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB — a client-side sanity cap

// --- Requests ----------------------------------------------------------------

export function presignUpload(input: PresignInput): Promise<PresignResult> {
  return request<PresignResult>('/uploads/presign', { method: 'POST', body: input });
}

// Orchestrates the whole upload and resolves to the object key the caller stores.
// This is the ONE place the app talks to S3: the PUT goes to an absolute, cross-origin
// URL, so it deliberately bypasses request() (which is /api-only, same-origin, JSON,
// and cookie-bearing). A bad type/size is rejected here, before any network call, as an
// ApiError with field 'image' so the upload field can render it inline.
export async function uploadImage(file: File, purpose: Purpose): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new ApiError(415, 'Choose a JPEG, PNG, WebP, or GIF image.', 'image');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'Image must be 5 MB or smaller.', 'image');
  }

  const { uploadUrl, key } = await presignUpload({ contentType: file.type, purpose });

  // The presign bound Content-Type into the signature, so the PUT must send the same
  // header. No credentials: S3 is a third-party origin and authorizes via the signed URL.
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Upload failed. Please try again.', 'image');
  }

  return key;
}
