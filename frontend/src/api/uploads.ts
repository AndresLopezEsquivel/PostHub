import { ApiError, request } from './client';

// Uploads go straight to S3: the backend signs a PUT URL, the browser uploads
// the file to it, and only the resulting key is sent to the API. The file
// never passes through the API server.

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

// Mirrors EXTENSIONS in backend/src/services/uploads.service.ts, so a wrong
// type fails without a round trip.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function presignUpload(input: PresignInput): Promise<PresignResult> {
  return request<PresignResult>('/uploads/presign', { method: 'POST', body: input });
}

// The only place the app talks to S3. The PUT goes to a cross-origin URL, so
// it uses fetch directly instead of request(), which is for same-origin /api
// calls. A wrong type or size fails here, before any request, as an ApiError
// with field 'image' so the upload field can show it.
export async function uploadImage(file: File, purpose: Purpose): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new ApiError(415, 'Choose a JPEG, PNG, WebP, or GIF image.', 'image');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(413, 'Image must be 5 MB or smaller.', 'image');
  }

  const { uploadUrl, key } = await presignUpload({ contentType: file.type, purpose });

  // S3 stores the object with this Content-Type. No credentials: S3 is another
  // origin, and the signed URL authorizes the PUT.
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
