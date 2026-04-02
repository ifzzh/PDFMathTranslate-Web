# PDF Babel Web

This frontend is maintained as the PDF Babel web fork of `PDFMathTranslate-Web`.
It keeps the upstream single-page translation UX, but it is wired to the PDF Babel backend and its `/v1` compatibility layer backed by BabelDOC.

## Features

- PDF upload and translation with math content preservation
- BabelDOC-backed translation services exposed from the parent backend
- 11 target languages supported by the current UI
- Mono and dual-page download formats
- Batch queue and recent translation history
- Recent files tracking

## Tech Stack

- Vue 3 (Composition API + `<script setup>`)
- Vite
- Tailwind CSS
- Reka UI
- vue-pdf-embed
- Vue i18n
- Axios

## Getting Started

```bash
npm install
npm run dev -- --host
```

The dev server proxies both `/v1` and `/api` to `http://localhost:8000`.
For normal development inside the parent repository, initialize the submodule first:

```bash
git submodule update --init --recursive
```

## Build

```bash
npm run build
```
