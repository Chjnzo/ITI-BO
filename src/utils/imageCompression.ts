import imageCompression from 'browser-image-compression';

export async function compressCopertina(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/webp' as const,
    initialQuality: 0.82,
  };
  return await imageCompression(file, options);
}

export async function compressGalleria(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.25,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp' as const,
    initialQuality: 0.80,
  };
  return await imageCompression(file, options);
}
