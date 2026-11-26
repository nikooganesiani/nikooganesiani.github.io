(() => {
  const widths = Object.freeze([160, 240, 320, 480, 640, 800]);
  const original = '(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})';
  const originalPattern = new RegExp(`^${original}\\.webp$`);
  const variantPattern = new RegExp(`^${original}-card-v1-(?:${widths.join('|')})\\.webp$`);
  const originalName = source => {
    if (typeof source !== 'string' || !/^(https:\/\/|\/media\/)/.test(source)) return null;
    if (/[\s,?#]/.test(source)) return null;
    const name = source.slice(source.lastIndexOf('/') + 1);
    return originalPattern.test(name) ? name : null;
  };
  const validWidth = width => Number.isInteger(width) && width > 0 && width <= 16384;
  const variantWidths = width => validWidth(width) ? widths.filter(candidate => candidate < width) : [];
  const variantName = (name, width) => `${name.slice(0, -5)}-card-v1-${width}.webp`;

  function srcset(source, width) {
    const name = originalName(source);
    const sizes = variantWidths(width);
    if (!name || !sizes.length) return '';
    const prefix = source.slice(0, -name.length);
    const candidates = sizes.map(size => `${prefix}${variantName(name, size)} ${size}w`);
    if (width <= widths.at(-1)) candidates.push(`${source} ${width}w`);
    return candidates.join(', ');
  }

  globalThis.EnkaCardImages = Object.freeze({
    originalName, validWidth, variantWidths, variantName, srcset,
    sizes: 'auto, (width < 700px) 50vw, (width < 1024px) 33vw, (width < 1400px) 25vw, 320px',
    mediaName: name => /^[a-f0-9-]+\.webp$/.test(name) || variantPattern.test(name)
  });
})();
