export default function FacesPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center px-8 py-32">
      <div className="w-16 h-16 rounded-2xl bg-white/6 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-white/60 mb-2">Faces</h1>
      <p className="text-sm text-white/25 max-w-xs leading-relaxed">
        Browse and name the people in your photos using on-device face clustering.
        Coming soon.
      </p>
    </div>
  );
}
