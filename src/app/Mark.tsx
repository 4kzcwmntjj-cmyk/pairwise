/** The Shōbu mark: two cards crossed on indigo, the back one pale indigo. The same drawing is public/icon.svg and `drawMark` in shareImage.ts. */
export function Mark({ size }: { size: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#3b3fd8" />
      <rect x="236" y="136" width="164" height="246" rx="20" fill="#9fa2ff" stroke="#3b3fd8" strokeWidth="22" transform="rotate(10 318 259)" />
      <rect x="108" y="126" width="164" height="246" rx="20" fill="#ffffff" stroke="#3b3fd8" strokeWidth="22" transform="rotate(-10 190 249)" />
    </svg>
  );
}
