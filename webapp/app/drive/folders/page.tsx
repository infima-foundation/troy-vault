"use client";

import Link from "next/link";

export default function FoldersPage() {
  return (
    <div className="min-h-full bg-white">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-4">
        <Link href="/drive" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Folders</h1>
      </div>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-yellow-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
        </div>
        <p className="text-gray-700 font-semibold text-lg mb-1">Folders</p>
        <p className="text-sm text-gray-400 max-w-sm">
          Folder organization is coming soon. For now, you can create folders from the Drive page to organize your files visually.
        </p>
        <Link
          href="/drive"
          className="mt-6 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors"
        >
          Go to Drive
        </Link>
      </div>
    </div>
  );
}
