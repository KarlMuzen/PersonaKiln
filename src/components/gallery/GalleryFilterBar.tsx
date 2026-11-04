import React, { useEffect, useRef, useState } from 'react';
import { canAutoFocusText } from '../../utils/touch';
import { ChevronDown, Search, Tag } from 'lucide-react';

export interface GalleryFilterBarProps {
  allTags: string[];
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
}

export const GalleryFilterBar: React.FC<GalleryFilterBarProps> = ({
  allTags,
  selectedTag,
  setSelectedTag,
}) => {
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tagSearchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isTagPickerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTagPickerOpen(false);
        setTagQuery('');
        triggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsTagPickerOpen(false);
        setTagQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    if (canAutoFocusText()) tagSearchRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isTagPickerOpen]);

  const visibleTags = allTags.filter((tag) => tag.toLowerCase().includes(tagQuery.trim().toLowerCase()));

  const selectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setIsTagPickerOpen(false);
    setTagQuery('');
  };

  return (
    <div className="w-full min-w-0 flex flex-wrap items-center gap-3">
      {allTags.length > 0 && (
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            ref={triggerRef}
            type="button"
            aria-label={selectedTag ? `Tags: ${selectedTag}` : 'Tags'}
            aria-haspopup="dialog"
            aria-expanded={isTagPickerOpen}
            aria-controls="library-tag-picker"
            onClick={() => setIsTagPickerOpen((open) => !open)}
            className={`min-h-11 max-w-full flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold touch-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-maroon-400 ${selectedTag ? 'border-maroon-500/60 bg-maroon-950/50 text-maroon-200' : 'border-knight-800 bg-void-900 text-knight-300 hover:text-mist-100'}`}
          >
            <Tag className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="max-w-36 truncate">{selectedTag ? selectedTag : 'Tags'}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isTagPickerOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {isTagPickerOpen && (
            <div
              id="library-tag-picker"
              role="dialog"
              aria-label="Choose tag filter"
              className="absolute left-0 sm:left-auto sm:right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] max-h-[min(65vh,28rem)] overflow-hidden rounded-2xl border border-knight-700/70 bg-void-900/98 p-3 shadow-2xl"
            >
              <label htmlFor="library-tag-search" className="mb-2 block text-xs font-semibold text-knight-300">Filter by tag</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-knight-500" aria-hidden="true" />
                <input
                  ref={tagSearchRef}
                  id="library-tag-search"
                  type="search"
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  placeholder="Search tags…"
                  className="min-h-11 w-full rounded-xl border border-knight-700 bg-void-950 pl-9 pr-3 text-sm text-mist-100 placeholder:text-knight-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-maroon-400"
                />
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto overscroll-contain" role="group" aria-label="Available tags">
                <button
                  type="button"
                  aria-pressed={selectedTag === null}
                  onClick={() => selectTag(null)}
                  className={`min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm touch-fast ${selectedTag === null ? 'bg-knight-700 text-mist-100' : 'text-knight-300 hover:bg-void-800 hover:text-mist-100'}`}
                >
                  All tags
                </button>
                {visibleTags.length > 0 ? visibleTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    aria-pressed={selectedTag === tag}
                    onClick={() => selectTag(selectedTag === tag ? null : tag)}
                    className={`min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm touch-fast ${selectedTag === tag ? 'bg-maroon-950/70 text-maroon-200' : 'text-knight-300 hover:bg-void-800 hover:text-mist-100'}`}
                  >
                    #{tag}
                  </button>
                )) : (
                  <p className="px-3 py-4 text-sm text-knight-400">No tags match that search.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
