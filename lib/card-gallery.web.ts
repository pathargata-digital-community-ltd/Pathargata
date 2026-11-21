export async function saveCardToGallery(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Unable to read the captured card image.");

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "pathargata-digital-card.png";
  link.style.display = "none";
  document.body.appendChild(link);

  try {
    link.click();
    return true;
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
