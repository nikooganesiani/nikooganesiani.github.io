(() => {
  const widths = Object.freeze({
    card: Object.freeze([160, 240, 320, 480, 640, 800]),
    banner: Object.freeze([400, 640, 960, 1280, 1600, 1920]),
    cover: Object.freeze([160, 240, 320, 480, 640, 800])
  });
  const original = '(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})';
  const originalPattern = new RegExp(`^${original}\\.webp$`);
  const variantPattern = new RegExp(`^${original}-(?:${Object.entries(widths).map(([key, sizes]) => `${key}-v1-(?:${sizes.join('|')})`).join('|')})\\.webp$`);
  const originalName = source => {
    if (typeof source !== 'string' || !/^(https:\/\/|\/media\/)/.test(source)) return null;
    if (/[\s,?#]/.test(source)) return null;
    const name = source.slice(source.lastIndexOf('/') + 1);
    return originalPattern.test(name) ? name : null;
  };
  const validWidth = width => Number.isInteger(width) && width > 0 && width <= 16384;
  const variantWidths = (width, profile = 'card') => validWidth(width) ? widths[profile].filter(candidate => candidate < width) : [];
  const variantName = (name, width, profile = 'card') => `${name.slice(0, -5)}-${profile}-v1-${width}.webp`;
  const animatedWebP = bytes => bytes.length > 20 && String.fromCharCode(...bytes.subarray(12, 16)) === 'VP8X' && (bytes[20] & 2) !== 0;

  function srcset(source, width, profile = 'card') {
    const name = originalName(source);
    const sizes = variantWidths(width, profile);
    if (!name || !sizes.length) return '';
    const prefix = source.slice(0, -name.length);
    const candidates = sizes.map(size => `${prefix}${variantName(name, size, profile)} ${size}w`);
    if (profile !== 'card' || width <= widths.card.at(-1)) candidates.push(`${source} ${width}w`);
    return candidates.join(', ');
  }

  globalThis.EnkaCardImages = Object.freeze({
    originalName, validWidth, variantWidths, variantName, srcset, animatedWebP,
    sizes: 'auto, (width < 700px) 50vw, (width < 1024px) 33vw, (width < 1400px) 25vw, 320px',
    mediaName: name => /^[a-f0-9-]+\.webp$/.test(name) || variantPattern.test(name)
  });
})();
