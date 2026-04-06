export function getPlayerTokenLabel(nickname) {
  return (nickname?.trim()?.[0] ?? "?").toUpperCase();
}

export function getCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
