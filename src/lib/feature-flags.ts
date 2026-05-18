export function shouldGenerateImages(options: unknown = {}): boolean {
  const parsedOptions = typeof options === "object" && options !== null
    ? options as Record<string, unknown>
    : {};

  if (process.env.ENABLE_IMAGE_GENERATION === "true") return true;
  return parsedOptions.enableImages === true || parsedOptions.enableImages === "true";
}
