export default function PlacesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center px-8 py-32">
      <div className="w-16 h-16 rounded-2xl bg-white/6 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-white/60 mb-2">Places</h1>
      <p className="text-sm text-white/25 max-w-xs leading-relaxed">
        Explore your memories on a map using GPS coordinates extracted from your photos.
        Coming soon.
      </p>
    </div>
  );
}
