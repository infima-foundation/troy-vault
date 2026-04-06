export default function AlbumsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center px-8 py-32">
      <div className="w-16 h-16 rounded-2xl bg-white/6 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-white/60 mb-2">Albums</h1>
      <p className="text-sm text-white/25 max-w-xs leading-relaxed">
        Smart albums grouped by date and place, plus collections you create yourself.
        Coming in a future release.
      </p>
    </div>
  );
}
