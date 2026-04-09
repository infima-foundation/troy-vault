# Supabase + Clerk Auth Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Clerk (identity/auth) and Supabase (Postgres database) into troy-vault so every page requires sign-in and all DB data lives in Supabase.

**Architecture:** Clerk handles auth via middleware that protects all routes except `/sign-in` and `/sign-up`. The backend switches its SQLAlchemy engine from SQLite to Supabase Postgres using the connection string from env. `user_id` (nullable String) is added to Asset, Conversation, and Folder so ownership can be tracked later.

**Tech Stack:** `@clerk/nextjs`, `@supabase/supabase-js` (frontend), `supabase` (Python, backend), FastAPI/SQLAlchemy (backend), Next.js 14 App Router.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `webapp/.env.local` | Add Clerk + Supabase public keys |
| Modify | `backend/.env` | Add Supabase URL, service key, Postgres DATABASE_URL |
| Create | `webapp/middleware.ts` | Clerk route protection (root level, NOT src/) |
| Create | `webapp/app/sign-in/[[...sign-in]]/page.tsx` | Clerk-hosted sign-in UI |
| Create | `webapp/app/sign-up/[[...sign-up]]/page.tsx` | Clerk-hosted sign-up UI |
| Modify | `webapp/app/layout.tsx` | Wrap with ClerkProvider |
| Modify | `webapp/app/components/Sidebar.tsx` | Replace profile link with UserButton |
| Modify | `backend/models.py` | Add `user_id` column to Asset, Conversation, Folder |
| Modify | `backend/main.py` | Add user_id migrations, filter by user_id on GET endpoints |

---

## Task 1: Install Frontend Dependencies

**Files:**
- Modify: `webapp/package.json` (via npm install)

- [ ] **Step 1: Install Clerk and Supabase npm packages**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault/webapp
npm install @supabase/supabase-js @clerk/nextjs
```

Expected output: packages added, no peer dependency errors.

- [ ] **Step 2: Verify packages are in package.json**

```bash
grep -E '"@clerk/nextjs"|"@supabase/supabase-js"' /Users/mauriciovallartapena/troy-vault/troy-vault/webapp/package.json
```

Expected: both lines present.

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add webapp/package.json webapp/package-lock.json
git commit -m "chore: install @clerk/nextjs and @supabase/supabase-js"
```

---

## Task 2: Install Backend Dependency

**Files:**
- Modify: `backend/requirements.txt` (via pip install)

- [ ] **Step 1: Activate venv and install supabase**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault/backend
source venv/bin/activate && pip install supabase
```

- [ ] **Step 2: Pin the version in requirements.txt**

```bash
source venv/bin/activate && pip show supabase | grep Version
```

Add the line to `backend/requirements.txt`:
```
supabase>=2.0.0
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/requirements.txt
git commit -m "chore: add supabase python package"
```

---

## Task 3: Configure Environment Files

**Files:**
- Modify: `webapp/.env.local`
- Modify: `backend/.env`

- [ ] **Step 1: Update webapp/.env.local**

Replace the entire contents of `webapp/.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://qlgvougzfuvylmxqoxlg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[paste anon key here]
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=[paste from Clerk dashboard]
CLERK_SECRET_KEY=[paste from Clerk dashboard]
NEXT_PUBLIC_API_URL=http://localhost:8000
```

(User fills in the bracketed values — do NOT commit this file.)

- [ ] **Step 2: Update backend/.env**

Replace the entire contents of `backend/.env` with:

```
SUPABASE_URL=https://qlgvougzfuvylmxqoxlg.supabase.co
SUPABASE_SERVICE_KEY=[paste service_role key here]
DATABASE_URL=[paste Postgres connection string here]
```

Format for DATABASE_URL is: `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

(User fills in the bracketed values — do NOT commit this file.)

- [ ] **Step 3: Verify .env.local and .env are in .gitignore**

```bash
grep -E "\.env" /Users/mauriciovallartapena/troy-vault/troy-vault/.gitignore
```

If neither `.env` nor `.env.local` appear, add them:
```bash
echo "backend/.env" >> /Users/mauriciovallartapena/troy-vault/troy-vault/.gitignore
echo "webapp/.env.local" >> /Users/mauriciovallartapena/troy-vault/troy-vault/.gitignore
git add .gitignore && git commit -m "chore: ensure .env files are gitignored"
```

---

## Task 4: Create Clerk Middleware

**Files:**
- Create: `webapp/middleware.ts` (root of webapp/, same level as `app/`)

> NOTE: `webapp/src/` does NOT exist. Middleware must live at `webapp/middleware.ts`, not `webapp/src/middleware.ts`.

- [ ] **Step 1: Create webapp/middleware.ts**

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect()
})

export const config = { matcher: ['/((?!_next|.*\\..*).*)'] }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add webapp/middleware.ts
git commit -m "feat: add Clerk auth middleware protecting all non-public routes"
```

---

## Task 5: Create Sign-in and Sign-up Pages

**Files:**
- Create: `webapp/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `webapp/app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Create sign-in page**

```bash
mkdir -p /Users/mauriciovallartapena/troy-vault/troy-vault/webapp/app/sign-in/'[[...sign-in]]'
```

Create `webapp/app/sign-in/[[...sign-in]]/page.tsx`:

```typescript
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignIn />
    </div>
  )
}
```

- [ ] **Step 2: Create sign-up page**

```bash
mkdir -p /Users/mauriciovallartapena/troy-vault/troy-vault/webapp/app/sign-up/'[[...sign-up]]'
```

Create `webapp/app/sign-up/[[...sign-up]]/page.tsx`:

```typescript
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignUp />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add webapp/app/sign-in webapp/app/sign-up
git commit -m "feat: add Clerk sign-in and sign-up pages"
```

---

## Task 6: Wrap Layout with ClerkProvider

**Files:**
- Modify: `webapp/app/layout.tsx`

Current file wraps children with `SentryErrorBoundary > UploadProvider > Sidebar`.
ClerkProvider must be the outermost wrapper (wrapping the entire `<html>` element).

- [ ] **Step 1: Update webapp/app/layout.tsx**

Replace the entire file with:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs'
import { Sidebar } from "./components/Sidebar";
import { UploadProvider } from "./components/UploadProvider";
import { SentryErrorBoundary } from "./components/SentryErrorBoundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TROY",
  description: "Local-first personal media vault by Infima Foundation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
        <body className="h-full flex bg-gray-50 text-gray-900 antialiased">
          <SentryErrorBoundary>
            <UploadProvider>
              <Sidebar />
              <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
            </UploadProvider>
          </SentryErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add webapp/app/layout.tsx
git commit -m "feat: wrap app layout with ClerkProvider"
```

---

## Task 7: Add UserButton to Sidebar

**Files:**
- Modify: `webapp/app/components/Sidebar.tsx` (lines ~365-381)

Replace the static profile link at the bottom of the sidebar with Clerk's `UserButton`.

- [ ] **Step 1: Add UserButton import to Sidebar.tsx**

Find the existing imports at the top of `webapp/app/components/Sidebar.tsx` and add:

```typescript
import { UserButton } from '@clerk/nextjs'
```

- [ ] **Step 2: Replace the bottom profile section**

Find this block (around lines 365-381):

```typescript
      {/* Bottom: user avatar */}
      <div className="border-t border-gray-100 p-3 shrink-0">
        <Link
          href="/profile"
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-white">{initials(userName)}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{userName || "Your profile"}</p>
              <p className="text-xs text-gray-400 group-hover:text-gray-500 transition-colors">Profile &amp; Settings</p>
            </div>
          )}
        </Link>
      </div>
```

Replace with:

```typescript
      {/* Bottom: user avatar */}
      <div className="border-t border-gray-100 p-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2">
          <UserButton afterSignOutUrl="/sign-in" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{userName || "Your profile"}</p>
              <p className="text-xs text-gray-400">Profile &amp; Settings</p>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add webapp/app/components/Sidebar.tsx
git commit -m "feat: replace sidebar profile link with Clerk UserButton"
```

---

## Task 8: Add user_id to Database Models

**Files:**
- Modify: `backend/models.py`

Add a nullable `user_id` String column to `Asset`, `Conversation`, and `Folder`.

- [ ] **Step 1: Add user_id to Asset model**

In `backend/models.py`, in the `Asset` class after the `folder_id` column (around line 63), add:

```python
    # Owner
    user_id = Column(String(256), nullable=True, index=True)
```

- [ ] **Step 2: Add user_id to Folder model**

In `backend/models.py`, in the `Folder` class after the `updated_at` column (around line 85), add:

```python
    user_id = Column(String(256), nullable=True, index=True)
```

- [ ] **Step 3: Add user_id to Conversation model**

In `backend/models.py`, in the `Conversation` class after the `updated_at` column (around line 127), add:

```python
    user_id = Column(String(256), nullable=True, index=True)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/models.py
git commit -m "feat: add nullable user_id column to Asset, Folder, Conversation models"
```

---

## Task 9: Update Backend — Postgres + user_id Migrations + Filtering

**Files:**
- Modify: `backend/main.py`

Three changes: (a) add user_id migrations, (b) add user_id query param to list_assets and list_folders, (c) confirm Postgres engine path is active (already handled by existing env var logic at line 36-40).

- [ ] **Step 1: Add user_id migrations to _MIGRATIONS list**

In `backend/main.py`, find `_MIGRATIONS = [` and add three entries:

```python
_MIGRATIONS = [
    "ALTER TABLE assets ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE",
    "ALTER TABLE assets ADD COLUMN deleted_at DATETIME",
    "ALTER TABLE assets ADD COLUMN is_starred BOOLEAN DEFAULT FALSE",
    "ALTER TABLE conversations ADD COLUMN is_starred BOOLEAN DEFAULT FALSE",
    "ALTER TABLE assets ADD COLUMN folder_id VARCHAR(36)",
    "ALTER TABLE assets ADD COLUMN user_id VARCHAR(256)",
    "ALTER TABLE folders ADD COLUMN user_id VARCHAR(256)",
    "ALTER TABLE conversations ADD COLUMN user_id VARCHAR(256)",
]
```

- [ ] **Step 2: Add user_id filter to list_assets**

Find the `list_assets` function signature (around line 114). Add `user_id` as an optional query param and filter:

```python
@app.get("/api/v1/assets")
def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    file_type: FileType | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tags: str | None = Query(None),
    deleted: bool = Query(False, description="If true, return only soft-deleted assets"),
    folder_id: str | None = Query(None, description="Filter by folder; 'root' for top-level only"),
    user_id: str | None = Query(None, description="Filter by owner user ID"),
    db: Session = Depends(get_db),
):
    stmt = select(Asset)

    if deleted:
        stmt = stmt.where(Asset.is_deleted == True)
    else:
        stmt = stmt.where(Asset.is_deleted == False)

    if user_id:
        stmt = stmt.where(Asset.user_id == user_id)

    if folder_id == "root":
        stmt = stmt.where(Asset.folder_id == None)
    elif folder_id:
        try:
            fid = _uuid.UUID(folder_id)
            stmt = stmt.where(Asset.folder_id == fid)
        except ValueError:
            pass

    if file_type:
        stmt = stmt.where(Asset.file_type == file_type)
    if date_from:
        stmt = stmt.where(Asset.captured_at >= date_from)
    if date_to:
        stmt = stmt.where(Asset.captured_at <= date_to)
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        stmt = stmt.where(
            or_(*[Asset.tags.any(value=t) for t in tag_list])
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(
        stmt.order_by(Asset.ingested_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_asset_summary(a) for a in rows],
    }
```

- [ ] **Step 3: Add user_id filter to list_folders**

Find the `list_folders` function (around line 523). Add `user_id` param and filter:

```python
@app.get("/api/v1/folders")
def list_folders(
    parent_id: str | None = Query(None, description="'root' for top-level, or a UUID"),
    user_id: str | None = Query(None, description="Filter by owner user ID"),
    db: Session = Depends(get_db),
):
    stmt = select(Folder)
    if parent_id == "all":
        pass
    elif parent_id == "root" or parent_id is None:
        stmt = stmt.where(Folder.parent_id == None)
    else:
        try:
            pid = _uuid.UUID(parent_id)
            stmt = stmt.where(Folder.parent_id == pid)
        except ValueError:
            stmt = stmt.where(Folder.parent_id == None)
    if user_id:
        stmt = stmt.where(Folder.user_id == user_id)
    folders = db.scalars(stmt.order_by(Folder.name)).all()
    return [_folder_out(f) for f in folders]
```

- [ ] **Step 4: Commit**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault
git add backend/main.py
git commit -m "feat: add user_id migrations and optional user_id filtering on assets/folders"
```

---

## Task 10: Verify Full Flow

- [ ] **Step 1: Confirm .env files have real values filled in**

The user must have filled in all bracketed values in `webapp/.env.local` and `backend/.env` before this step.

- [ ] **Step 2: Start backend**

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault/backend
source venv/bin/activate && uvicorn main:app --reload --port 8000
```

Expected: `Application startup complete.` with no migration errors.

- [ ] **Step 3: Start frontend**

In a second terminal:

```bash
cd /Users/mauriciovallartapena/troy-vault/troy-vault/webapp
npm run dev
```

Expected: `✓ Ready` on port 3000.

- [ ] **Step 4: Test redirect to sign-in**

Open `http://localhost:3000` in a browser. Expected: redirect to `/sign-in`.

- [ ] **Step 5: Create account and verify home screen**

Sign up with your email. Expected: land on TROY home screen after sign-in. Clerk UserButton visible in sidebar bottom.

- [ ] **Step 6: Upload a photo**

Drag or upload a photo. Expected: appears in gallery. Confirm via:

```bash
curl http://localhost:8000/api/v1/assets | python3 -m json.tool | grep filename
```

- [ ] **Step 7: Report results**

Note which steps worked and which did not, with any error messages from the browser console or terminal.
