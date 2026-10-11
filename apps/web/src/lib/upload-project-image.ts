/** Upload private image bytes directly to storage and report actual transfer progress. */
export function uploadProjectImage(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Could not upload ${file.name}.`));
      }
    };
    request.onerror =
      request.onabort =
      request.ontimeout =
        () => {
          reject(new Error(`Could not upload ${file.name}.`));
        };
    onProgress(0);
    request.send(file);
  });
}
