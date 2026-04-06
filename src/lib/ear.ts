/**
 * Calculates the Eye Aspect Ratio (EAR) for a set of facial landmarks.
 * EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 */
export function calculateEAR(landmarks: any, indices: number[]): number {
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];

  const dist = (a: any, b: any) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

  const vertical1 = dist(p2, p6);
  const vertical2 = dist(p3, p5);
  const horizontal = dist(p1, p4);

  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// MediaPipe Face Mesh indices for eyes
export const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
