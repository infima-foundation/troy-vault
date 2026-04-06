"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "troy_profile";

interface Profile {
  name: string;
  occupation: string;
  about: string;
  language: string;
  tone: "formal" | "casual" | "concise";
}

const DEFAULT_PROFILE: Profile = {
  name: "",
  occupation: "",
  about: "",
  language: "en",
  tone: "casual",
};

function loadProfile(): Profile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  function handleChange(field: keyof Profile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-sm text-white/35 mt-1">
          This profile is sent to TROY with every conversation so it can personalise responses.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="e.g. Alex"
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>

        {/* Occupation */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-2">
            Occupation
          </label>
          <input
            type="text"
            value={profile.occupation}
            onChange={(e) => handleChange("occupation", e.target.value)}
            placeholder="e.g. Software Engineer"
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>

        {/* About */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-2">
            About You
          </label>
          <textarea
            value={profile.about}
            onChange={(e) => handleChange("about", e.target.value)}
            placeholder="Tell TROY who you are — your interests, how you work, what you care about..."
            rows={4}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/20 transition-colors resize-none"
          />
        </div>

        {/* Language */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-2">
            Language Preference
          </label>
          <select
            value={profile.language}
            onChange={(e) => handleChange("language", e.target.value)}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/20 transition-colors appearance-none"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
          </select>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-3">
            How TROY Should Speak to You
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["formal", "casual", "concise"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleChange("tone", t)}
                className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors capitalize ${
                  profile.tone === t
                    ? "bg-white text-black border-white"
                    : "bg-[#1a1a1a] text-white/50 border-white/10 hover:border-white/20 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-white/25 min-h-[1.25rem]">
            {profile.tone === "formal" && "Professional language, structured responses."}
            {profile.tone === "casual" && "Friendly and conversational — like talking to a colleague."}
            {profile.tone === "concise" && "Short answers only. No fluff."}
          </div>
        </div>

        {/* Save */}
        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
          >
            Save Settings
          </button>
          {saved && (
            <span className="text-sm text-emerald-400 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
