/**
 * A title that opens its details card. Used under covers in Duel and Quick log, where tapping the cover does
 * something else. A heading rather than a button, so long titles still clamp to two lines.
 */
export function TitleLink({ title, onOpen }: { title: string; onOpen: () => void }) {
  return (
    <h2
      className="item-title title-link"
      role="button"
      tabIndex={0}
      title="Details"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }
      }}
    >
      {title}
      <span className="info-mark" aria-hidden="true">
        i
      </span>
    </h2>
  );
}
