// Measuring a keyboard focus ring against real pixels (visual pass I8 and I8b).
// The measure: screenshot the control blurred, focus it from the keyboard, screenshot
// again, and take the highest contrast ratio between the same pixel before and after
// (the "peak" of the ring). The art behind a control is swapped for a solid fixture,
// because real art varies and any single-colour ring over art will vanish on some of it.

export const ART = { gold: "#c98a3a", white: "#ffffff", black: "#0a0a0a" };

// Replace an image's source with a solid colour of its own size.
export async function paintArt(page, selector, colour) {
  await page.locator(selector).first().evaluate(async (img, c) => {
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = c; ctx.fillRect(0, 0, 64, 64);
    img.removeAttribute("srcset");
    img.src = cv.toDataURL();
    await img.decode();
  }, colour);
}

// Peak contrast ratio of the pixels that change when `control` takes keyboard focus.
export async function ringPeak(page, control) {
  await control.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Shift"); // keyboard modality, so :focus-visible matches
  await control.evaluate(() => document.activeElement?.blur());
  const box = await control.boundingBox();
  const vp = page.viewportSize();
  const pad = 10;
  const clip = {
    x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
    width: Math.min(vp.width, box.x + box.width + pad) - Math.max(0, box.x - pad),
    height: Math.min(vp.height, box.y + box.height + pad) - Math.max(0, box.y - pad),
  };
  await page.waitForTimeout(350);
  const before = (await page.screenshot({ clip })).toString("base64");
  await control.focus();
  await page.waitForTimeout(350);
  const after = (await page.screenshot({ clip })).toString("base64");
  return page.evaluate(async ([a, b]) => {
    const load = async (s) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    };
    const [pa, pb] = [await load(a), await load(b)];
    const lum = (r, g, bl) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
    };
    let peak = 1, changed = 0;
    for (let i = 0; i < pa.length; i += 4) {
      if (pa[i] === pb[i] && pa[i + 1] === pb[i + 1] && pa[i + 2] === pb[i + 2]) continue;
      changed++;
      const la = lum(pa[i], pa[i + 1], pa[i + 2]), lb = lum(pb[i], pb[i + 1], pb[i + 2]);
      peak = Math.max(peak, (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05));
    }
    return { peak: Math.round(peak * 100) / 100, changed };
  }, [before, after]);
}
