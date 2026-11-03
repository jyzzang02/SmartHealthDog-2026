export const parseWalkPathCoordinates = (value: unknown): Array<[number, number]> => {
  let coordinates = value;
  // List responses store the path as JSON text; detail responses return an array.
  if (typeof coordinates === 'string') {
    try { coordinates = JSON.parse(coordinates); }
    catch { return []; }
  }
  if (!Array.isArray(coordinates)) return [];

  const path: Array<[number, number]> = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lat, lng] = point;
    if (typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
      && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180) {
      path.push([lat, lng]);
    }
  }
  return path;
};
