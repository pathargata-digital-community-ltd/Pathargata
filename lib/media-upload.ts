import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type UploadedMedia = {
  url: string;
  type: string;
  resourceType: string;
};

export function mediaUploadErrorMessage(error: unknown, fallback = "ছবি আপলোড হয়নি। আবার চেষ্টা করুন।") {
  const code = error instanceof Error ? error.message : "";
  if (code === "AUTH_REQUIRED") return "ছবি আপলোড করতে আগে login করুন।";
  if (code === "MEDIA_READ_FAILED" || code === "MEDIA_SIZE_UNAVAILABLE") return "ছবির ফাইলটি পড়া যাচ্ছে না। Gallery থেকে আবার ছবি বাছুন।";
  if (code === "MEDIA_SIZE_INVALID") return "ছবির ফাইলটি খুব বড় বা খালি। ছোট ছবি দিয়ে আবার চেষ্টা করুন।";
  if (code === "MEDIA_TYPE_INVALID") return "এই ছবির format সমর্থিত নয়। JPG বা PNG ছবি ব্যবহার করুন।";
  if (code === "VIDEO_UPLOAD_DISABLED") return "ভিডিও upload বর্তমানে বন্ধ আছে। শুধু ছবি বাছুন।";
  if (code.includes("upload server") || code.includes("upload করা যায়নি") || code.includes("upload-এর সময়")) return code;
  return code || fallback;
}

type CloudinaryResponse = {
  secure_url?: string;
  resource_type?: string;
  error?: { message?: string };
};

const CLOUD_NAME = "dl1auoanl";
const UPLOAD_PRESET = "Pathargata digital";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

async function postToCloudinary(form: FormData, mediaLabel: string, onProgress?: (progress: number) => void): Promise<UploadedMedia> {
  form.append("upload_preset", UPLOAD_PRESET);
  let response: Response;
  try {
    if (onProgress) {
      response = await new Promise<Response>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", CLOUDINARY_UPLOAD_URL);
        request.timeout = 120_000;
        request.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
        };
        request.onerror = () => reject(new Error(`${mediaLabel} upload server-এ সংযোগ করা যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।`));
        request.ontimeout = () => reject(new Error(`${mediaLabel} upload-এর সময় শেষ হয়েছে। আবার চেষ্টা করুন।`));
        request.onload = () => resolve(new Response(request.responseText, { status: request.status, headers: { "Content-Type": request.getResponseHeader("Content-Type") || "application/json" } }));
        request.send(form);
      });
    } else {
      response = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: form });
    }
  } catch {
    throw new Error(`${mediaLabel} upload server-এ সংযোগ করা যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।`);
  }
  const data = (await response.json().catch(() => ({}))) as CloudinaryResponse;
  if (!response.ok || data.error) throw new Error(data.error?.message || `${mediaLabel} upload করা যায়নি। আবার চেষ্টা করুন।`);
  if (typeof data.secure_url !== "string" || !data.secure_url) throw new Error(`${mediaLabel} upload হয়েছে, কিন্তু নিরাপদ URL পাওয়া যায়নি। আবার চেষ্টা করুন।`);
  const resourceType = data.resource_type || "image";
  return { url: data.secure_url, type: resourceType, resourceType };
}

async function uploadNativeFile(
  uri: string,
  mimeType: string,
  mediaLabel: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  const task = FileSystem.createUploadTask(CLOUDINARY_UPLOAD_URL, uri, {
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType,
    parameters: {
      upload_preset: UPLOAD_PRESET,
      resource_type: "auto",
    },
  }, onProgress ? (event) => {
    if (event.totalBytesExpectedToSend > 0) {
      onProgress(Math.max(0, Math.min(100, Math.round(
        (event.totalBytesSent / event.totalBytesExpectedToSend) * 100,
      ))));
    }
  } : undefined);
  let result;
  try {
    result = await task.uploadAsync();
  } catch {
    throw new Error("NATIVE_UPLOAD_CONNECTION");
  }
  if (!result) throw new Error("NATIVE_UPLOAD_CONNECTION");
  let data: CloudinaryResponse;
  try {
    data = JSON.parse(result.body || "{}");
  } catch {
    throw new Error("NATIVE_UPLOAD_CONNECTION");
  }
  if (result.status < 200 || result.status >= 300 || data.error) {
    throw new Error(data.error?.message || `${mediaLabel} upload করা যায়নি। আবার চেষ্টা করুন।`);
  }
  if (typeof data.secure_url !== "string" || !data.secure_url) {
    throw new Error(`${mediaLabel} upload হয়েছে, কিন্তু নিরাপদ URL পাওয়া যায়নি। আবার চেষ্টা করুন।`);
  }
  const resourceType = data.resource_type || "image";
  return { url: data.secure_url, type: resourceType, resourceType };
}

export async function uploadCloudinaryBlob(blob: Blob, mimeType: string, filename: string, mediaLabel = "Media", onProgress?: (progress: number) => void): Promise<UploadedMedia> {
  if (!blob || blob.size <= 0) throw new Error("MEDIA_EMPTY");
  if (mimeType.toLowerCase().startsWith("video/") || blob.type.toLowerCase().startsWith("video/")) {
    throw new Error("VIDEO_UPLOAD_DISABLED");
  }
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("resource_type", "auto");
  return postToCloudinary(form, mediaLabel, onProgress);
}

export async function uploadImageFromUri(
  uri: string,
  mimeType = "image/jpeg",
  webFile?: Blob,
  mediaLabel = "ছবি",
  onProgress?: (progress: number) => void,
): Promise<UploadedMedia> {
  if (!uri) throw new Error("ছবির ফাইল পাওয়া যায়নি। আবার ছবি বাছুন।");
  if (Platform.OS !== "web") {
    try {
      return await uploadNativeFile(uri, mimeType, mediaLabel, onProgress);
    } catch (error) {
      if (error instanceof Error && error.message === "NATIVE_UPLOAD_CONNECTION") {
        throw new Error(`${mediaLabel} upload server-এ সংযোগ করা যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।`);
      }
      throw error;
    }
  }
  const form = new FormData();
  if (Platform.OS === "web") {
    let file = webFile;
    if (!file) {
      const localResponse = await fetch(uri).catch(() => null);
      if (!localResponse?.ok) throw new Error("ছবিটি পড়া যায়নি। আবার ছবি বাছুন।");
      file = await localResponse.blob();
    }
    form.append("file", file as any);
  } else {
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    form.append("file", { uri, type: mimeType, name: `pathargata-${Date.now()}.${extension}` } as any);
  }
  return postToCloudinary(form, mediaLabel, onProgress);
}

export async function getLocalMediaSize(uri: string): Promise<number> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("MEDIA_READ_FAILED");
    return (await response.blob()).size;
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof info.size !== "number") throw new Error("MEDIA_SIZE_UNAVAILABLE");
  return info.size;
}
