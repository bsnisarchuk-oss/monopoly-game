export function getPlayerTokenLabel(nickname) {
  return (nickname?.trim()?.[0] ?? "?").toUpperCase();
}

export function getCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function hexToRgba(hexColor, alpha = 1) {
  if (typeof hexColor !== "string") {
    return `rgba(48, 68, 103, ${alpha})`;
  }

  const normalizedHex = hexColor.trim().replace("#", "");
  const fullHex =
    normalizedHex.length === 3
      ? normalizedHex
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : normalizedHex;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return `rgba(48, 68, 103, ${alpha})`;
  }

  const red = Number.parseInt(fullHex.slice(0, 2), 16);
  const green = Number.parseInt(fullHex.slice(2, 4), 16);
  const blue = Number.parseInt(fullHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
