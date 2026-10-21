export const formatDistanceMeters = (distanceMeters: number): string =>
  distanceMeters >= 1000
    ? `${Number((distanceMeters / 1000).toFixed(1))}km`
    : `${distanceMeters.toLocaleString()}m`;
