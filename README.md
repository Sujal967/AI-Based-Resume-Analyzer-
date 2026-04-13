# AI Resume Analyzer (Interactive)

An interactive, AI-style resume analyzer that works locally.

## Features

- Resume **score (0–100)** + breakdown
- Extracted **skillset** with evidence + confidence
- **Improvements** (actionable, prioritized)
- **Job suggestions** (role fit + missing skills)
- Supports **paste text** or **upload PDF/DOCX**

## Run (recommended: single command)

```powershell
cd c:\Users\dell\OneDrive\Desktop\dtiproject
npm run install:all
npm run dev
```

This starts:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8080`

## Run (2 terminals)

### 1) Backend API

```powershell
cd server
npm install
npm run dev
```

API runs on `http://localhost:8080`.

### 2) Frontend

```powershell
cd client
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

## Notes

- No external AI keys required.
- If PDF extraction is weak, export your resume as a selectable-text PDF.

